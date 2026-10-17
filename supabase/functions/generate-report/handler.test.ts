import assert from "node:assert/strict";
import { cleanBrandName, handleGenerateReport, MAX_BRAND_NAME, MAX_REPORTS_PER_HOUR, type ProjectRow, type ReportDeps, type SaveArgs } from "./handler.ts";

const OWNER = "aaaaaaaa-0000-0000-0000-00000000000a";
const EDITOR = "bbbbbbbb-0000-0000-0000-00000000000b";
const STRANGER = "cccccccc-0000-0000-0000-00000000000c";
const PROJECT = "aaaaaaaa-1111-0000-0000-000000000001";

const project = (): ProjectRow => ({ id: PROJECT, user_id: OWNER, name: "Churn", description: null });
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 20, 0, 40, 3, 1, 0x11, 0, 0xff, 0xd9]);
const latin1 = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

function setup(over: Partial<ReportDeps> = {}, caller = OWNER) {
  const saved: SaveArgs[] = [];
  const deps: ReportDeps = {
    env: () => undefined,
    now: () => new Date("2026-10-17T08:00:00Z"),
    getUserId: () => Promise.resolve(caller),
    canWriteWorkspace: () => Promise.resolve(false),
    getProject: () => Promise.resolve(project()),
    getPlan: () => Promise.resolve("free"),
    getCompany: () => Promise.resolve("Acme Analytics"),
    getLogo: () => Promise.resolve(null),
    loadData: () => Promise.resolve({ datasets: [], models: [], pipelines: [], visualizations: [] }),
    countRecent: () => Promise.resolve(0),
    save: (a) => { saved.push(a); return Promise.resolve({ id: "report-1" }); },
    ...over,
  };
  return { deps, saved };
}
const post = (body: unknown, auth = true) =>
  new Request("https://f/p", { method: "POST", headers: auth ? { Authorization: "Bearer t" } : {}, body: JSON.stringify(body) });
const ok = { project_id: PROJECT, template: "exec", lang: "fr" };

Deno.test("sans jeton : 401, rien n'est lu ni écrit", async () => {
  const { deps, saved } = setup({ getUserId: () => Promise.reject(new Error("ne doit pas être appelé")) });
  assert.equal((await handleGenerateReport(post(ok, false), deps)).status, 401);
  assert.equal(saved.length, 0);
});

Deno.test("jeton invalide : 401", async () => {
  const { deps } = setup({ getUserId: () => Promise.resolve(null) });
  assert.equal((await handleGenerateReport(post(ok), deps)).status, 401);
});

Deno.test("requêtes invalides : 400 (projet, modèle, langue)", async () => {
  const { deps } = setup();
  for (const b of [{}, { ...ok, project_id: "x" }, { ...ok, template: "ppt" }, { ...ok, lang: "es" }, { ...ok, template: undefined }]) {
    assert.equal((await handleGenerateReport(post(b), deps)).status, 400, JSON.stringify(b));
  }
});

Deno.test("projet d'un autre sans droit d'écriture : 404 identique à « inexistant »", async () => {
  const { deps, saved } = setup({}, STRANGER);
  const res = await handleGenerateReport(post(ok), deps);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "not_found" });
  const missing = setup({ getProject: () => Promise.resolve(null) });
  assert.deepEqual(await (await handleGenerateReport(post(ok), missing.deps)).json(), { error: "not_found" });
  assert.equal(saved.length, 0);
});

Deno.test("éditeur actif : rapport enregistré au nom du propriétaire, auteur = éditeur", async () => {
  const { deps, saved } = setup({ canWriteWorkspace: () => Promise.resolve(true) }, EDITOR);
  const res = await handleGenerateReport(post(ok), deps);
  assert.equal(res.status, 200);
  assert.equal(saved[0].ownerId, OWNER);
  assert.equal(saved[0].createdBy, EDITOR);
  assert.equal(saved[0].extension, "pdf");
});

