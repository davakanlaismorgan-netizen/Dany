import assert from "node:assert/strict";
import type { ActivatePlanArgs } from "../_shared/kkiapay.ts";
import { handleWebhook, type WebhookDeps } from "./handler.ts";

const USER = "aaaaaaaa-0000-0000-0000-00000000000a";
const ENV: Record<string, string> = {
  KKIAPAY_PUBLIC_KEY: "pub", KKIAPAY_PRIVATE_KEY: "priv", KKIAPAY_SECRET_KEY: "sec", KKIAPAY_WEBHOOK_SECRET: "hook-secret",
};

function setup(over: { tx?: unknown; env?: Record<string, string>; activate?: WebhookDeps["activatePlan"]; fetchFails?: boolean } = {}) {
  const calls: ActivatePlanArgs[] = [];
  let fetched = 0;
  const deps: WebhookDeps = {
    env: (k) => (over.env ?? ENV)[k],
    fetch: () => {
      fetched++;
      if (over.fetchFails) return Promise.reject(new Error("réseau"));
      return Promise.resolve(new Response(JSON.stringify(over.tx ?? { status: "SUCCESS", amount: 17900, source: "CARD" })));
    },
    activatePlan: over.activate ?? ((a) => { calls.push(a); return Promise.resolve({ expiresAt: "x", error: null }); }),
  };
  return { deps, calls, fetched: () => fetched };
}
const hook = (body: unknown, secret: string | null = "hook-secret") =>
  new Request("https://f/hook", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(secret === null ? {} : { "x-kkiapay-secret": secret }) },
    body: JSON.stringify(body),
  });
const OK_BODY = { event: "transaction.success", transactionId: "TX12345", partnerId: USER, amount: 17900 };

Deno.test("signature absente ou fausse => 401, aucun appel sortant ni activation", async () => {
  for (const secret of [null, "", "faux", "Hook-Secret", "hook-secre"]) {
    const { deps, calls, fetched } = setup();
    const res = await handleWebhook(hook(OK_BODY, secret), deps);
    assert.equal(res.status, 401, `secret=${JSON.stringify(secret)}`);
    assert.equal(calls.length + fetched(), 0);
  }
});

Deno.test("secret du webhook non configuré => 500 (jamais d'acceptation par défaut)", async () => {
  const { deps } = setup({ env: { KKIAPAY_PUBLIC_KEY: "a", KKIAPAY_PRIVATE_KEY: "b", KKIAPAY_SECRET_KEY: "c" } });
  assert.equal((await handleWebhook(hook(OK_BODY, ""), deps)).status, 500);
});

Deno.test("succès : activation pour l'utilisateur du partnerId, montant issu de l'API KKiaPay", async () => {
  const { deps, calls } = setup();
  const res = await handleWebhook(hook(OK_BODY), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(calls, [{ userId: USER, plan: "premium", provider: "kkiapay", transactionId: "TX12345", amount: 17900, method: "card" }]);
});

Deno.test("ATTAQUE: payload falsifié (montant 17 900 annoncé, 5 XOF réels) => ignoré", async () => {
  const { deps, calls } = setup({ tx: { status: "SUCCESS", amount: 5 } });
  const res = await handleWebhook(hook({ ...OK_BODY, amount: 17900 }), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ignored: "amount_mismatch" });
  assert.equal(calls.length, 0);
});

Deno.test("ATTAQUE: payload annonce un succès mais KKiaPay dit FAILED => ignoré", async () => {
  const { deps, calls } = setup({ tx: { status: "FAILED", amount: 17900 } });
  assert.deepEqual(await (await handleWebhook(hook(OK_BODY), deps)).json(), { ignored: "not_success" });
  assert.equal(calls.length, 0);
});

Deno.test("événements non pertinents et partnerId invalide : acquittés (200) sans effet", async () => {
  const a = setup();
  assert.deepEqual(await (await handleWebhook(hook({ ...OK_BODY, event: "transaction.failed" }), a.deps)).json(), { ignored: "event" });
  const b = setup();
  const r = await handleWebhook(hook({ ...OK_BODY, partnerId: "pas-un-uuid" }), b.deps);
  assert.equal(r.status, 200);
  assert.equal(b.calls.length + b.fetched(), 0);
  const c = setup();
  assert.equal((await handleWebhook(hook({ ...OK_BODY, transactionId: "../x" }), c.deps)).status, 400);
});

Deno.test("erreurs transitoires => 5xx (KKiaPay réessaiera) ; doublon => 200", async () => {
  const down = setup({ fetchFails: true });
  assert.equal((await handleWebhook(hook(OK_BODY), down.deps)).status, 502);

  const dbDown = setup({ activate: () => Promise.resolve({ expiresAt: null, error: "connection refused" }) });
  assert.equal((await handleWebhook(hook(OK_BODY), dbDown.deps)).status, 500);

  const dup = setup({ activate: () => Promise.resolve({ expiresAt: null, error: "transaction_already_used" }) });
  const res = await handleWebhook(hook(OK_BODY), dup.deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ignored: "already_used" });
});

Deno.test("méthode GET refusée", async () => {
  const { deps } = setup();
  assert.equal((await handleWebhook(new Request("https://f/hook"), deps)).status, 405);
});
