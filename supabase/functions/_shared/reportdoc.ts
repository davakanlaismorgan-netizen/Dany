// Contenu des rapports : uniquement des chiffres lus dans la base (jeux de données profilés, modèles évalués,
// pipelines, visualisations). Les « constats » sont des règles fixes appliquées à ces chiffres, jamais du texte inventé.
import { type Jpeg, PdfBuilder, type Rgb } from "./pdf.ts";

export type Lang = "fr" | "en";
export type Template = "exec" | "detailed" | "data";
export const TEMPLATES: Template[] = ["exec", "detailed", "data"];

export type Brand = { kind: "das" } | { kind: "custom"; name: string; logo: Jpeg | null };

export interface ColumnProfile { name: string; type: string; missing: number; distinct: number }
export interface DatasetRow {
  name: string;
  row_count: number | null;
  column_count: number | null;
  status: string | null;
  profiling: { columns?: ColumnProfile[]; badRows?: number } | null;
}
export interface ModelRow {
  name: string;
  task_type: string | null;
  algorithm: string | null;
  metrics: Record<string, number> | null;
  feature_importance: Record<string, number> | null;
  config: Record<string, unknown> | null;
  created_at: string;
  dataset_name: string | null;
}
export interface ReportInput {
  project: { name: string; description: string | null };
  datasets: DatasetRow[];
  models: ModelRow[];
  pipelines: { name: string | null; status: string | null; nodes: unknown }[];
  visualizations: { name: string; chart_type: string | null }[];
  lang: Lang;
  brand: Brand;
  generatedAt: Date;
}
export interface BuiltReport { bytes: Uint8Array; contentType: string; extension: "pdf" | "csv" }

const DAS_ACCENT: Rgb = [176, 112, 28];
const CUSTOM_ACCENT: Rgb = [38, 50, 56];

const TXT = {
  fr: {
    exec: "Synthèse exécutive", detailed: "Analyse détaillée", data: "Synthèse des modèles",
    project: "Projet", generated: "Généré le", summary: "Chiffres clés", datasets: "Jeux de données", rows: "lignes", columns: "colonnes",
    models: "Modèles évalués", pipelines: "Pipelines", visualizations: "Visualisations", bestModel: "Meilleur modèle",
    findings: "Constats automatiques", findingsNote: "Règles fixes appliquées aux chiffres de ce rapport ; ils ne remplacent pas l'avis d'un analyste.",
    none: "Aucun", noModels: "Aucun modèle n'a encore été entraîné dans ce projet.", noData: "Aucun jeu de données dans ce projet.",
    importance: "Variables les plus influentes", metric: "Mesure", value: "Valeur", baseline: "Référence (modèle naïf)",
    name: "Nom", type: "Type", missing: "Manquants", distinct: "Valeurs distinctes", algorithm: "Algorithme", status: "Statut",
    nodes: "blocs", target: "Cible", task: "Tâche", leaderboard: "Comparaison des candidats", score: "Score",
    classification: "classification", regression: "régression", page: (n: number, t: number) => `Page ${n} / ${t}`,
    dasFooter: "Généré avec DAS — plateforme de data science", dasSub: "Plateforme de data science",
    best: "retenu", dataQuality: "Qualité des données",
    f: {
      missing: (d: string, c: string, p: number) => `Jeu « ${d} » : la colonne « ${c} » a ${p} % de valeurs manquantes.`,
      badRows: (d: string, n: number) => `Jeu « ${d} » : ${n} ligne(s) n'ont pas le nombre de colonnes attendu.`,
      noBeat: (m: string) => `Modèle « ${m} » : il ne fait pas nettement mieux que le modèle naïf de référence.`,
      weakR2: (m: string, v: string) => `Modèle « ${m} » : R² faible (${v}) — les variables retenues expliquent peu la cible.`,
      top: (m: string, f: string) => `Modèle « ${m} » : la variable la plus influente est « ${f} ».`,
      ok: "Aucun point d'attention détecté par les règles automatiques.",
    },
    metricNames: { accuracy: "Exactitude", f1_macro: "F1 (macro)", precision_macro: "Précision (macro)", recall_macro: "Rappel (macro)", rmse: "RMSE", mae: "MAE", r2: "R²" } as Record<string, string>,
    csvHeader: ["modele", "tache", "algorithme", "jeu_de_donnees", "cible", "exactitude", "f1_macro", "precision_macro", "rappel_macro", "rmse", "mae", "r2", "lignes_utilisees", "date"],
  },
  en: {
    exec: "Executive summary", detailed: "Detailed analysis", data: "Models summary",
    project: "Project", generated: "Generated on", summary: "Key figures", datasets: "Datasets", rows: "rows", columns: "columns",
    models: "Evaluated models", pipelines: "Pipelines", visualizations: "Visualizations", bestModel: "Best model",
    findings: "Automatic findings", findingsNote: "Fixed rules applied to the figures in this report; they do not replace an analyst's judgement.",
    none: "None", noModels: "No model has been trained in this project yet.", noData: "No dataset in this project.",
    importance: "Most influential variables", metric: "Metric", value: "Value", baseline: "Baseline (naive model)",
    name: "Name", type: "Type", missing: "Missing", distinct: "Distinct values", algorithm: "Algorithm", status: "Status",
    nodes: "blocks", target: "Target", task: "Task", leaderboard: "Candidate comparison", score: "Score",
    classification: "classification", regression: "regression", page: (n: number, t: number) => `Page ${n} / ${t}`,
    dasFooter: "Generated with DAS — data science platform", dasSub: "Data science platform",
    best: "selected", dataQuality: "Data quality",
    f: {
      missing: (d: string, c: string, p: number) => `Dataset "${d}": column "${c}" has ${p}% missing values.`,
      badRows: (d: string, n: number) => `Dataset "${d}": ${n} row(s) do not have the expected number of columns.`,
      noBeat: (m: string) => `Model "${m}": it does not clearly beat the naive baseline.`,
      weakR2: (m: string, v: string) => `Model "${m}": low R² (${v}) — the selected variables explain little of the target.`,
      top: (m: string, f: string) => `Model "${m}": the most influential variable is "${f}".`,
      ok: "No point of attention detected by the automatic rules.",
    },
    metricNames: { accuracy: "Accuracy", f1_macro: "F1 (macro)", precision_macro: "Precision (macro)", recall_macro: "Recall (macro)", rmse: "RMSE", mae: "MAE", r2: "R²" } as Record<string, string>,
    csvHeader: ["model", "task", "algorithm", "dataset", "target", "accuracy", "f1_macro", "precision_macro", "recall_macro", "rmse", "mae", "r2", "rows_used", "date"],
  },
} as const;

