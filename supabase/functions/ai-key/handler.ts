import { buildCors, jsonResponse } from "../_shared/http.ts";
import { CryptoConfigError, encryptKey, importMasterKey } from "../_shared/aicrypto.ts";
import { isPlausibleKey, type LlmErrorCode, type Provider, PROVIDERS } from "../_shared/llm.ts";

// Enregistrer une clé déclenche un appel au fournisseur : on limite le nombre d'essais par jour pour que la
// fonction ne serve pas à tester des clés volées en série.
export const KEY_ATTEMPTS_PER_DAY = 10;

export interface KeyDeps {
  env: (key: string) => string | undefined;
  getUserId: (authHeader: string) => Promise<string | null>;
  claim: (userId: string, kind: "key", limit: number) => Promise<{ allowed: boolean; used: number }>;
  verify: (provider: Provider, apiKey: string) => Promise<"ok" | LlmErrorCode>;
  saveKey: (userId: string, provider: Provider, ciphertext: string, last4: string) => Promise<string | null>; // message d'erreur ou null
}

export async function handleAiKey(req: Request, deps: KeyDeps): Promise<Response> {
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
  if (!PROVIDERS.includes(body.provider as Provider) || !isPlausibleKey(body.api_key)) {
    return jsonResponse(cors, { error: "invalid_request" }, 400);
  }
  const provider = body.provider as Provider;
  const apiKey = body.api_key as string;

  let master: CryptoKey;
  try {
    master = await importMasterKey(deps.env("AI_KEY_ENCRYPTION_SECRET"));
  } catch (e) {
    if (e instanceof CryptoConfigError) {
      console.error("ai-key: AI_KEY_ENCRYPTION_SECRET absent ou invalide:", e.message);
      return jsonResponse(cors, { error: "not_configured" }, 503);
    }
    throw e;
  }

  try {
    const claim = await deps.claim(userId, "key", KEY_ATTEMPTS_PER_DAY);
    if (!claim.allowed) return jsonResponse(cors, { error: "too_many_attempts" }, 429);

    const check = await deps.verify(provider, apiKey);
    if (check === "invalid_key") return jsonResponse(cors, { error: "invalid_key" }, 422);
    if (check !== "ok" && check !== "rate_limited") return jsonResponse(cors, { error: "provider_error" }, 502);
    // « rate_limited » : la clé est reconnue mais le fournisseur limite le débit ; on l'accepte.

    const ciphertext = await encryptKey(master, userId, apiKey);
    const err = await deps.saveKey(userId, provider, ciphertext, apiKey.slice(-4));
    if (err) {
      console.error("ai-key: enregistrement impossible:", err);
      return jsonResponse(cors, { error: "server_error" }, 500);
    }
    return jsonResponse(cors, { saved: true, provider, last4: apiKey.slice(-4) });
  } catch (e) {
    console.error("ai-key: erreur inattendue:", e instanceof Error ? e.message : "inconnue");
    return jsonResponse(cors, { error: "server_error" }, 500);
  }
}
