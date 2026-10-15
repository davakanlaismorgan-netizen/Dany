import assert from "node:assert/strict";
import { type AutoMlDataset, type AutoMlDeps, handleAutoMl, MAX_AUTOML_BYTES, type SavedModel } from "./handler.ts";

const OWNER = "aaaaaaaa-0000-0000-0000-00000000000a";
const EDITOR = "bbbbbbbb-0000-0000-0000-00000000000b";
const PROJECT = "aaaaaaaa-1111-0000-0000-000000000001";
const DS = "aaaaaaaa-2222-0000-0000-000000000001";

let s = 3;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
// y = 3a + bruit : régression facile ; « classe » dépend du signe de a.
const csv = (n: number) => new TextEncoder().encode(
  "a,b,classe,y\n" + Array.from({ length: n }, () => {
    const a = rnd() * 2 - 1, b = rnd() * 2 - 1;
    return `${a.toFixed(3)},${b.toFixed(3)},${a > 0 ? "oui" : "non"},${(3 * a + 0.05 * b).toFixed(3)}`;
  }).join("\n") + "\n",
);

const dataset = (over: Partial<AutoMlDataset> = {}): AutoMlDataset => ({
  id: DS, user_id: OWNER, project_id: PROJECT, source_type: "csv", status: "profiled", row_count: 200,
  source_config: { storage_path: `${OWNER}/${PROJECT}/1_f.csv` }, ...over,
});

function setup(over: Partial<AutoMlDeps> = {}, ds: AutoMlDataset | null = dataset(), caller = OWNER) {
  const saved: SavedModel[] = [];
  const deps: AutoMlDeps = {
    env: () => undefined,
    now: () => Date.now(),
    getUserId: () => Promise.resolve(caller),
    canWriteWorkspace: () => Promise.resolve(false),
    getDataset: () => Promise.resolve(ds),
    getPlan: () => Promise.resolve("free"),
    download: () => Promise.resolve(csv(200)),
    saveModel: (m) => { saved.push(m); return Promise.resolve({ id: "model-1" }); },
    ...over,
  };
  return { deps, saved };
}
const post = (body: unknown, auth = true) =>
  new Request("https://f/p", { method: "POST", headers: auth ? { Authorization: "Bearer t" } : {}, body: JSON.stringify(body) });
const ok = { dataset_id: DS, target: "y", task: "regression" };

Deno.test("chemin nominal : métriques calculées sur le fichier, modèle enregistré au nom du propriétaire", async () => {
  const { deps, saved } = setup();
  const res = await handleAutoMl(post({ ...ok, name: "Mon modèle" }), deps);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.model_id, "model-1");
  assert.equal(body.plan, "free");
  assert.ok(body.metrics.r2 > 0.95, `r2=${body.metrics.r2}`);
  assert.ok(body.baseline.r2 < 0.05);
  assert.equal(body.n_rows, 200);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].ownerId, OWNER);
  assert.equal(saved[0].createdBy, OWNER);
  assert.equal(saved[0].name, "Mon modèle");
  assert.equal(saved[0].result.leaderboard.length, 3); // plan gratuit : 3 modèles
});

Deno.test("le plan Premium vient de la base (propriétaire), pas du client : plus de candidats évalués", async () => {
  const { deps, saved } = setup({ getPlan: () => Promise.resolve("premium") });
  const res = await handleAutoMl(post({ ...ok, plan: "premium", task: "classification", target: "classe" }), deps);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).plan, "premium");
  assert.ok(saved[0].result.leaderboard.length + saved[0].result.skipped.length > 3);
  const free = setup();
  await handleAutoMl(post({ ...ok, plan: "premium" }), free.deps); // champ « plan » ignoré
  assert.equal(free.saved[0].plan, "free");
});

Deno.test("budget de temps : si le calcul est trop lent, le modèle est enregistré avec les candidats évalués et le reste signalé", async () => {
  let t = 0;
  // Chaque lecture de l'horloge avance de 700 ms : le budget (1,2 s) est dépassé très vite.
  const { deps, saved } = setup({ now: () => (t += 700), getPlan: () => Promise.resolve("premium") });
  const res = await handleAutoMl(post(ok), deps);
  assert.equal(res.status, 200);
  assert.ok(saved[0].result.skipped.length > 0 || saved[0].result.leaderboard.length > 0);
});

