import assert from "node:assert/strict";
import { parseTable, PipelineError, type PipelineNodeDef, runPipeline, type Table, tableToCsv } from "./pipeline.ts";

const enc = (s: string) => new TextEncoder().encode(s);
const SALES = parseTable("csv", enc("ville,produit,montant\nCotonou,riz,100\nCotonou,riz,100\nLomé,maïs,50\nLomé,riz,\nAbidjan,riz,300\n"));
const CITIES = parseTable("csv", enc("ville,pays\nCotonou,Bénin\nLomé,Togo\n"));

const n = (id: string, type: string, config: Record<string, unknown> = {}): PipelineNodeDef => ({ id, type, config });
const loader = (tables: Record<string, Table>) => (id: string) => Promise.resolve(tables[id]);

async function run(nodes: PipelineNodeDef[], edges: [string, string][], tables: Record<string, Table> = { s1: SALES }) {
  return await runPipeline(nodes, edges.map(([from, to]) => ({ from, to })), loader(tables));
}
const src = n("a", "source", { dataset_id: "s1" });
const out = n("z", "output", { name: "Résultat" });

async function code(p: Promise<unknown>): Promise<string> {
  try { await p; } catch (e) { if (e instanceof PipelineError) return e.code; throw e; }
  return "ok";
}

Deno.test("lecture : séparateur « ; », BOM, colonnes vides et doublons de noms", () => {
  const t = parseTable("csv", enc("﻿a;a;\n1;2;3\n"));
  assert.deepEqual(t.headers, ["a", "a_2", "col_3"]);
  assert.deepEqual(t.rows, [["1", "2", "3"]]);
});

Deno.test("filtre numérique, texte et vide", async () => {
  const gt = await run([src, n("f", "filter", { column: "montant", op: "gt", value: "60" }), out], [["a", "f"], ["f", "z"]]);
  assert.deepEqual(gt.table.rows.map((r) => r[2]), ["100", "100", "300"]); // la cellule vide n'est jamais « > 60 »
  const eq = await run([src, n("f", "filter", { column: "ville", op: "eq", value: "Lomé" }), out], [["a", "f"], ["f", "z"]]);
  assert.equal(eq.table.rows.length, 2);
  const empty = await run([src, n("f", "filter", { column: "montant", op: "empty" }), out], [["a", "f"], ["f", "z"]]);
  assert.equal(empty.table.rows.length, 1);
  const has = await run([src, n("f", "filter", { column: "produit", op: "contains", value: "MA" }), out], [["a", "f"], ["f", "z"]]);
  assert.equal(has.table.rows.length, 1);
});

Deno.test("sélection de colonnes (ordre respecté) et colonne inconnue", async () => {
  const r = await run([src, n("s", "select", { columns: ["montant", "ville"] }), out], [["a", "s"], ["s", "z"]]);
  assert.deepEqual(r.table.headers, ["montant", "ville"]);
  assert.deepEqual(r.table.rows[0], ["100", "Cotonou"]);
  assert.equal(await code(run([src, n("s", "select", { columns: ["nope"] }), out], [["a", "s"], ["s", "z"]])), "column_not_found");
});

Deno.test("dédoublonnage sur toutes les colonnes ou sur une sélection", async () => {
  const all = await run([src, n("d", "dedupe"), out], [["a", "d"], ["d", "z"]]);
  assert.equal(all.table.rows.length, 4);
  const by = await run([src, n("d", "dedupe", { columns: ["ville"] }), out], [["a", "d"], ["d", "z"]]);
  assert.deepEqual(by.table.rows.map((r) => r[0]), ["Cotonou", "Lomé", "Abidjan"]);
});

Deno.test("valeurs manquantes : moyenne, médiane, mode, constante, suppression", async () => {
  const f = (config: Record<string, unknown>) => run([src, n("m", "fill_missing", config), out], [["a", "m"], ["m", "z"]]);
  // montants présents : 100, 100, 50, 300 → moyenne 137.5, médiane 100
  assert.equal((await f({ column: "montant", strategy: "mean" })).table.rows[3][2], "137.5");
  assert.equal((await f({ column: "montant", strategy: "median" })).table.rows[3][2], "100");
  assert.equal((await f({ column: "montant", strategy: "mode" })).table.rows[3][2], "100");
  assert.equal((await f({ column: "montant", strategy: "constant", value: 0 })).table.rows[3][2], "0");
  assert.equal((await f({ column: "montant", strategy: "drop" })).table.rows.length, 4);
  assert.equal(await code(f({ column: "ville", strategy: "mean" })), "not_numeric");
  assert.equal(await code(f({ column: "montant", strategy: "magic" })), "invalid_config");
});

