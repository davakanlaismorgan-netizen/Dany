import assert from "node:assert/strict";
import { handleProcess, isOwnedPath, type ProcessDeps } from "./handler.ts";

const UID = "aaaaaaaa-0000-0000-0000-00000000000a";
const DS = "aaaaaaaa-2222-0000-0000-000000000001";
const csv = (n: number) => new TextEncoder().encode("a,b\n" + Array.from({ length: n }, (_, i) => `${i},x`).join("\n"));

function setup(over: Partial<ProcessDeps> = {}, ds: Partial<{ user_id: string; source_type: string; path: unknown }> = {}) {
  const log: string[] = [];
  const deps: ProcessDeps = {
    env: () => undefined,
    getUserId: () => Promise.resolve(UID),
    canWriteWorkspace: () => Promise.resolve(false),
    getDataset: () => Promise.resolve({
      id: DS, user_id: ds.user_id ?? UID, source_type: ds.source_type ?? "csv",
      source_config: { storage_path: "path" in ds ? ds.path : `${UID}/p/1_f.csv` },
    }),
    download: () => Promise.resolve(csv(3)),
    saveResult: (_id, p) => { log.push(`save:${p.rowCount}`); return Promise.resolve(null); },
    markFailed: (_id, r) => { log.push(`failed:${r}`); return Promise.resolve(); },
    deleteDataset: () => { log.push("delete"); return Promise.resolve(); },
    ...over,
  };
  return { deps, log };
}
const post = (body: unknown, auth = true) =>
  new Request("https://f/p", { method: "POST", headers: auth ? { Authorization: "Bearer t" } : {}, body: JSON.stringify(body) });

Deno.test("chemin nominal : le serveur enregistre le nombre de lignes du fichier réel", async () => {
  const { deps, log } = setup();
  const res = await handleProcess(post({ dataset_id: DS }), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { row_count: 3, column_count: 2 });
  assert.deepEqual(log, ["save:3"]);
});

Deno.test("non authentifié, mauvaise méthode, corps invalide", async () => {
  const a = setup();
  assert.equal((await handleProcess(post({ dataset_id: DS }, false), a.deps)).status, 401);
  assert.equal((await handleProcess(new Request("https://f/p", { method: "GET" }), a.deps)).status, 405);
  assert.equal((await handleProcess(post({ dataset_id: "nope" }), a.deps)).status, 400);
  assert.equal((await handleProcess(post({}), a.deps)).status, 400);
  assert.deepEqual(a.log, []);
});

Deno.test("ATTAQUE: dataset d'un autre utilisateur ou inexistant → 404 identique, rien d'écrit", async () => {
  const other = setup({}, { user_id: "bbbbbbbb-0000-0000-0000-00000000000b" });
  assert.equal((await handleProcess(post({ dataset_id: DS }), other.deps)).status, 404);
  const none = setup({ getDataset: () => Promise.resolve(null) });
  assert.equal((await handleProcess(post({ dataset_id: DS }), none.deps)).status, 404);
  assert.deepEqual([...other.log, ...none.log], []);
});

Deno.test("ATTAQUE: chemin de stockage hors du dossier de l'utilisateur ou avec ..", async () => {
  for (const path of ["bbbbbbbb-0000-0000-0000-00000000000b/p/f.csv", `${UID}/../bbbb/f.csv`, "", null, 42]) {
    const { deps, log } = setup({}, { path });
    const res = await handleProcess(post({ dataset_id: DS }), deps);
    assert.equal(res.status, 400, String(path));
    assert.deepEqual(log, ["failed:invalid_path"]);
  }
  assert.ok(isOwnedPath(`${UID}/p/f.csv`, UID));
  assert.ok(!isOwnedPath(`${UID}x/p/f.csv`, UID));
});

