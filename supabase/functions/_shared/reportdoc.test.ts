import assert from "node:assert/strict";
import { buildReport, csvCell, findings, type ReportInput } from "./reportdoc.ts";

const latin1 = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  project: { name: "Churn Q3", description: "Analyse du désabonnement" },
  datasets: [{
    name: "clients", row_count: 1200, column_count: 3, status: "profiled",
    profiling: { badRows: 2, columns: [{ name: "age", type: "number", missing: 0, distinct: 60 }, { name: "ville", type: "text", missing: 480, distinct: 12 }] },
  }],
  models: [{
    name: "Churn", task_type: "classification", algorithm: "random_forest", dataset_name: "clients", created_at: "2026-10-01T10:00:00Z",
    metrics: { accuracy: 0.91, f1_macro: 0.88, precision_macro: 0.89, recall_macro: 0.87 },
    feature_importance: { age: 0.6, ville: 0.4 },
    config: { target_column: "churn", n_rows_used: 1000, baseline: { f1_macro: 0.47, accuracy: 0.7 }, leaderboard: [{ label: "arbre", score: 0.8 }, { label: "forêt", score: 0.88 }] },
  }],
  pipelines: [{ name: "Nettoyage", status: "completed", nodes: [{}, {}] }],
  visualizations: [{ name: "Répartition", chart_type: "bar" }],
  lang: "fr", brand: { kind: "das" }, generatedAt: new Date("2026-10-17T08:00:00Z"), ...over,
});

Deno.test("PDF gratuit : marque DAS, nom du projet et chiffres réels du modèle", () => {
  const r = buildReport("detailed", input({ lang: "en" }));
  assert.equal(r.extension, "pdf");
  const s = latin1(r.bytes);
  assert.ok(s.startsWith("%PDF-"));
  assert.ok(s.includes("Generated with DAS"));
  assert.ok(s.includes("(Churn Q3)") || s.includes("Churn Q3"));
  assert.ok(s.includes("0.88")); // F1 réel, jamais inventé
});

Deno.test("PDF marque blanche : le nom du client remplace DAS, aucune mention de DAS", () => {
  for (const template of ["exec", "detailed"] as const) {
    const s = latin1(buildReport(template, input({ brand: { kind: "custom", name: "Acme Analytics", logo: null } })).bytes);
    assert.ok(s.includes("Acme Analytics"));
    assert.ok(!/DAS/.test(s), `DAS apparaît dans le modèle ${template}`);
  }
});

Deno.test("rapport sans aucune donnée : se génère quand même, avec un message clair", () => {
  const s = latin1(buildReport("detailed", input({ datasets: [], models: [], pipelines: [], visualizations: [], lang: "en" })).bytes);
  assert.ok(s.includes("No model has been trained"));
  assert.ok(s.includes("No dataset in this project"));
});

Deno.test("constats : valeurs manquantes, lignes mal formées, modèle sans gain, R² faible, variable principale", () => {
  const f = findings(input());
  assert.ok(f.some((x) => x.includes("ville") && x.includes("40 %")), f.join("|"));
  assert.ok(f.some((x) => x.includes("2 ligne")));
  assert.ok(f.some((x) => x.includes("« age »")));
  const weak = findings(input({
    models: [{ ...input().models[0], task_type: "regression", metrics: { r2: 0.1, rmse: 10 }, feature_importance: {}, config: { baseline: { rmse: 10.1 } } }],
    datasets: [],
  }));
  assert.ok(weak.some((x) => x.includes("ne fait pas nettement mieux")));
  assert.ok(weak.some((x) => x.includes("R² faible")));
  assert.deepEqual(findings(input({ datasets: [], models: [] })).length, 1);
});

Deno.test("CSV : BOM, séparateur selon la langue, une ligne par modèle, valeurs réelles", () => {
  const r = buildReport("data", input());
  assert.equal(r.extension, "csv");
  assert.ok(r.contentType.startsWith("text/csv"));
  const text = new TextDecoder().decode(r.bytes);
  assert.deepEqual([...r.bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]); // BOM : Excel reconnaît l'UTF-8
  const lines = text.trim().split("\r\n");
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes(";") && lines[1].includes("0,88"));
  assert.ok(new TextDecoder().decode(buildReport("data", input({ lang: "en" })).bytes).includes("0.88"));
});

Deno.test("CSV : les formules (=, +, -, @) sont neutralisées, les guillemets doublés, les nombres négatifs gardés", () => {
  assert.equal(csvCell("=HYPERLINK(\"x\")", ","), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(csvCell("+1 2", ","), "'+1 2");
  assert.equal(csvCell("@cmd", ","), "'@cmd");
  assert.equal(csvCell("-0,5", ";"), "-0,5");
  assert.equal(csvCell("a;b", ";"), "\"a;b\"");
  assert.equal(csvCell(null, ","), "");
});
