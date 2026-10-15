import assert from "node:assert/strict";
import { AutoMlError, candidatesFor, classificationMetrics, prepare, regressionMetrics, runAutoMl } from "./automl.ts";
import type { Table } from "./pipeline.ts";

// Générateur déterministe pour des jeux de données synthétiques.
function lcg(seed: number) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
const table = (headers: string[], rows: (string | number)[][]): Table => ({ headers, rows: rows.map((r) => r.map(String)) });

function regressionData(n = 400): Table {
  const r = lcg(1);
  return table(["a", "b", "bruit", "y"], Array.from({ length: n }, () => {
    const a = gauss(r), b = gauss(r), bruit = gauss(r);
    return [a.toFixed(4), b.toFixed(4), bruit.toFixed(4), (3 * a + 0.5 * b + 0.1 * gauss(r)).toFixed(4)];
  }));
}
// Classe = XOR de deux signes : invisible pour un modèle linéaire, évident pour un arbre.
function xorData(n = 600): Table {
  const r = lcg(2);
  return table(["x1", "x2", "x3", "classe"], Array.from({ length: n }, () => {
    const x1 = gauss(r), x2 = gauss(r), x3 = gauss(r);
    return [x1.toFixed(3), x2.toFixed(3), x3.toFixed(3), (x1 > 0) !== (x2 > 0) ? "oui" : "non"];
  }));
}

Deno.test("régression : retrouve la vraie relation, bat nettement la référence, importance correcte", () => {
  const res = runAutoMl(prepare(regressionData(), "y", "regression"), "free");
  assert.equal(res.algorithm, "linear");
  assert.ok(res.metrics.r2 > 0.95, `r2=${res.metrics.r2}`);
  assert.ok(res.baseline.r2 <= 0.01, "la référence (moyenne) n'explique rien");
  const imp = Object.entries(res.feature_importance).sort((a, b) => b[1] - a[1]);
  assert.equal(imp[0][0], "a");
  assert.ok(res.feature_importance.bruit < 0.05);
  assert.ok(Math.abs(Object.values(res.feature_importance).reduce((a, b) => a + b, 0) - 1) < 0.01);
  assert.equal(res.folds, 5);
});

Deno.test("classification : un arbre/une forêt résout le XOR, pas le modèle linéaire", () => {
  const res = runAutoMl(prepare(xorData(), "classe", "classification"), "free");
  assert.notEqual(res.algorithm, "linear");
  assert.ok(res.metrics.accuracy > 0.9, `acc=${res.metrics.accuracy}`);
  const lin = res.leaderboard.find((e) => e.algorithm === "linear")!;
  assert.ok(lin.metrics.accuracy < 0.65, "la régression logistique ne peut pas apprendre un XOR");
  assert.deepEqual(Object.keys(res.feature_importance).slice(0, 2).sort(), ["x1", "x2"]);
  assert.equal(res.leaderboard.length, 3); // plan gratuit : 3 types de modèles
  assert.equal(res.n_rows_used, 600);
});

Deno.test("honnêteté : sur des étiquettes aléatoires, aucun score gonflé (validation croisée hors échantillon)", () => {
  const r = lcg(3);
  const t = table(["a", "b", "c", "classe"], Array.from({ length: 500 }, () => [gauss(r).toFixed(3), gauss(r).toFixed(3), gauss(r).toFixed(3), r() < 0.5 ? "A" : "B"]));
  const res = runAutoMl(prepare(t, "classe", "classification"), "premium");
  assert.ok(res.metrics.accuracy < 0.6, `acc=${res.metrics.accuracy} : un modèle qui sur-apprend aurait affiché bien plus`);
  assert.ok(res.metrics.f1_macro < 0.6);
});

Deno.test("Premium : plus de candidats (réglages) que le plan gratuit ; reproductible avec la même graine", () => {
  assert.ok(candidatesFor("premium").length > candidatesFor("free").length);
  assert.equal(candidatesFor("free").length, 3);
  const p = () => runAutoMl(prepare(xorData(300), "classe", "classification"), "premium", { seed: 7 });
  const a = p(), b = p();
  assert.deepEqual(a.metrics, b.metrics);
  assert.deepEqual(a.leaderboard, b.leaderboard);
  assert.ok(a.leaderboard.length > 3);
});

Deno.test("jamais pire que la référence : si rien n'est appris, le résultat le dit (algorithme « baseline »)", () => {
  const r = lcg(4);
  const t = table(["a", "classe"], Array.from({ length: 200 }, () => [gauss(r).toFixed(3), r() < 0.9 ? "A" : "B"]));
  const res = runAutoMl(prepare(t, "classe", "classification"), "free");
  assert.ok(res.metrics.accuracy >= res.baseline.accuracy - 1e-9);
});