type Txt = (typeof TXT)[Lang];

const fmtNum = (v: number, lang: Lang, digits = 3) => {
  const s = (Math.round(v * 10 ** digits) / 10 ** digits).toFixed(digits).replace(/\.?0+$/, "");
  return lang === "fr" ? s.replace(".", ",") : s;
};
const fmtInt = (v: number | null | undefined, lang: Lang) => {
  const s = String(Math.round(v ?? 0)).replace(/\B(?=(\d{3})+(?!\d))/g, lang === "fr" ? " " : ",");
  return s;
};
const dateStr = (d: Date) => d.toISOString().slice(0, 10);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const taskLabel = (t: Txt, task: string | null) => (task === "classification" ? t.classification : task === "regression" ? t.regression : task ?? "");

function bestOf(models: ModelRow[]): ModelRow | null {
  // Le « meilleur » n'a de sens qu'entre modèles de même tâche : on retient le plus récent entraîné avec le meilleur score.
  const score = (m: ModelRow) => (m.task_type === "regression" ? (m.metrics?.r2 ?? -Infinity) : (m.metrics?.f1_macro ?? -Infinity));
  let best: ModelRow | null = null;
  for (const m of models) {
    if (!isNum(score(m)) || score(m) === -Infinity) continue;
    if (!best || score(m) > score(best)) best = m;
  }
  return best;
}

