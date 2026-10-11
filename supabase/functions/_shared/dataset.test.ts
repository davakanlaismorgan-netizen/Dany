import assert from "node:assert/strict";
import { DatasetError, decodeText, MAX_ROWS, profileCsv, profileFile, profileJson } from "./dataset.ts";

const enc = (s: string) => new TextEncoder().encode(s);

Deno.test("CSV virgule : lignes, colonnes, types, valeurs manquantes", () => {
  const p = profileCsv(enc("nom,age,ville\nAda,36,Cotonou\nBob,,Lomé\nEve,29,\n"));
  assert.equal(p.rowCount, 3);
  assert.deepEqual(p.headers, ["nom", "age", "ville"]);
  assert.equal(p.columns[1].type, "number");
  assert.equal(p.columns[1].missing, 1);
  assert.equal(p.columns[2].missing, 1);
  assert.equal(p.columns[0].type, "text");
  assert.equal(p.delimiter, ",");
});

Deno.test("séparateur point-virgule (Excel FR), BOM et décimales à virgule", () => {
  const p = profileCsv(enc("\uFEFFnom;prix\nA;1,5\nB;2,25\n"));
  assert.deepEqual(p.headers, ["nom", "prix"]); // pas de BOM dans le 1er nom
  assert.equal(p.delimiter, ";");
  assert.equal(p.columns[1].type, "number");
  assert.equal(p.rowCount, 2);
});

Deno.test("tabulation et champs entre guillemets contenant des virgules et retours à la ligne", () => {
  const t = profileCsv(enc("a\tb\n1\t2\n3\t4\n"));
  assert.equal(t.delimiter, "\t");
  assert.equal(t.rowCount, 2);
  const q = profileCsv(enc('n,note\nA,"x, y"\nB,"ligne1\nligne2"\n'));
  assert.equal(q.rowCount, 2);
  assert.equal(q.preview[1][1], "ligne1\nligne2");
});

Deno.test("encodage Windows-1252 détecté et décodé", () => {
  const bytes = new Uint8Array([...enc("ville\n"), 0x4c, 0x6f, 0x6d, 0xe9, 0x0a]); // « Lomé » en latin-1
  assert.equal(decodeText(bytes).encoding, "windows-1252");
  const p = profileCsv(bytes);
  assert.equal(p.preview[0][0], "Lomé");
  assert.equal(profileCsv(enc("é\nà\n")).encoding, "utf-8");
});

Deno.test("lignes vides ignorées, lignes irrégulières comptées, en-têtes dupliqués/vides rendus uniques", () => {
  const p = profileCsv(enc("a,a,\n1,2,3\n\n4,5\n6,7,8,9\n"));
  assert.deepEqual(p.headers, ["a", "a_2", "col_3"]);
  assert.equal(p.rowCount, 3);
  assert.equal(p.badRows, 2);
});

Deno.test("fichier vide ou sans ligne de données refusé", () => {
  for (const s of ["", "\n\n", "a,b\n"]) {
    assert.throws(() => profileCsv(enc(s)), (e: unknown) => e instanceof DatasetError && e.code === "empty");
  }
});

Deno.test("l'aperçu est borné à 100 lignes mais le compte est exact", () => {
  const rows = Array.from({ length: 12345 }, (_, i) => `${i},x`).join("\n");
  const p = profileCsv(enc("id,v\n" + rows));
  assert.equal(p.rowCount, 12345);
  assert.equal(p.preview.length, 100);
});

Deno.test("trop de lignes ou de colonnes : refus explicite", () => {
  const big = "a\n" + "1\n".repeat(MAX_ROWS + 1);
  assert.throws(() => profileCsv(enc(big)), (e: unknown) => e instanceof DatasetError && e.code === "too_many_rows");
  const wide = Array.from({ length: 501 }, (_, i) => `c${i}`).join(",") + "\n1\n";
  assert.throws(() => profileCsv(enc(wide)), (e: unknown) => e instanceof DatasetError && e.code === "too_many_columns");
});

Deno.test("JSON : tableau d'objets, clés hétérogènes, objet unique", () => {
  const p = profileJson(enc('[{"a":1,"b":"x"},{"a":2,"c":null},{"a":3}]'));
  assert.equal(p.rowCount, 3);
  assert.deepEqual(p.headers, ["a", "b", "c"]);
  assert.equal(p.columns[0].type, "number");
  assert.equal(p.columns[2].missing, 3);
  assert.equal(profileJson(enc('{"a":1}')).rowCount, 1);
});

Deno.test("JSON invalide ou sans objets : refus", () => {
  for (const s of ["{pas json", "[1,2,3]", "[]", '"texte"']) {
    assert.throws(() => profileJson(enc(s)), (e: unknown) => e instanceof DatasetError && e.code === "invalid_json", s);
  }
});

Deno.test("format non supporté (ex. Excel) : refus, jamais d'invention de statistiques", () => {
  assert.throws(() => profileFile("excel", enc("x")), (e: unknown) => e instanceof DatasetError && e.code === "unsupported");
});
