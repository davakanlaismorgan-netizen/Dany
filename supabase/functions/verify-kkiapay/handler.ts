import { buildCors, jsonResponse } from "../_shared/http.ts";
import {
  type ActivatePlan,
  fetchTransaction,
  isValidTransactionId,
  KkiapayError,
  paymentMethod,
  planForAmount,
  providerName,
  readConfig,
} from "../_shared/kkiapay.ts";

export interface VerifyDeps {
  env: (key: string) => string | undefined;
  fetch: typeof fetch;
  // Renvoie l'identifiant de l'utilisateur authentifié par le jeton, ou null.
  getUserId: (authHeader: string) => Promise<string | null>;
  activatePlan: ActivatePlan;
  // Limitation de débit par utilisateur : false si la limite est atteinte. Peut lever (échec = refus, voir ci-dessous).
  allowAttempt: (userId: string) => Promise<boolean>;
}

// Appelée par le navigateur juste après le paiement. Le client n'envoie QUE la référence de
// transaction : le montant, le statut et donc le plan viennent de KKiaPay, jamais du client.
export async function handleVerify(req: Request, deps: VerifyDeps): Promise<Response> {
  const cors = buildCors(req, deps.env("ALLOWED_ORIGINS"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return jsonResponse(cors, { verified: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  const userId = authHeader ? await deps.getUserId(authHeader) : null;
  if (!userId) return jsonResponse(cors, { verified: false, error: "unauthorized" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(cors, { verified: false, error: "invalid_request" }, 400);
  }
  const transactionId = (body as { transactionId?: unknown } | null)?.transactionId;
  if (!isValidTransactionId(transactionId)) {
    return jsonResponse(cors, { verified: false, error: "invalid_request" }, 400);
  }

  // Avant tout appel à KKiaPay : un compte ne peut pas faire consommer l'API avec des références inventées.
  let allowed: boolean;
  try {
    allowed = await deps.allowAttempt(userId);
  } catch (e) {
    console.error("verify-kkiapay: limitation de débit indisponible:", e);
    return jsonResponse(cors, { verified: false, error: "server_error" }, 500); // on échoue fermé
  }
  if (!allowed) {
    return new Response(JSON.stringify({ verified: false, error: "rate_limited" }), {
      status: 429,
      headers: { ...cors, "Content-Type": "application/json", "Retry-After": "600" },
    });
  }

  const cfg = readConfig(deps.env);
  if (!cfg) {
    console.error("verify-kkiapay: clés KKiaPay manquantes dans les secrets de la fonction");
    return jsonResponse(cors, { verified: false, error: "server_error" }, 500);
  }

  let tx;
  try {
    tx = await fetchTransaction(cfg, transactionId, deps.fetch);
  } catch (err) {
    if (err instanceof KkiapayError) {
      console.error(`verify-kkiapay: KKiaPay injoignable ou réponse invalide (${err.code})`);
      return jsonResponse(cors, { verified: false, error: "provider_unavailable" }, 502);
    }
    throw err;
  }

  if (tx.status !== "SUCCESS") {
    return jsonResponse(cors, { verified: false, error: "payment_not_successful" }, 400);
  }
  const plan = planForAmount(tx.amount);
  if (!plan || tx.amount === null) {
    return jsonResponse(cors, { verified: false, error: "amount_mismatch" }, 400);
  }

  const result = await deps.activatePlan({
    userId,
    plan,
    provider: providerName(cfg),
    transactionId,
    amount: tx.amount,
    method: paymentMethod(tx.source),
  });

  if (result.error) {
    if (result.error.includes("transaction_already_used")) {
      return jsonResponse(cors, { verified: false, error: "already_used" }, 409);
    }
    console.error("verify-kkiapay: activation impossible:", result.error);
    return jsonResponse(cors, { verified: false, error: "server_error" }, 500);
  }

  return jsonResponse(cors, { verified: true, plan, expires_at: result.expiresAt });
}
