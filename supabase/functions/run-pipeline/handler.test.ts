import assert from "node:assert/strict";
import { handleRun, type PipelineRow, type RunDeps, type SourceDataset } from "./handler.ts";

const OWNER = "aaaaaaaa-0000-0000-0000-00000000000a";
const EDITOR = "bbbbbbbb-0000-0000-0000-00000000000b";
const PROJECT = "aaaaaaaa-1111-0000-0000-000000000001";
const PIPE = "aaaaaaaa-3333-0000-0000-000000000001";
const DS = "aaaaaaaa-2222-0000-0000-000000000001";
const csv = (s: string) => new TextEncoder().encode(s);

const graph = (extra: Partial<PipelineRow> = {}): PipelineRow => ({
  id: PIPE, project_id: PROJECT, user_id: OWNER,
  nodes: [
    { id: "a", type: "source", config: { dataset_id: DS } },
    { id: "f", type: "filter", config: { column: "x", op: "gt", value: "1" } },
    { id: "z", type: "output", config: { name: "Résultat" } },
  ],
  edges: [{ from: "a", to: "f" }, { from: "f", to: "z" }],
  ...extra,
});
const dataset = (over: Partial<SourceDataset> = {}): SourceDataset => ({
  id: DS, user_id: OWNER, project_id: PROJECT, source_type: "csv", status: "profiled",
  source_config: { storage_path: `${OWNER}/${PROJECT}/1_f.csv` }, ...over,
});

function setup(over: Partial<RunDeps> = {}, pipe: PipelineRow | null = graph(), ds: SourceDataset | null = dataset(), caller = OWNER) {
  const log: string[] = [];
  const deps: RunDeps = {
    env: () => undefined,
    getUserId: () => Promise.resolve(caller),
    canWriteWorkspace: () => Promise.resolve(false),
    getPipeline: () => Promise.resolve(pipe),
    getDataset: () => Promise.resolve(ds),
    download: () => Promise.resolve(csv("x,y\n1,a\n2,b\n3,c\n")),
    saveOutput: (o) => { log.push(`save:${o.ownerId}:${o.createdBy}:${o.profile.rowCount}:${o.name}`); return Promise.resolve({ id: "new-id" }); },
    setStatus: (_id, s) => { log.push(`status:${s}`); return Promise.resolve(); },
    ...over,
  };
  return { deps, log };
}
const post = (body: unknown, auth = true) =>
  new Request("https://f/p", { method: "POST", headers: auth ? { Authorization: "Bearer t" } : {}, body: JSON.stringify(body) });

Deno.test("chemin nominal : le résultat devient un nouveau jeu de données du propriétaire", async () => {
  const { deps, log } = setup();
  const res = await handleRun(post({ pipeline_id: PIPE }), deps);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.dataset_id, "new-id");
  assert.equal(body.row_count, 2);
  assert.equal(body.column_count, 2);
  assert.deepEqual(body.steps.map((s: { rows_out: number }) => s.rows_out), [3, 2, 2]);
  assert.deepEqual(log, [`save:${OWNER}:${OWNER}:2:Résultat`, "status:completed"]);
});

Deno.test("non authentifié, mauvaise méthode, corps invalide", async () => {
  const a = setup();
  assert.equal((await handleRun(post({ pipeline_id: PIPE }, false), a.deps)).status, 401);
  assert.equal((await handleRun(new Request("https://f/p", { method: "GET" }), a.deps)).status, 405);
  assert.equal((await handleRun(post({ pipeline_id: "nope" }), a.deps)).status, 400);
  assert.equal((await handleRun(post({}), a.deps)).status, 400);
});

