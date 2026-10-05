import assert from "node:assert/strict";
import {
  fetchTransaction,
  isUuid,
  isValidTransactionId,
  KkiapayError,
  paymentMethod,
  planForAmount,
  providerName,
  readConfig,
  safeEqual,
} from "./kkiapay.ts";
import { listAllFiles, removeAllUnder, type StorageLike } from "./storage.ts";

Deno.test("planForAmount : seul le montant exact du plan Premium (17 900 XOF) est accepté", () => {
  assert.equal(planForAmount(17900), "premium");
  for (const bad of [0, 1, 2900, 17899, 17901, 179000, -17900, 17900.5, "17900", null, undefined, NaN]) {
    assert.equal(planForAmount(bad), null, `devrait refuser ${String(bad)}`);
  }
});

Deno.test("validation des identifiants", () => {
  assert.ok(isValidTransactionId("LVFNrK1nx"));
  assert.ok(!isValidTransactionId("../etc/passwd"));
  assert.ok(!isValidTransactionId("a b"));
  assert.ok(!isValidTransactionId(""));
  assert.ok(!isValidTransactionId(123));
  assert.ok(isUuid("aaaaaaaa-0000-0000-0000-00000000000a"));
  assert.ok(!isUuid("pas-un-uuid"));
});

Deno.test("safeEqual", () => {
  assert.ok(safeEqual("secret", "secret"));
  assert.ok(!safeEqual("secret", "secreT"));
  assert.ok(!safeEqual("secret", "secret2"));
  assert.ok(!safeEqual("", "secret"));
});

Deno.test("readConfig : échec fermé, sandbox uniquement si KKIAPAY_SANDBOX === 'true'", () => {
  const base = { KKIAPAY_PUBLIC_KEY: "pub", KKIAPAY_PRIVATE_KEY: "priv", KKIAPAY_SECRET_KEY: "sec" };
  const env = (o: Record<string, string>) => (k: string) => o[k];
  assert.equal(readConfig(env({})), null);
  assert.equal(readConfig(env({ ...base, KKIAPAY_PRIVATE_KEY: "" })), null);
  assert.equal(readConfig(env(base))!.sandbox, false); // variable absente => production
  assert.equal(readConfig(env({ ...base, KKIAPAY_SANDBOX: "false" }))!.sandbox, false);
  assert.equal(readConfig(env({ ...base, KKIAPAY_SANDBOX: "TRUE" }))!.sandbox, false);
  assert.equal(readConfig(env({ ...base, KKIAPAY_SANDBOX: "true" }))!.sandbox, true);
  assert.equal(providerName({ ...readConfig(env(base))! }), "kkiapay");
  assert.equal(providerName({ ...readConfig(env({ ...base, KKIAPAY_SANDBOX: "true" }))! }), "kkiapay-sandbox");
});

Deno.test("paymentMethod", () => {
  assert.equal(paymentMethod("MOBILE_MONEY"), "momo");
  assert.equal(paymentMethod("CARD"), "card");
  assert.equal(paymentMethod(null), "wallet");
});

Deno.test("fetchTransaction : bon endpoint, bonne méthode, bons en-têtes (clé publique dans X-API-KEY)", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const fake: typeof fetch = (url, init) => {
    seen = { url: String(url), init: init! };
    return Promise.resolve(new Response(JSON.stringify({ status: "SUCCESS", amount: 17900, source: "CARD" })));
  };
  const cfg = { publicKey: "PUB", privateKey: "PRIV", secretKey: "SEC", sandbox: false };
  const tx = await fetchTransaction(cfg, "TX12345", fake);
  assert.deepEqual(tx, { status: "SUCCESS", amount: 17900, source: "CARD" });
  assert.equal(seen!.url, "https://api.kkiapay.me/api/v1/transactions/status");
  assert.equal(seen!.init.method, "POST");
  assert.deepEqual(JSON.parse(String(seen!.init.body)), { transactionId: "TX12345" });
  const h = seen!.init.headers as Record<string, string>;
  assert.equal(h["X-API-KEY"], "PUB");
  assert.equal(h["X-PRIVATE-KEY"], "PRIV");
  assert.equal(h["X-SECRET-KEY"], "SEC");

  await fetchTransaction({ ...cfg, sandbox: true }, "TX12345", fake);
  assert.equal(seen!.url, "https://api-sandbox.kkiapay.me/api/v1/transactions/status");
});

Deno.test("fetchTransaction : erreurs réseau et réponses invalides", async () => {
  const cfg = { publicKey: "a", privateKey: "b", secretKey: "c", sandbox: false };
  await assert.rejects(
    fetchTransaction(cfg, "TX12345", () => Promise.reject(new Error("réseau"))),
    (e: unknown) => e instanceof KkiapayError && e.code === "unreachable",
  );
  await assert.rejects(
    fetchTransaction(cfg, "TX12345", () => Promise.resolve(new Response("<html>"))),
    (e: unknown) => e instanceof KkiapayError && e.code === "bad_response",
  );
  await assert.rejects(
    fetchTransaction(cfg, "TX12345", () => Promise.resolve(new Response(JSON.stringify({ foo: 1 })))),
    (e: unknown) => e instanceof KkiapayError && e.code === "bad_response",
  );
  const nf = await fetchTransaction(
    cfg, "TX12345",
    () => Promise.resolve(new Response(JSON.stringify({ status: "TRANSACTION_NOT_FOUND" }), { status: 404 })),
  );
  assert.equal(nf.status, "TRANSACTION_NOT_FOUND");
  assert.equal(nf.amount, null);
});

// ---- storage ----
function fakeBucket(tree: Record<string, { name: string; id: string | null }[]>, removed: string[]): StorageLike {
  return {
    list: (path, { limit, offset }) => Promise.resolve({ data: (tree[path] ?? []).slice(offset, offset + limit), error: null }),
    remove: (paths) => { removed.push(...paths); return Promise.resolve({ error: null }); },
  };
}

Deno.test("storage : parcourt les sous-dossiers et pagine", async () => {
  const tree = {
    u1: [{ name: "proj1", id: null }, { name: "avatar.png", id: "f0" }, { name: "proj2", id: null }],
    "u1/proj1": [{ name: "a.csv", id: "f1" }, { name: "b.csv", id: "f2" }, { name: "c.csv", id: "f3" }],
    "u1/proj2": [{ name: "deep", id: null }],
    "u1/proj2/deep": [{ name: "d.json", id: "f4" }],
  };
  const removed: string[] = [];
  const bucket = fakeBucket(tree, removed);
  const files = (await listAllFiles(bucket, "u1", 2)).sort(); // page de 2 : force la pagination
  assert.deepEqual(files, ["u1/avatar.png", "u1/proj1/a.csv", "u1/proj1/b.csv", "u1/proj1/c.csv", "u1/proj2/deep/d.json"]);
  assert.equal(await removeAllUnder(bucket, "u1", 2), null);
  assert.equal(removed.length, 5);
});

Deno.test("storage : une erreur de suppression est remontée", async () => {
  const bucket: StorageLike = {
    list: () => Promise.resolve({ data: [{ name: "a", id: "1" }], error: null }),
    remove: () => Promise.resolve({ error: { message: "boom" } }),
  };
  assert.equal(await removeAllUnder(bucket, "u1"), "boom");
  const broken: StorageLike = {
    list: () => Promise.resolve({ data: null, error: { message: "list_fail" } }),
    remove: () => Promise.resolve({ error: null }),
  };
  assert.equal(await removeAllUnder(broken, "u1"), "list_fail");
});
