import assert from "node:assert/strict";
import { brevoConfig, escapeHtml, sendEmail } from "./brevo.ts";

const env = (m: Record<string, string>) => (k: string) => m[k];
const cfg = { apiKey: "SECRET-KEY", senderEmail: "no-reply@das.example", senderName: "DAS" };
const msg = { to: "a@b.co", subject: "S", html: "<p>h</p>", text: "t" };

Deno.test("brevoConfig : null si clé ou expéditeur manquant/invalide", () => {
  assert.equal(brevoConfig(env({})), null);
  assert.equal(brevoConfig(env({ BREVO_API_KEY: "k" })), null);
  assert.equal(brevoConfig(env({ BREVO_API_KEY: "k", BREVO_SENDER_EMAIL: "pas-un-mail" })), null);
  assert.equal(brevoConfig(env({ BREVO_API_KEY: "  ", BREVO_SENDER_EMAIL: "a@b.co" })), null);
});

Deno.test("brevoConfig : valeurs rognées, nom par défaut DAS", () => {
  assert.deepEqual(brevoConfig(env({ BREVO_API_KEY: " k ", BREVO_SENDER_EMAIL: " a@b.co " })), { apiKey: "k", senderEmail: "a@b.co", senderName: "DAS" });
});

Deno.test("sendEmail : requête Brevo correcte, succès", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const f = ((u: string, i: RequestInit) => { seen = { url: u, init: i }; return Promise.resolve(new Response("{}", { status: 201 })); }) as unknown as typeof fetch;
  assert.deepEqual(await sendEmail(cfg, msg, f), { ok: true });
  assert.equal(seen!.url, "https://api.brevo.com/v3/smtp/email");
  assert.equal((seen!.init.headers as Record<string, string>)["api-key"], "SECRET-KEY");
  const body = JSON.parse(seen!.init.body as string);
  assert.deepEqual(body.to, [{ email: "a@b.co" }]);
  assert.equal(body.sender.email, "no-reply@das.example");
});

Deno.test("sendEmail : refus du fournisseur et panne réseau, sans fuite de la clé", async () => {
  const refused = (() => Promise.resolve(new Response("{}", { status: 401 }))) as unknown as typeof fetch;
  const r1 = await sendEmail(cfg, msg, refused);
  assert.deepEqual(r1, { ok: false, status: 401 });
  const down = (() => Promise.reject(new Error("boom SECRET-KEY"))) as unknown as typeof fetch;
  const r2 = await sendEmail(cfg, msg, down);
  assert.deepEqual(r2, { ok: false, status: null });
  assert.ok(!JSON.stringify(r2).includes("SECRET-KEY"));
});

Deno.test("escapeHtml neutralise les balises et guillemets", () => {
  assert.equal(escapeHtml(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
});