Deno.test("plan gratuit : toujours la marque DAS, même avec un nom d'organisation et un logo", async () => {
  const { deps, saved } = setup({ getLogo: () => Promise.resolve(jpeg) });
  const body = await (await handleGenerateReport(post({ ...ok, brand_name: "Pirate", branding: "custom" }), deps)).json();
  assert.equal(body.branding, "das");
  assert.equal(body.brand_name_missing, false);
  const pdf = latin1(saved[0].bytes);
  assert.ok(pdf.includes("DAS") && !pdf.includes("Acme") && !pdf.includes("Pirate") && !pdf.includes("/Im1"));
});

Deno.test("plan Premium + nom d'organisation : marque personnalisée, logo embarqué, aucune mention de DAS", async () => {
  const { deps, saved } = setup({ getPlan: () => Promise.resolve("premium"), getLogo: () => Promise.resolve(jpeg) });
  const body = await (await handleGenerateReport(post(ok), deps)).json();
  assert.equal(body.branding, "custom");
  const pdf = latin1(saved[0].bytes);
  assert.ok(pdf.includes("Acme Analytics") && pdf.includes("/Im1 Do") && !pdf.includes("DAS"));
  assert.equal(saved[0].branding, "custom");
});

Deno.test("Premium : un logo invalide (non JPEG) est ignoré, le rapport est quand même produit", async () => {
  const { deps, saved } = setup({ getPlan: () => Promise.resolve("premium"), getLogo: () => Promise.resolve(new Uint8Array([1, 2, 3])) });
  assert.equal((await handleGenerateReport(post(ok), deps)).status, 200);
  assert.ok(!latin1(saved[0].bytes).includes("/Im1"));
});

Deno.test("Premium sans nom d'organisation : marque DAS et indication pour l'écran", async () => {
  const { deps } = setup({ getPlan: () => Promise.resolve("premium"), getCompany: () => Promise.resolve("   ") });
  const body = await (await handleGenerateReport(post(ok), deps)).json();
  assert.equal(body.branding, "das");
  assert.equal(body.brand_name_missing, true);
});

Deno.test("plan indéterminé (erreur base) : 500 et aucun fichier, jamais de marque Premium par défaut", async () => {
  const { deps, saved } = setup({ getPlan: () => Promise.reject(new Error("db")) });
  assert.equal((await handleGenerateReport(post(ok), deps)).status, 500);
  assert.equal(saved.length, 0);
});

Deno.test("limite horaire : 429 sans rien produire", async () => {
  const { deps, saved } = setup({ countRecent: () => Promise.resolve(MAX_REPORTS_PER_HOUR) });
  assert.equal((await handleGenerateReport(post(ok), deps)).status, 429);
  assert.equal(saved.length, 0);
});

Deno.test("modèle CSV : fichier .csv, langue anglaise", async () => {
  const { deps, saved } = setup();
  const body = await (await handleGenerateReport(post({ ...ok, template: "data", lang: "en" }), deps)).json();
  assert.equal(body.format, "csv");
  assert.equal(saved[0].extension, "csv");
  assert.ok(saved[0].contentType.startsWith("text/csv"));
  assert.equal(saved[0].name, "Models summary — 2026-10-17");
});

Deno.test("échec d'enregistrement : 500 sans détail interne", async () => {
  const { deps } = setup({ save: () => Promise.resolve({ error: "relation reports secret" }) });
  const res = await handleGenerateReport(post(ok), deps);
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "server_error" });
});

Deno.test("méthode GET refusée, OPTIONS accepté", async () => {
  const { deps } = setup();
  assert.equal((await handleGenerateReport(new Request("https://f/p"), deps)).status, 405);
  assert.equal((await handleGenerateReport(new Request("https://f/p", { method: "OPTIONS" }), deps)).status, 204);
});

Deno.test("nom de marque : caractères de contrôle retirés, espaces normalisés, longueur bornée", () => {
  assert.equal(cleanBrandName("  Acme \n\t Corp\u0000 "), "Acme Corp");
  assert.equal(cleanBrandName(null), "");
  assert.equal(cleanBrandName("x".repeat(500)).length, MAX_BRAND_NAME);
});
