import {
  type ActivatePlan,
  fetchTransaction,
  isUuid,
  isValidTransactionId,
  KkiapayError,
  paymentMethod,
  planForAmount,
  providerName,
  readConfig,
  safeEqual,
} from "../_shared/kkiapay.ts";

export interface WebhookDeps {
  env: (key: string) => string | undefined;
  fetch: typeof fetch;
  activatePlan: ActivatePlan;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Notification serveur-à-serveur de KKiaPay : filet de sécurité si le client ferme l'onglet
// avant d'appeler verify-kkiapay. Rien du contenu reçu n'est cru : on vérifie la signature,
// puis on redemande à KKiaPay le statut et le montant de la transaction.
//
// Codes de retour : KKiaPay réessaie 5 fois si la réponse n'est pas 2xx.
//   - 401 : signature invalide (jamais réessayé utilement)
//   - 200 : traité, ou ignoré volontairement (événement non pertinent, doublon)
//   - 5xx : erreur transitoire (KKiaPay injoignable, base indisponible) -> nouvel essai souhaité
export async function handleWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expected = deps.env("KKIAPAY_WEBHOOK_SECRET");
  if (!expected) {
    console.error("kkiapay-webhook: KKIAPAY_WEBHOOK_SECRET manquant");
    return json({ error: "server_error" }, 500);
  }
  const received = req.headers.get("x-kkiapay-secret") ?? "";
  if (!safeEqual(received, expected)) return json({ error: "unauthorized" }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

  if (payload.event !== "transaction.success") return json({ ignored: "event" });

  const transactionId = payload.transactionId;
  const userId = payload.partnerId;
  if (!isValidTransactionId(transactionId)) return json({ error: "invalid_request" }, 400);
  if (!isUuid(userId)) {
    // Paiement sans utilisateur identifiable : la vérification côté client (verify-kkiapay)
    // reste la voie normale. On trace pour pouvoir traiter le cas à la main.
    console.error(`kkiapay-webhook: transaction ${transactionId} sans partnerId valide`);
    return json({ ignored: "no_user" });
  }

  const cfg = readConfig(deps.env);
  if (!cfg) {
    console.error("kkiapay-webhook: clés KKiaPay manquantes");
    return json({ error: "server_error" }, 500);
  }

  let tx;
  try {
    tx = await fetchTransaction(cfg, transactionId, deps.fetch);
  } catch (err) {
    if (err instanceof KkiapayError) return json({ error: "provider_unavailable" }, 502);
    throw err;
  }

  if (tx.status !== "SUCCESS") return json({ ignored: "not_success" });
  const plan = planForAmount(tx.amount);
  if (!plan || tx.amount === null) {
    console.error(`kkiapay-webhook: montant inattendu pour ${transactionId}`);
    return json({ ignored: "amount_mismatch" });
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
      // Déjà attribuée à un autre compte (par exemple par la voie client) : rien à refaire.
      console.error(`kkiapay-webhook: transaction ${transactionId} déjà utilisée par un autre compte`);
      return json({ ignored: "already_used" });
    }
    console.error("kkiapay-webhook: activation impossible:", result.error);
    return json({ error: "server_error" }, 500);
  }
  return json({ ok: true });
}
