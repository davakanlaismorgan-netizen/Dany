import assert from "node:assert/strict";
import { buildFactsText, buildSystemPrompt, cleanCell, computeColumnStats, type FactsInput } from "./facts.ts";

const table = {
  headers: ["age", "ville", "vide"],
  rows: [["10", "Dakar", ""], ["20", "Dakar", ""], ["30", "Lomé", ""], ["", "Dakar", ""], ["40", "Cotonou", ""]],
};

Deno.test("statistiques numériques calculées exactement (moyenne, écart-type, min, médiane, max, manquantes)", () => {
  const s = computeColumnStats(table)[0];
  assert.equal(s.kind, "number");
  if (s.kind !== "number") return;
  assert.equal(s.count, 4);
  assert.equal(s.missing, 1);
  assert.equal(s.mean, 25);
  assert.equal(s.min, 10);
  assert.equal(s.max, 40);
  assert.equal(s.median, 25);
  assert.equal(s.std, 11.1803);
});

Deno.test("colonne texte : distinct et valeurs les plus fréquentes", () => {
  const s = computeColumnStats(table)[1];
  assert.equal(s.kind, "text");
  if (s.kind !== "text") return;
  assert.equal(s.distinct, 3);
  assert.deepEqual(s.top[0], { value: "Dakar", n: 3 });
});

Deno.test("colonne à forte cardinalité (identifiants, noms) : aucune valeur transmise au LLM", () => {
  const rows = Array.from({ length: 30 }, (_, i) => [`Awa Traoré ${i}`]);
  const s = computeColumnStats({ headers: ["nom"], rows })[0];
  assert.equal(s.kind, "text");
  if (s.kind !== "text") return;
  assert.equal(s.distinct, 30);
  assert.deepEqual(s.top, []);
  const txt = buildFactsText({ project: { name: "p", description: null }, datasets: [], models: [], pipelines: 0, visualizations: 0,
    selected: { name: "d", rows: 30, stats: [s], reason: "ok" } }, "fr");
  assert.ok(!txt.includes("Traoré") && txt.includes("non transmises"));
});

Deno.test("colonne entièrement vide : texte sans valeur", () => {
  const s = computeColumnStats(table)[2];
  assert.equal(s.kind, "text");
  assert.equal(s.count, 0);
  assert.equal(s.missing, 5);
});

Deno.test("colonne mixte (nombres et texte) : traitée comme texte", () => {
  const s = computeColumnStats({ headers: ["x"], rows: [["1"], ["a"], ["2"]] })[0];
  assert.equal(s.kind, "text");
});

Deno.test("cleanCell : retours à la ligne et contrôles supprimés, longueur bornée", () => {
  assert.equal(cleanCell("a\nb\u0000c"), "a b c");
  assert.equal(cleanCell("x".repeat(100)).length, 40);
});

const input = (over: Partial<FactsInput> = {}): FactsInput => ({
  project: { name: "Churn", description: null },
  datasets: [{ name: "clients", row_count: 5, column_count: 3, status: "profiled" }],
  selected: { name: "clients", rows: 5, stats: computeColumnStats(table), reason: "ok" },
  models: [{ name: "m1", task_type: "classification", algorithm: "random_forest", metrics: { accuracy: 0.91234567 }, dataset_name: "clients" }],
  pipelines: 1, visualizations: 2, ...over,
});

Deno.test("texte des faits : chiffres calculés, modèles, FR et EN", () => {
  const fr = buildFactsText(input(), "fr");
  assert.ok(fr.includes("moyenne=25") && fr.includes("accuracy=0.9123") && fr.includes("Pipelines: 1"));
  const en = buildFactsText(input(), "en");
  assert.ok(en.includes("mean=25") && en.includes("Trained AutoML models (1)"));
});

Deno.test("sans statistiques : dit clairement qu'aucun chiffre n'a été calculé", () => {
  const none = buildFactsText(input({ selected: { name: "", rows: 0, stats: null, reason: "none" } }), "fr");
  assert.ok(none.includes("aucune statistique n'a été calculée"));
  const big = buildFactsText(input({ selected: { name: "gros", rows: 0, stats: null, reason: "too_large" } }), "en");
  assert.ok(big.includes("too large"));
});

Deno.test("prompt système : règles, langue, données encadrées et déclarées non fiables", () => {
  const p = buildSystemPrompt("fr", "FAITS");
  assert.ok(p.includes("Ne calcule rien toi-même") && p.includes("<donnees>\nFAITS\n</donnees>") && p.includes("non fiable"));
  assert.ok(buildSystemPrompt("en", "F").includes("Answer in English"));
});