Deno.test("fichier absent / trop gros / illisible : statut failed, erreur claire", async () => {
  const miss = setup({ download: () => Promise.resolve(null) });
  assert.equal((await handleProcess(post({ dataset_id: DS }), miss.deps)).status, 422);
  assert.deepEqual(miss.log, ["failed:file_missing"]);

  const huge = setup({ download: () => Promise.resolve({ byteLength: 51 * 1024 * 1024 } as Uint8Array) });
  assert.equal((await handleProcess(post({ dataset_id: DS }), huge.deps)).status, 422);
  assert.deepEqual(huge.log, ["failed:file_too_large"]);

  const bad = setup({ download: () => Promise.resolve(new TextEncoder().encode("")) });
  const r = await handleProcess(post({ dataset_id: DS }), bad.deps);
  assert.equal(r.status, 422);
  assert.equal((await r.json()).error, "empty");
  assert.deepEqual(bad.log, ["failed:empty"]);

  const xl = setup({}, { source_type: "excel" });
  assert.equal((await (await handleProcess(post({ dataset_id: DS }), xl.deps)).json()).error, "unsupported");
});

Deno.test("limite du plan gratuit : la base refuse → ligne et fichier supprimés, 422 plan_limit_rows", async () => {
  const { deps, log } = setup({
    download: () => Promise.resolve(csv(20000)),
    saveResult: () => Promise.resolve("plan_limit:rows"),
  });
  const res = await handleProcess(post({ dataset_id: DS }), deps);
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, "plan_limit_rows");
  assert.deepEqual(log, ["delete"]);
});

Deno.test("autre erreur base : 500 sans détail interne, dataset conservé", async () => {
  const { deps, log } = setup({ saveResult: () => Promise.resolve("connection refused to 10.0.0.1") });
  const res = await handleProcess(post({ dataset_id: DS }), deps);
  assert.equal(res.status, 500);
  assert.ok(!JSON.stringify(await res.json()).includes("10.0.0.1"));
  assert.deepEqual(log, []);
});

const OWNER = "bbbbbbbb-0000-0000-0000-00000000000b";

Deno.test("équipe : un éditeur actif traite le dataset du propriétaire (fichier dans le dossier du propriétaire)", async () => {
  const asked: string[] = [];
  const { deps, log } = setup(
    { canWriteWorkspace: (_h, owner) => { asked.push(owner); return Promise.resolve(true); } },
    { user_id: OWNER, path: `${OWNER}/p/1_f.csv` },
  );
  const res = await handleProcess(post({ dataset_id: DS }), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(log, ["save:3"]);
  assert.deepEqual(asked, [OWNER]);
});

Deno.test("ATTAQUE équipe: un viewer ou un étranger (droit d'écriture refusé) → 404, rien d'écrit", async () => {
  const { deps, log } = setup({ canWriteWorkspace: () => Promise.resolve(false) }, { user_id: OWNER, path: `${OWNER}/p/1_f.csv` });
  assert.equal((await handleProcess(post({ dataset_id: DS }), deps)).status, 404);
  assert.deepEqual(log, []);
});

Deno.test("ATTAQUE équipe: un éditeur ne peut pas pointer vers un fichier hors du dossier du propriétaire", async () => {
  for (const path of [`${UID}/p/mien.csv`, `${OWNER}/../${UID}/p/f.csv`]) {
    const { deps, log } = setup({ canWriteWorkspace: () => Promise.resolve(true) }, { user_id: OWNER, path });
    const res = await handleProcess(post({ dataset_id: DS }), deps);
    assert.equal(res.status, 400, path);
    assert.deepEqual(log, ["failed:invalid_path"]);
  }
});

Deno.test("le propriétaire n'appelle pas la vérification d'équipe", async () => {
  let called = false;
  const { deps } = setup({ canWriteWorkspace: () => { called = true; return Promise.resolve(false); } });
  assert.equal((await handleProcess(post({ dataset_id: DS }), deps)).status, 200);
  assert.equal(called, false);
});
