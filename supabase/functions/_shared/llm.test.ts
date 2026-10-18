import assert from "node:assert/strict";
import { callLlm, DEFAULT_MODELS, isPlausibleKey, modelFor, verifyKey } from "./llm.ts";

const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status }));

Deno.test("isPlausibleKey : refuse vide, espaces, accents, trop court/long", () => {
  assert.equal(isPlausibleKey("sk-" + "a".repeat(30)), true);
  for (const k of ["", "court", "sk- espace " + "a".repeat(20), "é".repeat(30), "a".repeat(301), 42, null]) {
    assert.equal(isPlausibleKey(k), false);
  }
});

Deno.test("modelFor : défaut, surcharge valide, surcharge suspecte ignorée", () => {
  assert.equal(modelFor("anthropic", () => undefined), DEFAULT_MODELS.anthropic);
  assert.equal(modelFor("openai", (k) => (k === "AI_OPENAI_MODEL" ? "gpt-x" : undefined)), "gpt-x");
  assert.equal(modelFor("openai", () => "mauvais modèle; drop"), DEFAULT_MODELS.openai);
});

Deno.test("Anthropic : requête, en-têtes et lecture de la réponse", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const f = ((u: string, i: RequestInit) => { seen = { url: u, init: i }; return json({ content: [{ type: "text", text: "Bonjour" }] }); }) as unknown as typeof fetch;
  const r = await callLlm("anthropic", "KEY", "m1", "SYS", [{ role: "user", content: "hi" }], f);
  assert.deepEqual(r, { ok: true, text: "Bonjour" });
  assert.equal(seen!.url, "https://api.anthropic.com/v1/messages");
  const h = seen!.init.headers as Record<string, string>;
  assert.equal(h["x-api-key"], "KEY");
  const body = JSON.parse(seen!.init.body as string);
  assert.equal(body.system, "SYS");
  assert.equal(body.model, "m1");
  assert.deepEqual(body.messages, [{ role: "user", content: "hi" }]);
});

Deno.test("OpenAI : le système passe en premier message, clé en Bearer", async () => {
  let seen: { init: RequestInit } | null = null;
  const f = ((_u: string, i: RequestInit) => { seen = { init: i }; return json({ choices: [{ message: { content: "Salut" } }] }); }) as unknown as typeof fetch;
  const r = await callLlm("openai", "KEY", "m2", "SYS", [{ role: "user", content: "hi" }], f);
  assert.deepEqual(r, { ok: true, text: "Salut" });
  assert.equal((seen!.init.headers as Record<string, string>).authorization, "Bearer KEY");
  assert.equal(JSON.parse(seen!.init.body as string).messages[0].role, "system");
});

Deno.test("erreurs fournisseur réduites à un code ; la clé n'apparaît jamais", async () => {
  for (const [status, code] of [[401, "invalid_key"], [403, "invalid_key"], [429, "rate_limited"], [500, "provider_error"], [400, "provider_error"]] as const) {
    const f = (() => json({ error: { message: "bad KEY-SECRET" } }, status)) as unknown as typeof fetch;
    const r = await callLlm("anthropic", "KEY-SECRET", "m", "s", [], f);
    assert.deepEqual(r, { ok: false, code });
  }
  const down = (() => Promise.reject(new Error("boom KEY-SECRET"))) as unknown as typeof fetch;
  assert.deepEqual(await callLlm("openai", "KEY-SECRET", "m", "s", [], down), { ok: false, code: "network" });
});

Deno.test("réponse vide ou inattendue : provider_error", async () => {
  const f1 = (() => json({ content: [] })) as unknown as typeof fetch;
  assert.deepEqual(await callLlm("anthropic", "k", "m", "s", [], f1), { ok: false, code: "provider_error" });
  const f2 = (() => json({ choices: [] })) as unknown as typeof fetch;
  assert.deepEqual(await callLlm("openai", "k", "m", "s", [], f2), { ok: false, code: "provider_error" });
});

Deno.test("verifyKey : ok, clé refusée, réseau", async () => {
  assert.equal(await verifyKey("anthropic", "k", (() => json({})) as unknown as typeof fetch), "ok");
  assert.equal(await verifyKey("openai", "k", (() => json({}, 401)) as unknown as typeof fetch), "invalid_key");
  assert.equal(await verifyKey("openai", "k", (() => Promise.reject(new Error("x"))) as unknown as typeof fetch), "network");
});
