import assert from "node:assert/strict";
import type { ActivatePlanArgs } from "../_shared/kkiapay.ts";
import { handleVerify, type VerifyDeps } from "./handler.ts";

const USER = "aaaaaaaa-0000-0000-0000-00000000000a";
const ENV: Record<string, string> = {
  KKIAPAY_PUBLIC_KEY: "pub", KKIAPAY_PRIVATE_KEY: "priv", KKIAPAY_SECRET_KEY: "sec",
  ALLOWED_ORIGINS: "https://das.example.com",
};

function setup(over: Omit<Partial<VerifyDeps>, "env"> & { tx?: unknown; env?: Record<string, string> } = {}) {
  const calls: ActivatePlanArgs[] = [];
  const urls: string[] = [];
  const deps: VerifyDeps = {
    env: (k) => (over.env ?? ENV)[k],
    fetch: (url) => {
      urls.push(String(url));
      return Promise.resolve(new Response(JSON.stringify(over.tx ?? { status: "SUCCESS", amount: 17900, source: "MOBILE_MONEY" })));
    },
    getUserId: over.getUserId ?? (() => Promise.resolve(USER)),
    activatePlan: over.activatePlan ?? ((a) => { calls.push(a); return Promise.resolve({ expiresAt: "2026-11-05T00:00:00Z", error: null }); }),
  };
  return { deps, calls, urls };
}
const post = (body: unknown, headers: Record<string, string> = { Authorization: "Bearer t" }) =>
  new Request("https://f/verify", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const err = async (r: Response) => (await r.json()).error;

Deno.test("paiement valide : Premium activé avec le montant et la méthode issus de KKiaPay", async () => {
  const { deps, calls, urls } = setup();
  const res = await handleVerify(post({ transactionId: "TX12345" }), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { verified: true, plan: "premium", expires_at: "2026-11-05T00:00:00Z" });
  assert.deepEqual(calls, [{ userId: USER, plan: "premium", provider: "kkiapay", transactionId: "TX12345", amount: 17900, method: "momo" }]);
  assert.equal(urls[0], "https://api.kkiapay.me/api/v1/transactions/status");
});

Deno.test("ATTAQUE: le client ne peut pas choisir son plan (plan=enterprise ignoré)", async () => {
  const { deps, calls } = setup();
  const res = await handleVerify(post({ transactionId: "TX12345", plan: "enterprise", amount: 0 }), deps);
  assert.equal(res.status, 200);
  assert.equal(calls[0].plan, "premium");
});

Deno.test("ATTAQUE: transaction réelle mais d'un autre montant (1 XOF, 2 900 XOF) refusée", async () => {
  for (const amount of [1, 2900, 17000, 100000]) {
    const { deps, calls } = setup({ tx: { status: "SUCCESS", amount } });
    const res = await handleVerify(post({ transactionId: "TX12345" }), deps);
    assert.equal(res.status, 400);
    assert.equal(await err(res), "amount_mismatch");
    assert.equal(calls.length, 0);
  }
});

Deno.test("transaction échouée ou introuvable : refusée", async () => {
  for (const status of ["FAILED", "TRANSACTION_NOT_FOUND", "PENDING", "REVERTED"]) {
    const { deps, calls } = setup({ tx: { status, amount: 17900 } });
    const res = await handleVerify(post({ transactionId: "TX12345" }), deps);
    assert.equal(res.status, 400);
    assert.equal(await err(res), "payment_not_successful");
    assert.equal(calls.length, 0);
  }
});

Deno.test("ATTAQUE: rejeu d'une transaction déjà utilisée => 409", async () => {
  const { deps } = setup({ activatePlan: () => Promise.resolve({ expiresAt: null, error: "transaction_already_used" }) });
  const res = await handleVerify(post({ transactionId: "TX12345" }), deps);
  assert.equal(res.status, 409);
  assert.equal(await err(res), "already_used");
});

Deno.test("authentification obligatoire", async () => {
  const { deps, calls } = setup();
  assert.equal((await handleVerify(post({ transactionId: "TX12345" }, {}), deps)).status, 401);
  const bad = setup({ getUserId: () => Promise.resolve(null) });
  assert.equal((await handleVerify(post({ transactionId: "TX12345" }), bad.deps)).status, 401);
  assert.equal(calls.length + bad.calls.length, 0);
});

Deno.test("entrées invalides", async () => {
  const { deps } = setup();
  for (const body of [{}, { transactionId: "" }, { transactionId: "../x" }, { transactionId: 42 }, { transactionId: "a".repeat(100) }]) {
    assert.equal((await handleVerify(post(body), deps)).status, 400);
  }
  const notJson = new Request("https://f/v", { method: "POST", headers: { Authorization: "Bearer t" }, body: "{pas json" });
  assert.equal((await handleVerify(notJson, deps)).status, 400);
  assert.equal((await handleVerify(new Request("https://f/v", { method: "GET" }), deps)).status, 405);
});

Deno.test("sandbox : explicite seulement, et tracé dans provider", async () => {
  const sb = setup({ env: { ...ENV, KKIAPAY_SANDBOX: "true" } });
  await handleVerify(post({ transactionId: "TX12345" }), sb.deps);
  assert.equal(sb.calls[0].provider, "kkiapay-sandbox");
  assert.equal(sb.urls[0], "https://api-sandbox.kkiapay.me/api/v1/transactions/status");
});

Deno.test("KKiaPay injoignable => 502 ; clés absentes => 500 sans appel", async () => {
  const down = setup();
  down.deps.fetch = () => Promise.reject(new Error("réseau"));
  const r1 = await handleVerify(post({ transactionId: "TX12345" }), down.deps);
  assert.equal(r1.status, 502);
  assert.equal(await err(r1), "provider_unavailable");

  const nokeys = setup({ env: { ALLOWED_ORIGINS: "x" } });
  const r2 = await handleVerify(post({ transactionId: "TX12345" }), nokeys.deps);
  assert.equal(r2.status, 500);
  assert.equal(nokeys.urls.length, 0);
});

Deno.test("erreur interne : message générique, aucun détail technique renvoyé", async () => {
  const { deps } = setup({ activatePlan: () => Promise.resolve({ expiresAt: null, error: 'relation "payments" secret detail' }) });
  const res = await handleVerify(post({ transactionId: "TX12345" }), deps);
  assert.equal(res.status, 500);
  const text = JSON.stringify(await res.json());
  assert.ok(!text.includes("payments") && !text.includes("secret"));
});

Deno.test("CORS : origine autorisée uniquement, jamais « * »", async () => {
  const { deps } = setup();
  const ok = await handleVerify(new Request("https://f/v", { method: "OPTIONS", headers: { Origin: "https://das.example.com" } }), deps);
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get("Access-Control-Allow-Origin"), "https://das.example.com");
  const evil = await handleVerify(new Request("https://f/v", { method: "OPTIONS", headers: { Origin: "https://evil.com" } }), deps);
  assert.equal(evil.headers.get("Access-Control-Allow-Origin"), null);
});
