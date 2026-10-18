import assert from "node:assert/strict";
import { buildInvitationEmail, COOLDOWN_SECONDS, handleNotifyInvitation, type InvitationRow, MAX_EMAILS_PER_INVITATION, type NotifyDeps, siteUrl } from "./handler.ts";

const OWNER = "aaaaaaaa-0000-0000-0000-00000000000a";
const STRANGER = "cccccccc-0000-0000-0000-00000000000c";
const INV = "dddddddd-0000-0000-0000-00000000000d";
const inv = (): InvitationRow => ({ id: INV, owner_id: OWNER, member_email: "col@ex.com", role: "editor", status: "pending" });
const ENV: Record<string, string> = { BREVO_API_KEY: "SECRET-KEY", BREVO_SENDER_EMAIL: "no-reply@das.example", ALLOWED_ORIGINS: "https://das.example" };

function setup(over: Partial<NotifyDeps> = {}, caller: string | null = OWNER, env = ENV) {
  const sent: { to: string; subject: string; html: string }[] = [];
  const released: (string | null)[] = [];
  const deps: NotifyDeps = {
    env: (k) => env[k],
    getUserId: () => Promise.resolve(caller),
    getInvitation: () => Promise.resolve(inv()),
    getPlan: () => Promise.resolve("premium"),
    getOwnerName: () => Promise.resolve("Awa <b>"),
    claim: () => Promise.resolve({ claimed: true, prevAt: null, reason: null }),
    release: (_id, prev) => { released.push(prev); return Promise.resolve(); },
    send: (_c, m) => { sent.push(m); return Promise.resolve({ ok: true }); },
    ...over,
  };
  return { deps, sent, released };
}
const post = (body: unknown, auth = true) =>
  new Request("https://f/p", { method: "POST", headers: auth ? { Authorization: "Bearer t" } : {}, body: JSON.stringify(body) });
const ok = { invitation_id: INV, lang: "fr" };

Deno.test("sans jeton ou jeton invalide : 401", async () => {
  assert.equal((await handleNotifyInvitation(post(ok, false), setup().deps)).status, 401);
  assert.equal((await handleNotifyInvitation(post(ok), setup({}, null).deps)).status, 401);
});

Deno.test("requête invalide : 400", async () => {
  const { deps } = setup();
  for (const b of [{}, { ...ok, invitation_id: "x" }, { ...ok, lang: "es" }]) {
    assert.equal((await handleNotifyInvitation(post(b), deps)).status, 400);
  }
});

Deno.test("invitation d'un autre ou inexistante : même 404, rien envoyé", async () => {
  const a = setup({}, STRANGER);
  const r = await handleNotifyInvitation(post(ok), a.deps);
  assert.equal(r.status, 404);
  assert.deepEqual(await r.json(), { error: "not_found" });
  const b = setup({ getInvitation: () => Promise.resolve(null) });
  assert.deepEqual(await (await handleNotifyInvitation(post(ok), b.deps)).json(), { error: "not_found" });
  assert.equal(a.sent.length + b.sent.length, 0);
});

Deno.test("invitation non en attente : 422", async () => {
  const { deps, sent } = setup({ getInvitation: () => Promise.resolve({ ...inv(), status: "active" }) });
  assert.equal((await handleNotifyInvitation(post(ok), deps)).status, 422);
  assert.equal(sent.length, 0);
});

Deno.test("e-mail non configuré : 503", async () => {
  const { deps, sent } = setup({}, OWNER, { ALLOWED_ORIGINS: "https://das.example" });
  assert.equal((await handleNotifyInvitation(post(ok), deps)).status, 503);
  const noSite = setup({}, OWNER, { BREVO_API_KEY: "k", BREVO_SENDER_EMAIL: "a@b.co" });
  assert.equal((await handleNotifyInvitation(post(ok), noSite.deps)).status, 503);
  assert.equal(sent.length, 0);
});

