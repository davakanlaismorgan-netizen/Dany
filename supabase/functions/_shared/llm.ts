// Appels aux fournisseurs LLM (Anthropic, OpenAI) avec la clé de l'utilisateur. Aucun SDK : fetch direct.
// La clé n'est jamais journalisée ni renvoyée ; les erreurs du fournisseur sont réduites à un code.

export type Provider = "anthropic" | "openai";
export const PROVIDERS: Provider[] = ["anthropic", "openai"];
export interface ChatMessage { role: "user" | "assistant"; content: string }
export type LlmErrorCode = "invalid_key" | "rate_limited" | "provider_error" | "network";
export type LlmResult = { ok: true; text: string } | { ok: false; code: LlmErrorCode };

// Modèles par défaut ; modifiables sans redéployer le code (secrets AI_ANTHROPIC_MODEL / AI_OPENAI_MODEL).
export const DEFAULT_MODELS: Record<Provider, string> = { anthropic: "claude-sonnet-5-5", openai: "gpt-4.1-mini" };
export const MAX_OUTPUT_TOKENS = 1200;
export const LLM_TIMEOUT_MS = 50_000;

export const modelFor = (p: Provider, env: (k: string) => string | undefined): string => {
  const o = (p === "anthropic" ? env("AI_ANTHROPIC_MODEL") : env("AI_OPENAI_MODEL"))?.trim();
  return o && /^[A-Za-z0-9._:-]{1,80}$/.test(o) ? o : DEFAULT_MODELS[p];
};

// Une clé plausible : ASCII imprimable sans espace, longueur raisonnable.
export function isPlausibleKey(k: unknown): k is string {
  if (typeof k !== "string" || k.length < 20 || k.length > 300) return false;
  for (let i = 0; i < k.length; i++) {
    const c = k.charCodeAt(i);
    if (c <= 32 || c >= 127) return false;
  }
  return true;
}

function toCode(status: number): LlmErrorCode {
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 429) return "rate_limited";
  return "provider_error";
}

async function post(url: string, headers: Record<string, string>, body: unknown, fetchFn: typeof fetch) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function callLlm(
  provider: Provider, apiKey: string, model: string, system: string, messages: ChatMessage[], fetchFn: typeof fetch = fetch,
): Promise<LlmResult> {
  try {
    if (provider === "anthropic") {
      const res = await post("https://api.anthropic.com/v1/messages",
        { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        { model, max_tokens: MAX_OUTPUT_TOKENS, system, messages }, fetchFn);
      if (!res.ok) { await res.body?.cancel(); return { ok: false, code: toCode(res.status) }; }
      const j = await res.json() as { content?: { type?: string; text?: string }[] };
      const text = (j.content ?? []).filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n").trim();
      return text ? { ok: true, text } : { ok: false, code: "provider_error" };
    }
    const res = await post("https://api.openai.com/v1/chat/completions",
      { authorization: `Bearer ${apiKey}` },
      { model, max_tokens: MAX_OUTPUT_TOKENS, messages: [{ role: "system", content: system }, ...messages] }, fetchFn);
    if (!res.ok) { await res.body?.cancel(); return { ok: false, code: toCode(res.status) }; }
    const j = await res.json() as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content?.trim() ?? "";
    return text ? { ok: true, text } : { ok: false, code: "provider_error" };
  } catch {
    return { ok: false, code: "network" };
  }
}

/** Vérifie une clé sans consommer de jetons (liste des modèles). */
export async function verifyKey(provider: Provider, apiKey: string, fetchFn: typeof fetch = fetch): Promise<"ok" | LlmErrorCode> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = provider === "anthropic"
      ? await fetchFn("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }, signal: ctrl.signal })
      : await fetchFn("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${apiKey}` }, signal: ctrl.signal });
    await res.body?.cancel();
    return res.ok ? "ok" : toCode(res.status);
  } catch {
    return "network";
  } finally {
    clearTimeout(timer);
  }
}