Deno.test("agrégation : groupes, count / sum / mean / min / max, cellules vides ignorées", async () => {
  const r = await run([src, n("g", "aggregate", {
    group_by: ["ville"],
    aggregations: [{ column: "*", fn: "count" }, { column: "montant", fn: "sum" }, { column: "montant", fn: "mean" }, { column: "montant", fn: "max" }],
  }), out], [["a", "g"], ["g", "z"]]);
  assert.deepEqual(r.table.headers, ["ville", "count_rows", "sum_montant", "mean_montant", "max_montant"]);
  assert.deepEqual(r.table.rows, [
    ["Cotonou", "2", "200", "100", "100"],
    ["Lomé", "2", "50", "50", "50"], // 2 lignes, mais une seule valeur renseignée
    ["Abidjan", "1", "300", "300", "300"],
  ]);
  const total = await run([src, n("g", "aggregate", { aggregations: [{ column: "montant", fn: "sum" }] }), out], [["a", "g"], ["g", "z"]]);
  assert.deepEqual(total.table.rows, [["550"]]);
});

Deno.test("jointure interne et gauche ; l'ordre des liens définit gauche et droite", async () => {
  const nodes = (kind: string) => [src, n("b", "source", { dataset_id: "s2" }), n("j", "join", { left_key: "ville", right_key: "ville", kind }), out];
  const edges: [string, string][] = [["a", "j"], ["b", "j"], ["j", "z"]];
  const tables = { s1: SALES, s2: CITIES };
  const inner = await run(nodes("inner"), edges, tables);
  assert.deepEqual(inner.table.headers, ["ville", "produit", "montant", "pays"]);
  assert.equal(inner.table.rows.length, 4); // Abidjan n'a pas de correspondance
  const left = await run(nodes("left"), edges, tables);
  assert.equal(left.table.rows.length, 5);
  assert.deepEqual(left.table.rows[4], ["Abidjan", "riz", "300", ""]);
});

Deno.test("chaîne complète : nettoyer puis agréger, avec le détail par étape", async () => {
  const r = await run(
    [src, n("d", "dedupe"), n("m", "fill_missing", { column: "montant", strategy: "drop" }),
      n("g", "aggregate", { group_by: ["produit"], aggregations: [{ column: "montant", fn: "sum" }] }), out],
    [["a", "d"], ["d", "m"], ["m", "g"], ["g", "z"]],
  );
  assert.deepEqual(r.table.rows, [["riz", "400"], ["maïs", "50"]]);
  assert.deepEqual(r.steps.map((s) => s.rows_out), [5, 4, 3, 2, 2]);
  assert.equal(r.output_name, "Résultat");
});

Deno.test("graphe invalide : cycle, sortie absente, bloc isolé, entrées, types, doublons", async () => {
  assert.equal(await code(run([src, n("f", "filter", { column: "ville", op: "empty" })], [["a", "f"]])), "no_output");
  assert.equal(await code(run([src, out, n("x", "source", { dataset_id: "s1" })], [["a", "z"]])), "dangling_node");
  assert.equal(await code(run([src, n("f", "filter"), out], [["a", "f"]])), "wrong_inputs"); // sortie sans entrée
  assert.equal(await code(run([n("f", "dedupe"), n("g", "dedupe"), out], [["f", "g"], ["g", "f"], ["g", "z"]])), "cycle");
  assert.equal(await code(run([src, n("q", "automl"), out], [["a", "q"], ["q", "z"]])), "unknown_node_type");
  assert.equal(await code(run([src, src, out], [["a", "z"]])), "invalid_graph");
  assert.equal(await code(run([src, out], [["a", "z"], ["a", "z"]])), "wrong_inputs");
  assert.equal(await code(run([src, n("j", "join", { left_key: "ville", right_key: "ville" }), out], [["a", "j"], ["j", "z"]])), "wrong_inputs");
  assert.equal(await code(run(Array.from({ length: 31 }, (_, i) => n(`n${i}`, "source")), [])), "too_many_nodes");
});

Deno.test("résultat vide refusé ; source introuvable propagée avec le bloc fautif", async () => {
  const none = run([src, n("f", "filter", { column: "ville", op: "eq", value: "Paris" }), out], [["a", "f"], ["f", "z"]]);
  assert.equal(await code(none), "empty_result");
  const missing = runPipeline([src, out], [{ from: "a", to: "z" }], () => Promise.reject(new PipelineError("source_not_found", "a")));
  assert.equal(await code(missing), "source_not_found");
});

Deno.test("export CSV : guillemets, virgules, accents, BOM", () => {
  const csv = new TextDecoder("utf-8", { ignoreBOM: true }).decode(tableToCsv({ headers: ["a", "b"], rows: [["x,y", 'dit "oui"'], ["é", ""]] }));
  assert.equal(csv, '﻿a,b\n"x,y","dit ""oui"""\né,\n');
  assert.deepEqual(parseTable("csv", tableToCsv({ headers: ["a", "b"], rows: [["x,y", "é"]] })).rows, [["x,y", "é"]]);
});