Deno.test("variables : valeurs manquantes, catégories, colonnes constantes ou identifiants écartées", () => {
  const r = lcg(5);
  const rows = Array.from({ length: 300 }, (_, i) => {
    const ville = ["Cotonou", "Lomé", "Accra"][i % 3];
    const x = gauss(r);
    return [i === 7 ? "" : x.toFixed(3), ville, "cst", `id${i}`, (ville === "Lomé" ? 10 : 0) + x].map(String);
  });
  const prep = prepare({ headers: ["x", "ville", "cst", "ident", "y"], rows }, "y", "regression");
  assert.deepEqual(prep.names.filter((n) => n.startsWith("ville=")).sort(), ["ville=Accra", "ville=Cotonou", "ville=Lomé"]);
  assert.deepEqual(prep.dropped.map((d) => `${d.column}:${d.reason}`).sort(), ["cst:constant", "ident:id_like"]);
  assert.ok(Number.isNaN(prep.X[7][0]), "valeur manquante conservée pour être imputée sur l'entraînement seulement");
  const res = runAutoMl(prep, "free");
  assert.ok(res.metrics.r2 > 0.9);
  assert.equal(Object.keys(res.feature_importance)[0], "ville");
});

Deno.test("grands fichiers : échantillon reproductible, et le nombre de lignes réel est indiqué", () => {
  const r = lcg(6);
  const big = table(["a", "y"], Array.from({ length: 6000 }, () => { const a = gauss(r); return [a.toFixed(3), (2 * a).toFixed(3)]; }));
  const prep = prepare(big, "y", "regression");
  assert.equal(prep.sampled, true);
  assert.equal(prep.X.length, 1000);
  assert.equal(prep.rowsTotal, 6000);
  assert.deepEqual(prepare(big, "y", "regression").y.slice(0, 5), prep.y.slice(0, 5));
});

Deno.test("erreurs : cible absente, non numérique, trop peu de lignes, classe unique, trop de classes, rien d'utilisable", () => {
  const code = (f: () => unknown) => { try { f(); } catch (e) { if (e instanceof AutoMlError) return e.code; throw e; } return "ok"; };
  const t = xorData(100);
  assert.equal(code(() => prepare(t, "nope", "classification")), "target_not_found");
  assert.equal(code(() => prepare(t, "classe", "regression")), "target_not_numeric");
  assert.equal(code(() => prepare(xorData(10), "classe", "classification")), "too_few_rows");
  assert.equal(code(() => prepare(table(["a", "c"], Array.from({ length: 50 }, (_, i) => [i, "A"])), "c", "classification")), "single_class");
  assert.equal(code(() => prepare(table(["a", "c"], Array.from({ length: 100 }, (_, i) => [i, `c${i % 25}`])), "c", "classification")), "too_many_classes");
  assert.equal(code(() => prepare(table(["k", "y"], Array.from({ length: 50 }, (_, i) => ["z", i])), "y", "regression")), "no_usable_features");
  assert.equal(code(() => prepare(t, "classe", "classification", { features: ["inconnue"] })), "unknown_feature");
});

Deno.test("métriques : valeurs calculées à la main", () => {
  assert.deepEqual(classificationMetrics([0, 0, 1, 1], [0, 1, 1, 1], 2), { accuracy: 0.75, f1_macro: 0.7333, precision_macro: 0.8333, recall_macro: 0.75 });
  assert.deepEqual(regressionMetrics([1, 2, 3], [1, 2, 4]), { rmse: 0.5774, mae: 0.3333, r2: 0.5 });
});

Deno.test("budget de temps strict : un candidat en cours est abandonné et signalé, le résultat reste valide", () => {
  const prep = prepare(xorData(900), "classe", "classification");
  const res = runAutoMl(prep, "premium", { deadline: Date.now() + 5000, hardDeadline: Date.now() + 1 });
  assert.ok(res.skipped.length > 0);
  assert.ok(Number.isFinite(res.metrics.accuracy));
});

Deno.test("Premium : les 3 modèles de base passent avant les réglages supplémentaires", () => {
  assert.deepEqual(candidatesFor("premium").slice(0, 3), candidatesFor("free"));
});

Deno.test("budget de temps : les candidats non évalués sont signalés, pas cachés", () => {
  const res = runAutoMl(prepare(regressionData(100), "y", "regression"), "premium", { deadline: Date.now() - 1 });
  assert.equal(res.leaderboard.length, 0);
  assert.equal(res.algorithm, "baseline");
  assert.ok(res.skipped.length > 0);
});
