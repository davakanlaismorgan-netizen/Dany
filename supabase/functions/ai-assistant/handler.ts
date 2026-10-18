import { buildCors, jsonResponse } from "../_shared/http.ts";
import { isUuid } from "../_shared/kkiapay.ts";
import { CryptoConfigError, decryptKey, importMasterKey } from "../_shared/aicrypto.ts";
import { buildFactsText, buildSystemPrompt, computeColumnStats, type FactsInput, MAX_STATS_ROWS } from "../_shared/facts.ts";
import { type ChatMessage, type LlmResult, modelFor, type Provider, PROVIDERS } from "../_shared/llm.ts";
import type { Table } from "../_shared/pipeline.ts";

export type Plan = "free" | "premium" | "enterprise";
// Messages par jour et par utilisateur. À garder cohérent avec docs/ASSISTANT.md et l'affichage du quota.
export const DAILY_LIMITS: Record<Plan, number> = { free: 10, premium: 200, enterprise: 1000 };
export const MAX_MESSAGE_CHARS = 4000;
export const MAX_STORED_MESSAGES = 60;
export const HISTORY_SENT = 10;

export interface StoredMessage { role: "user" | "assistant"; content: string; timestamp: string }
export interface Conversation { id: string; user_id: string; project_id: string | null; messages: StoredMessage[] }
export interface ProjectRow { id: string; user_id: string; name: string; description: string | null }
export interface ContextData {
  datasets: FactsInput["datasets"];
  models: FactsInput["models"];
  pipelines: number;
  visualizations: number;
  // Jeu de données choisi (ou le plus récent analysé) et son contenu, null si absent / trop gros / illisible.
  selected: { name: string; rows: number; table: Table | null; reason: "ok" | "too_large" | "unreadable" | "none" };
}
export interface AssistantDeps {
  env: (key: string) => string | undefined;
  now: () => Date;
  getUserId: (authHeader: string) => Promise<string | null>;
  canReadWorkspace: (authHeader: string, ownerId: string) => Promise<boolean>;
  getProject: (id: string) => Promise<ProjectRow | null>;
  // Plan de l'APPELANT (abonnement actif et non expiré), décidé par la base ; lève une erreur en cas de doute.
  getPlan: (userId: string) => Promise<Plan>;
  getKey: (userId: string) => Promise<{ provider: Provider; ciphertext: string } | null>;
  claim: (userId: string, kind: "message", limit: number) => Promise<{ allowed: boolean; used: number }>;
  release: (userId: string, kind: "message") => Promise<void>;
  loadContext: (projectId: string, datasetId: string | null) => Promise<ContextData>;
  getConversation: (id: string) => Promise<Conversation | null>;
  saveConversation: (c: { id: string | null; userId: string; projectId: string; title: string; messages: StoredMessage[] }) => Promise<{ id: string } | { error: string }>;
  llm: (provider: Provider, apiKey: string, model: string, system: string, messages: ChatMessage[]) => Promise<LlmResult>;
}

