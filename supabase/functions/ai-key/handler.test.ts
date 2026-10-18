import assert from "node:assert/strict";
import { handleAiKey, KEY_ATTEMPTS_PER_DAY, type KeyDeps } from "./handler.ts";
import { decryptKey, importMasterKey } from "../_shared/aicrypto.ts";

const U = "aaaaaaaa-0000-0000-0000-00000000000a";
const SECRET = btoa(String.fromCharCode(...new Uint8Array(32).fill(3)));
const KEY = "sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234";

function setup(over: Partial<KeyDeps> = {}, caller: string | null = U, env: Record<string, string> = { AI_KEY_ENCRYPTION_SECRET: SECRET }) {
  const saved: { userId: string; provider: string; ciphertext: string; last4: string }[] = [];
  const claims: number[] = [];
  const deps: KeyDeps = {
    env: (k) => env[k],
    getUserId: () => Promise.resolve(caller),
    claim: (_u, _k, limit) => { claims.push(limit); return Promise.resolve({ allowed: true, used: 1 }); },
    verify: () => Promise.resolve("ok"),
    saveKey: (userId, provider, ciphertext, last4) => { saved.push({ userId, provider, ciphertext, last4 }); return Promise.resolve(null); },
    ...over,
  };
  return { deps, saved, claims };
}
const post = (body: unknown, auth = true) =>
  new Request("https://f/p", { method: "POST", headers: auth ? { Authorization: "Bearer t" } : {}, body: JSON.stringify(body) });
const ok = { provider: "anthropic", api_key: KEY };

Deno.test("sans jeton : 401 ; requête invalide : 400 (fournisseur, clé trop courte ou avec espace)", async () => {
  assert.equal((await handleAiKey(post(ok, false), setup().deps)).status, 401);
  for (const b of [{}, { ...ok, provider: "gemini" }, { ...ok, api_key: "court" }, { ...ok, api_key: "a b".repeat(10) }]) {
    assert.equal((await handleAiKey(post(b), setup().deps)).status, 400);
  }
});

Deno.test("secret de chiffrement absent : 503, rien n'est vérifié ni enregistré", async () => {
  const { deps, saved } = setup({ verify: () => Promise.reject(new Error("ne doit pas être appelé")) }, U, {});
  assert.equal((await handleAiKey(post(ok), deps)).status, 503);
  assert.equal(saved.length, 0);
});

Deno.test("trop d'essais dans la journée : 429 sans appel au fournisseur", async () => {
  const { deps, saved } = setup({
    claim: () => Promise.resolve({ allowed: false, used: KEY_ATTEMPTS_PER_DAY }),
    verify: () => Promise.reject(new Error("ne doit pas être appelé")),
  });
  assert.equal((await handleAiKey(post(ok), deps)).status, 429);
  assert.equal(saved.length, 0);
});

Deno.test("clé refusée par le fournisseur : 422 ; panne du fournisseur : 502 ; rien d'enregistré", async () => {
  const a = setup({ verify: () => Promise.resolve("invalid_key") });
  assert.equal((await handleAiKey(post(ok), a.deps)).status, 422);
  const b = setup({ verify: () => Promise.resolve("network") });
  assert.equal((await handleAiKey(post(ok), b.deps)).status, 502);
  assert.equal(a.saved.length + b.saved.length, 0);
});

Deno.test("succès : enregistrée CHIFFRÉE, jamais en clair ; réponse sans la clé", async () => {
  const { deps, saved, claims } = setup();
  const res = await handleAiKey(post(ok), deps);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { saved: true, provider: "anthropic", last4: "1234" });
  assert.deepEqual(claims, [KEY_ATTEMPTS_PER_DAY]);
  assert.equal(saved.length, 1);
  assert.ok(!saved[0].ciphertext.includes("ABCDEF"));
  assert.equal(await decryptKey(await importMasterKey(SECRET), U, saved[0].ciphertext), KEY);
});

Deno.test("fournisseur qui limite le débit : la clé est quand même acceptée", async () => {
  const { deps, saved } = setup({ verify: () => Promise.resolve("rate_limited") });
  assert.equal((await handleAiKey(post(ok), deps)).status, 200);
  assert.equal(saved.length, 1);
});

Deno.test("échec d'enregistrement en base : 500, sans fuite de la clé dans les logs", async () => {
  const logs: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => { logs.push(a.join(" ")); };
  try {
    const { deps } = setup({ saveKey: () => Promise.resolve("db down") });
    assert.equal((await handleAiKey(post(ok), deps)).status, 500);
    assert.ok(!logs.join("\n").includes("ABCDEF"));
  } finally {
    console.error = orig;
  }
});
