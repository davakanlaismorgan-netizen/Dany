import assert from "node:assert/strict";
import { type DeleteDeps, handleDelete } from "./handler.ts";

function setup(over: Partial<DeleteDeps> = {}) {
  const log: string[] = [];
  const deps: DeleteDeps = {
    env: () => "https://das.example.com",
    getUserId: () => Promise.resolve("u1"),
    removeUserFiles: () => { log.push("files"); return Promise.resolve(null); },
    deleteUser: () => { log.push("user"); return Promise.resolve(null); },
    ...over,
  };
  return { deps, log };
}
const post = (body: unknown, auth = true) =>
  new Request("https://f/d", { method: "POST", headers: auth ? { Authorization: "Bearer t" } : {}, body: JSON.stringify(body) });

Deno.test("suppression : fichiers d'abord, puis compte", async () => {
  const { deps, log } = setup();
  const res = await handleDelete(post({ confirm: true }), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(log, ["files", "user"]);
});

Deno.test("sans confirmation explicite, ou sans authentification : rien n'est supprimé", async () => {
  const a = setup();
  assert.equal((await handleDelete(post({}), a.deps)).status, 400);
  assert.equal((await handleDelete(post({ confirm: "true" }), a.deps)).status, 400);
  const b = setup();
  assert.equal((await handleDelete(post({ confirm: true }, false), b.deps)).status, 401);
  assert.equal(a.log.length + b.log.length, 0);
});

Deno.test("si le nettoyage Storage échoue, le compte est conservé (opération relançable)", async () => {
  const { deps, log } = setup({ removeUserFiles: () => { log2.push("files"); return Promise.resolve("datasets: boom"); } });
  const log2: string[] = [];
  const res = await handleDelete(post({ confirm: true }), deps);
  assert.equal(res.status, 500);
  assert.equal((await res.json()).error, "storage_cleanup_failed");
  assert.deepEqual(log, []); // deleteUser jamais appelé
  assert.deepEqual(log2, ["files"]);
});