export function findings(input: ReportInput): string[] {
  const t = TXT[input.lang];
  const out: string[] = [];
  for (const d of input.datasets) {
    const rows = d.row_count ?? 0;
    for (const c of d.profiling?.columns ?? []) {
      if (rows > 0 && c.missing / rows > 0.2) out.push(t.f.missing(d.name, c.name, Math.round((c.missing / rows) * 100)));
    }
    if ((d.profiling?.badRows ?? 0) > 0) out.push(t.f.badRows(d.name, d.profiling!.badRows!));
  }
  for (const m of input.models) {
    const base = (m.config?.baseline ?? null) as Record<string, number> | null;
    if (m.task_type === "classification" && isNum(m.metrics?.f1_macro) && isNum(base?.f1_macro) && m.metrics!.f1_macro <= base!.f1_macro + 0.02) out.push(t.f.noBeat(m.name));
    if (m.task_type === "regression" && isNum(m.metrics?.rmse) && isNum(base?.rmse) && m.metrics!.rmse >= base!.rmse * 0.98) out.push(t.f.noBeat(m.name));
    if (m.task_type === "regression" && isNum(m.metrics?.r2) && m.metrics!.r2 < 0.3) out.push(t.f.weakR2(m.name, fmtNum(m.metrics!.r2, input.lang)));
    const top = Object.entries(m.feature_importance ?? {}).filter(([, v]) => isNum(v)).sort((a, b) => b[1] - a[1])[0];
    if (top) out.push(t.f.top(m.name, top[0]));
  }
  return out.length ? out.slice(0, 25) : [t.f.ok];
}

function metricRows(m: ModelRow, t: Txt, lang: Lang): string[][] {
  const base = (m.config?.baseline ?? {}) as Record<string, number>;
  return Object.entries(m.metrics ?? {}).filter(([, v]) => isNum(v)).map(([k, v]) => [
    t.metricNames[k] ?? k, fmtNum(v, lang), isNum(base[k]) ? fmtNum(base[k], lang) : "",
  ]);
}

// ---------------------------------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------------------------------

export function buildPdf(template: "exec" | "detailed", input: ReportInput): Uint8Array {
  const { lang, brand } = input;
  const t = TXT[lang];
  const custom = brand.kind === "custom";
  const title = `${t[template]} — ${input.project.name}`;
  const pdf = new PdfBuilder({
    title,
    footer: custom ? brand.name : t.dasFooter,
    accent: custom ? CUSTOM_ACCENT : DAS_ACCENT,
    brandName: custom ? brand.name : "DAS",
    brandSubtitle: custom ? undefined : t.dasSub,
    logo: custom ? brand.logo : null,
    pageLabel: t.page,
  });

  pdf.title(t[template]);
  pdf.keyValues([[t.project, input.project.name], [t.generated, dateStr(input.generatedAt)]]);
  if (input.project.description) pdf.paragraph(input.project.description);

  const totalRows = input.datasets.reduce((s, d) => s + (d.row_count ?? 0), 0);
  const best = bestOf(input.models);
  pdf.heading(t.summary);
  pdf.keyValues([
    [t.datasets, `${input.datasets.length} (${fmtInt(totalRows, lang)} ${t.rows})`],
    [t.models, String(input.models.length)],
    [t.pipelines, String(input.pipelines.length)],
    [t.visualizations, String(input.visualizations.length)],
  ]);

  pdf.heading(t.bestModel);
  if (!best) pdf.paragraph(t.noModels);
  else {
    pdf.keyValues([
      [t.name, best.name], [t.task, taskLabel(t, best.task_type)], [t.algorithm, best.algorithm ?? ""],
      ...(best.dataset_name ? ([[t.datasets, best.dataset_name]] as [string, string][]) : []),
    ]);
    pdf.table([t.metric, t.value, t.baseline], metricRows(best, t, lang), [0.5, 0.2, 0.3], ["l", "r", "r"]);
    const imp = Object.entries(best.feature_importance ?? {}).filter(([, v]) => isNum(v)).sort((a, b) => b[1] - a[1]).slice(0, template === "exec" ? 5 : 10);
    if (imp.length) {
      pdf.paragraph(t.importance, { bold: true });
      pdf.bars(imp.map(([label, value]) => ({ label, value })), (v) => fmtNum(v, lang));
    }
  }

  pdf.heading(t.findings);
  for (const f of findings(input)) pdf.bullet(f);
  pdf.paragraph(t.findingsNote, { size: 8, color: [120, 120, 120] });

  if (template === "detailed") {
    pdf.heading(t.datasets);
    if (input.datasets.length === 0) pdf.paragraph(t.noData);
    for (const d of input.datasets) {
      pdf.paragraph(`${d.name} — ${fmtInt(d.row_count, lang)} ${t.rows}, ${fmtInt(d.column_count, lang)} ${t.columns}`, { bold: true });
      const cols = d.profiling?.columns ?? [];
      if (cols.length) {
        const rows = d.row_count ?? 0;
        pdf.table(
          [t.name, t.type, t.missing, t.distinct],
          cols.slice(0, 40).map((c) => [c.name, c.type, rows > 0 ? `${fmtInt(c.missing, lang)} (${Math.round((c.missing / rows) * 100)} %)` : "0", fmtInt(c.distinct, lang)]),
          [0.4, 0.15, 0.25, 0.2], ["l", "l", "r", "r"],
        );
        if (cols.length > 40) pdf.paragraph(`… +${cols.length - 40} ${t.columns}`, { size: 8, color: [120, 120, 120] });
      }
    }

    pdf.heading(t.models);
    if (input.models.length === 0) pdf.paragraph(t.noModels);
    for (const m of input.models.slice(0, 15)) {
      pdf.paragraph(`${m.name} — ${taskLabel(t, m.task_type)}${m.algorithm ? `, ${m.algorithm}` : ""}`, { bold: true });
      const board = Array.isArray(m.config?.leaderboard) ? (m.config!.leaderboard as { label?: unknown; score?: unknown }[]) : [];
      const rows = metricRows(m, t, lang);
      if (rows.length) pdf.table([t.metric, t.value, t.baseline], rows, [0.5, 0.2, 0.3], ["l", "r", "r"]);
      const candidates = board.filter((c) => typeof c.label === "string" && isNum(c.score)).slice(0, 8);
      if (candidates.length > 1) {
        pdf.paragraph(t.leaderboard, { size: 9, color: [90, 90, 90] });
        pdf.table([t.name, t.score], candidates.map((c) => [String(c.label), fmtNum(c.score as number, lang, 4)]), [0.7, 0.3], ["l", "r"]);
      }
    }

    pdf.heading(t.pipelines);
    if (input.pipelines.length === 0) pdf.paragraph(t.none);
    else pdf.table([t.name, t.status, t.nodes], input.pipelines.slice(0, 30).map((p) => [p.name ?? "", p.status ?? "", String(Array.isArray(p.nodes) ? p.nodes.length : 0)]), [0.55, 0.25, 0.2], ["l", "l", "r"]);

    pdf.heading(t.visualizations);
    if (input.visualizations.length === 0) pdf.paragraph(t.none);
    else pdf.table([t.name, t.type], input.visualizations.slice(0, 30).map((v) => [v.name, v.chart_type ?? ""]), [0.7, 0.3]);
  }
  return pdf.build();
}