Deno.test("autorisation : étranger et viewer → 404 ; éditeur → ok, propriété conservée, auteur tracé", async () => {
  const stranger = setup({}, graph(), dataset(), EDITOR);
  assert.equal((await handleRun(post({ pipeline_id: PIPE }), stranger.deps)).status, 404);
  assert.deepEqual(stranger.log, []);

  const editor = setup({ canWriteWorkspace: () => Promise.resolve(true) }, graph(), dataset(), EDITOR);
  assert.equal((await handleRun(post({ pipeline_id: PIPE }), editor.deps)).status, 200);
  assert.deepEqual(editor.log, [`save:${OWNER}:${EDITOR}:2:Résultat`, "status:completed"]);

  const missing = setup({}, null);
  assert.equal((await handleRun(post({ pipeline_id: PIPE }), missing.deps)).status, 404);
});

Deno.test("une source d'un autre projet, d'un autre propriétaire ou non analysée est refusée", async () => {
  for (const bad of [
    dataset({ project_id: "aaaaaaaa-1111-0000-0000-000000000099" }),
    dataset({ user_id: EDITOR }),
    dataset({ status: "failed" }),
    dataset({ source_config: { storage_path: `${EDITOR}/${PROJECT}/x.csv` } }),
    dataset({ source_config: { storage_path: `${OWNER}/../${EDITOR}/x.csv` } }),
  ]) {
    const { deps, log } = setup({}, graph(), bad);
    const res = await handleRun(post({ pipeline_id: PIPE }), deps);
    assert.equal(res.status, 422);
    assert.deepEqual(await res.json(), { error: "source_not_found", node_id: "a", detail: null });
    assert.deepEqual(log, ["status:failed"]);
  }
  const none = setup({}, graph(), null);
  assert.equal((await handleRun(post({ pipeline_id: PIPE }), none.deps)).status, 422);
});

Deno.test("erreurs de configuration : 422 avec le code et le bloc, statut « failed », rien d'enregistré", async () => {
  const p = graph({ nodes: [
    { id: "a", type: "source", config: { dataset_id: DS } },
    { id: "f", type: "filter", config: { column: "absente", op: "eq", value: "1" } },
    { id: "z", type: "output", config: {} },
  ] });
  const { deps, log } = setup({}, p);
  const res = await handleRun(post({ pipeline_id: PIPE }), deps);
  assert.equal(res.status, 422);
  assert.deepEqual(await res.json(), { error: "column_not_found", node_id: "f", detail: "absente" });
  assert.deepEqual(log, ["status:failed"]);
  const junk = setup({}, graph({ nodes: "pas un tableau", edges: null }));
  assert.equal((await handleRun(post({ pipeline_id: PIPE }), junk.deps)).status, 422);
});

Deno.test("résultat vide, fichier source absent ou illisible", async () => {
  const empty = setup({ download: () => Promise.resolve(csv("x,y\n0,a\n")) });
  assert.equal((await (await handleRun(post({ pipeline_id: PIPE }), empty.deps)).json()).error, "empty_result");
  const gone = setup({ download: () => Promise.resolve(null) });
  assert.equal((await (await handleRun(post({ pipeline_id: PIPE }), gone.deps)).json()).error, "source_not_found");
  const bad = setup({ download: () => Promise.resolve(csv("")) });
  assert.equal((await handleRun(post({ pipeline_id: PIPE }), bad.deps)).status, 422);
});

Deno.test("limite du plan gratuit et erreur serveur sur l'enregistrement", async () => {
  const limit = setup({ saveOutput: () => Promise.resolve({ error: "plan_limit:rows" }) });
  const res = await handleRun(post({ pipeline_id: PIPE }), limit.deps);
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, "plan_limit_rows");
  assert.deepEqual(limit.log, ["status:failed"]);
  const boom = setup({ saveOutput: () => Promise.resolve({ error: "boom secret" }) });
  const r2 = await handleRun(post({ pipeline_id: PIPE }), boom.deps);
  assert.equal(r2.status, 500);
  assert.deepEqual(await r2.json(), { error: "server_error" }); // aucun détail interne exposé
});