Deno.test("plan gratuit : 403, aucune réservation ; erreur de plan : 500, rien envoyé", async () => {
  let claimed = false;
  const free = setup({ getPlan: () => Promise.resolve("free"), claim: () => { claimed = true; return Promise.resolve({ claimed: true, prevAt: null, reason: null }); } });
  assert.equal((await handleNotifyInvitation(post(ok), free.deps)).status, 403);
  assert.equal(claimed, false);
  const err = setup({ getPlan: () => Promise.reject(new Error("db")) });
  assert.equal((await handleNotifyInvitation(post(ok), err.deps)).status, 500);
  assert.equal(err.sent.length, 0);
});

Deno.test("trop tôt / plafond atteint : 429, rien envoyé", async () => {
  for (const reason of ["too_soon", "max_sent"]) {
    const { deps, sent } = setup({ claim: () => Promise.resolve({ claimed: false, prevAt: null, reason }) });
    const r = await handleNotifyInvitation(post(ok), deps);
    assert.equal(r.status, 429);
    assert.deepEqual(await r.json(), { error: reason });
    assert.equal(sent.length, 0);
  }
});

Deno.test("la base reçoit le délai et le plafond voulus", async () => {
  let args: unknown[] = [];
  const { deps } = setup({ claim: (...a) => { args = a; return Promise.resolve({ claimed: true, prevAt: null, reason: null }); } });
  await handleNotifyInvitation(post(ok), deps);
  assert.deepEqual(args, [INV, COOLDOWN_SECONDS, MAX_EMAILS_PER_INVITATION]);
});

Deno.test("refus du fournisseur : 502 et réservation libérée avec l'ancienne date", async () => {
  const { deps, released } = setup({
    claim: () => Promise.resolve({ claimed: true, prevAt: "2026-10-18T08:00:00Z", reason: null }),
    send: () => Promise.resolve({ ok: false, status: 401 }),
  });
  assert.equal((await handleNotifyInvitation(post(ok), deps)).status, 502);
  assert.deepEqual(released, ["2026-10-18T08:00:00Z"]);
});

Deno.test("succès : 200, e-mail au bon destinataire, nom échappé, clé jamais dans la réponse ni les logs", async () => {
  const logs: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => { logs.push(a.join(" ")); };
  try {
    const { deps, sent } = setup();
    const r = await handleNotifyInvitation(post(ok), deps);
    assert.equal(r.status, 200);
    assert.ok(!JSON.stringify(await r.json()).includes("SECRET-KEY"));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "col@ex.com");
    assert.ok(sent[0].html.includes("Awa &lt;b&gt;"));
    assert.ok(!sent[0].html.includes("<b>"));
    const fail = setup({ send: () => Promise.resolve({ ok: false, status: 500 }) });
    await handleNotifyInvitation(post(ok), fail.deps);
    assert.ok(!logs.join("\n").includes("SECRET-KEY"));
  } finally {
    console.error = orig;
  }
});

Deno.test("siteUrl : SITE_URL prioritaire, sinon première origine https, jamais http", () => {
  assert.equal(siteUrl((k) => ({ SITE_URL: "https://a.co/", ALLOWED_ORIGINS: "https://b.co" })[k]), "https://a.co");
  assert.equal(siteUrl((k) => ({ ALLOWED_ORIGINS: "http://localhost:5173, https://b.co" })[k]), "https://b.co");
  assert.equal(siteUrl((k) => ({ ALLOWED_ORIGINS: "http://localhost:5173" })[k]), null);
});

Deno.test("buildInvitationEmail : FR/EN, rôle, lien de connexion", () => {
  const fr = buildInvitationEmail("fr", "Awa", "viewer", "x@y.co", "https://das.example");
  assert.ok(fr.subject.includes("Awa") && fr.text.includes("https://das.example/auth/login") && fr.text.includes("lecteur"));
  const en = buildInvitationEmail("en", "", "editor", "x@y.co", "https://das.example");
  assert.ok(en.text.includes("A colleague") && en.text.includes("editor"));
});