// ---------------------------------------------------------------------------------------------------
// CSV (une ligne par modèle)
// ---------------------------------------------------------------------------------------------------

/** Cellule CSV : guillemets si besoin, et neutralisation des formules (=, +, -, @) interprétées par Excel. */
export function csvCell(v: unknown, sep: string): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s;
  return /["\r\n]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(input: ReportInput): Uint8Array {
  const t = TXT[input.lang];
  const sep = input.lang === "fr" ? ";" : ","; // Excel français attend le point-virgule
  const lines = [t.csvHeader.join(sep)];
  for (const m of input.models) {
    const mt = m.metrics ?? {};
    const n = (k: string) => (isNum(mt[k]) ? fmtNum(mt[k], input.lang, 6) : "");
    lines.push([
      m.name, m.task_type ?? "", m.algorithm ?? "", m.dataset_name ?? "", String(m.config?.target_column ?? ""),
      n("accuracy"), n("f1_macro"), n("precision_macro"), n("recall_macro"), n("rmse"), n("mae"), n("r2"),
      isNum(m.config?.n_rows_used) ? String(m.config!.n_rows_used) : "", m.created_at.slice(0, 10),
    ].map((c) => csvCell(c, sep)).join(sep));
  }
  return new TextEncoder().encode("﻿" + lines.join("\r\n") + "\r\n");
}

export function buildReport(template: Template, input: ReportInput): BuiltReport {
  if (template === "data") return { bytes: buildCsv(input), contentType: "text/csv; charset=utf-8", extension: "csv" };
  return { bytes: buildPdf(template, input), contentType: "application/pdf", extension: "pdf" };
}

export const reportTitle = (template: Template, lang: Lang, date: Date) => `${TXT[lang][template]} — ${dateStr(date)}`;