export async function handleAssistant(req: Request, deps: AssistantDeps): Promise<Response> {
  const cors = buildCors(req, deps.env("ALLOWED_ORIGINS"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return jsonResponse(cors, { error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  const userId = authHeader ? await deps.getUserId(authHeader) : null;
  if (!userId) return jsonResponse(cors, { error: "unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) ?? {};
  } catch { /* corps invalide */ }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (
    !isUuid(body.project_id) || (body.lang !== "fr" && body.lang !== "en") ||
    message === "" || message.length > MAX_MESSAGE_CHARS ||
    (body.dataset_id !== undefined && body.dataset_id !== null && !isUuid(body.dataset_id)) ||
    (body.conversation_id !== undefined && body.conversation_id !== null && !isUuid(body.conversation_id))
  ) {
    return jsonResponse(cors, { error: "invalid_request" }, 400);
  }
  const lang = body.lang as "fr" | "en";
  const datasetId = (body.dataset_id as string | null | undefined) ?? null;

  // Même réponse pour « inexistant » et « accès refusé ». Lecture autorisée : propriétaire ou membre de l'équipe.
  const project = await deps.getProject(body.project_id as string);
  if (!project) return jsonResponse(cors, { error: "not_found" }, 404);
  if (project.user_id !== userId && !(await deps.canReadWorkspace(authHeader!, project.user_id))) {
    return jsonResponse(cors, { error: "not_found" }, 404);
  }

  let conv: Conversation | null = null;
  if (body.conversation_id) {
    conv = await deps.getConversation(body.conversation_id as string);
    if (!conv || conv.user_id !== userId || conv.project_id !== project.id) return jsonResponse(cors, { error: "not_found" }, 404);
    if (conv.messages.length + 2 > MAX_STORED_MESSAGES) return jsonResponse(cors, { error: "conversation_full" }, 422);
  }

  let master: CryptoKey;
  try {
    master = await importMasterKey(deps.env("AI_KEY_ENCRYPTION_SECRET"));
  } catch (e) {
    if (e instanceof CryptoConfigError) {
      console.error("ai-assistant: AI_KEY_ENCRYPTION_SECRET absent ou invalide:", e.message);
      return jsonResponse(cors, { error: "not_configured" }, 503);
    }
    throw e;
  }

  let claimed = false;
  let secretKey = "";
  try {
    const stored = await deps.getKey(userId);
    if (!stored || !PROVIDERS.includes(stored.provider)) return jsonResponse(cors, { error: "no_key" }, 409);
    const apiKey = await decryptKey(master, userId, stored.ciphertext);
    if (!apiKey) return jsonResponse(cors, { error: "key_unreadable" }, 409);
    secretKey = apiKey;

    const plan = await deps.getPlan(userId);
    const limit = DAILY_LIMITS[plan];
    const claim = await deps.claim(userId, "message", limit);
    if (!claim.allowed) return jsonResponse(cors, { error: "quota", limit, used: claim.used }, 429);
    claimed = true;

    const ctx = await deps.loadContext(project.id, datasetId);
    let stats = null;
    if (ctx.selected.table && ctx.selected.table.rows.length <= MAX_STATS_ROWS) stats = computeColumnStats(ctx.selected.table);
    const facts = buildFactsText({
      project: { name: project.name, description: project.description },
      datasets: ctx.datasets, models: ctx.models, pipelines: ctx.pipelines, visualizations: ctx.visualizations,
      selected: {
        name: ctx.selected.name, rows: ctx.selected.table?.rows.length ?? ctx.selected.rows, stats,
        reason: stats ? "ok" : ctx.selected.table ? "too_large" : ctx.selected.reason === "ok" ? "unreadable" : ctx.selected.reason,
      },
    }, lang);

    // L'historique vient de la base, jamais du navigateur. Il doit commencer par un message de l'utilisateur.
    const past = (conv?.messages ?? []).slice(-HISTORY_SENT).map((m): ChatMessage => ({ role: m.role, content: m.content }));
    while (past.length > 0 && past[0].role !== "user") past.shift();
    const result = await deps.llm(stored.provider, apiKey, modelFor(stored.provider, deps.env), buildSystemPrompt(lang, facts), [...past, { role: "user", content: message }]);

    if (!result.ok) {
      await deps.release(userId, "message"); // le fournisseur a échoué : pas de message décompté
      claimed = false;
      const map = { invalid_key: "provider_invalid_key", rate_limited: "provider_rate_limited", provider_error: "provider_error", network: "provider_error" } as const;
      console.error("ai-assistant: échec du fournisseur LLM:", result.code);
      return jsonResponse(cors, { error: map[result.code] }, 502);
    }

    const ts = deps.now().toISOString();
    const messages: StoredMessage[] = [
      ...(conv?.messages ?? []),
      { role: "user", content: message, timestamp: ts },
      { role: "assistant", content: result.text, timestamp: ts },
    ];
    const saved = await deps.saveConversation({
      id: conv?.id ?? null, userId, projectId: project.id, title: conv ? "" : message.replace(/\s+/g, " ").slice(0, 60), messages,
    });
    const remaining = Math.max(limit - claim.used, 0);
    if ("error" in saved) {
      console.error("ai-assistant: conversation non enregistrée:", saved.error);
      return jsonResponse(cors, { reply: result.text, conversation_id: conv?.id ?? null, saved: false, remaining, limit, provider: stored.provider });
    }
    return jsonResponse(cors, {
      reply: result.text, conversation_id: saved.id, saved: true, remaining, limit, provider: stored.provider,
      dataset: ctx.selected.reason === "none" ? null : ctx.selected.name, stats_computed: stats !== null,
    });
  } catch (e) {
    if (claimed) await deps.release(userId, "message").catch(() => {});
    // Par précaution, la clé de l'utilisateur est masquée si elle apparaissait dans un message d'erreur.
    const msg = e instanceof Error ? e.message : "inconnue";
    console.error("ai-assistant: erreur inattendue:", secretKey ? msg.split(secretKey).join("[clé masquée]") : msg);
    return jsonResponse(cors, { error: "server_error" }, 500);
  }
}