Deno.test("non authentifié, mauvaise méthode, requêtes invalides", async () => {
  const a = setup();
  assert.equal((await handleAutoMl(post(ok, false), a.deps)).status, 401);
  assert.equal((await handleAutoMl(new Request("https://f/p", { method: "GET" }), a.deps)).status, 405);
  for (const bad of [{}, { ...ok, dataset_id: "x" }, { ...ok, target: "" }, { ...ok, task: "clustering" }, { ...ok, name: " " },
    { ...ok, features: "a" }, { ...ok, features: Array(61).fill("a") }, { ...ok, features: [1] }]) {
    assert.equal((await handleAutoMl(post(bad), a.deps)).status, 400, JSON.stringify(bad));
  }
  assert.deepEqual(a.saved, []);
});

Deno.test("autorisation : étranger → 404 ; éditeur → ok (propriété conservée, auteur tracé) ; inexistant → 404", async () => {
  const stranger = setup({}, dataset(), EDITOR);
  assert.equal((await handleAutoMl(post(ok), stranger.deps)).status, 404);
  assert.deepEqual(stranger.saved, []);
  const editor = setup({ canWriteWorkspace: () => Promise.resolve(true) }, dataset(), EDITOR);
  assert.equal((await handleAutoMl(post(ok), editor.deps)).status, 200);
  assert.equal(editor.saved[0].ownerId, OWNER);
  assert.equal(editor.saved[0].createdBy, EDITOR);
  assert.equal((await handleAutoMl(post(ok), setup({}, null).deps)).status, 404);
});

Deno.test("jeu de données non prêt, chemin invalide, trop gros → 422 sans entraînement", async () => {
  const code = async (d: AutoMlDataset | null, over: Partial<AutoMlDeps> = {}) => {
    const { deps, saved } = setup(over, d);
    const res = await handleAutoMl(post(ok), deps);
    assert.equal(res.status, 422);
    assert.deepEqual(saved, []);
    return (await res.json()).error;
  };
  assert.equal(await code(dataset({ status: "failed" })), "dataset_not_ready");
  assert.equal(await code(dataset({ source_config: { storage_path: `${EDITOR}/${PROJECT}/x.csv` } })), "dataset_not_ready");
  assert.equal(await code(dataset(), { download: () => Promise.resolve(null) }), "dataset_not_ready");
  assert.equal(await code(dataset({ row_count: 100_001 })), "dataset_too_large");
  assert.equal(await code(dataset(), { download: () => Promise.resolve(new Uint8Array(MAX_AUTOML_BYTES + 1)) }), "dataset_too_large");
});

Deno.test("erreurs de données : cible inconnue, non numérique, trop peu de lignes, classe unique", async () => {
  const run = async (body: unknown, over: Partial<AutoMlDeps> = {}) => {
    const res = await handleAutoMl(post(body), setup(over).deps);
    return [res.status, (await res.json()).error];
  };
  assert.deepEqual(await run({ ...ok, target: "nope" }), [422, "target_not_found"]);
  assert.deepEqual(await run({ ...ok, target: "classe" }), [422, "target_not_numeric"]);
  assert.deepEqual(await run(ok, { download: () => Promise.resolve(csv(10)) }), [422, "too_few_rows"]);
  assert.deepEqual(await run({ ...ok, features: ["inconnue"] }), [422, "unknown_feature"]);
  const one = new TextEncoder().encode("a,c\n" + Array.from({ length: 50 }, (_, i) => `${i},A`).join("\n"));
  assert.deepEqual(await run({ ...ok, task: "classification", target: "c" }, { download: () => Promise.resolve(one) }), [422, "single_class"]);
});

Deno.test("échec d'enregistrement ou du plan : 500 générique, aucun détail interne", async () => {
  const a = setup({ saveModel: () => Promise.resolve({ error: "secret db detail" }) });
  const res = await handleAutoMl(post(ok), a.deps);
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "server_error" });
  const b = setup({ getPlan: () => Promise.reject(new Error("db down")) });
  const r2 = await handleAutoMl(post(ok), b.deps);
  assert.equal(r2.status, 500);
  assert.deepEqual(b.saved, []); // jamais de repli sur Premium
});
