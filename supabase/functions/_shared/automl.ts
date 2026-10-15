// AutoML réel en TypeScript pur : prépare les données, évalue plusieurs algorithmes par validation
// croisée (prédictions « hors échantillon »), choisit le meilleur, le réentraîne et calcule
// l'importance des variables. Aucun résultat n'est inventé : tout vient du calcul sur le fichier.
import { asNumber, type Table } from "./pipeline.ts";

export type Task = "classification" | "regression";
export type Plan = "free" | "premium";
export type Algorithm = "linear" | "tree" | "forest";
export type AutoMlErrorCode =
  | "target_not_found" | "target_not_numeric" | "too_few_rows" | "single_class" | "too_many_classes"
  | "no_usable_features" | "unknown_feature";

export class AutoMlError extends Error {
  constructor(public code: AutoMlErrorCode, msg?: string) {
    super(msg ?? code);
  }
}

// Une edge function Supabase est coupée après 2 s de CPU : l'entraînement se fait sur un échantillon aléatoire
// reproductible de 1 000 lignes (indiqué dans le résultat), avec un budget de temps strict.
export const MAX_TRAIN_ROWS = 1000;
export const MIN_ROWS = 30;
export const MAX_FEATURES = 60;
export const MAX_CLASSES = 20;
const TOP_CATEGORIES = 8;
const MAX_BINS = 16;

// ---------- utilitaires ----------

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const round = (x: number, d = 4) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : 0);
const isEmpty = (v: string) => v.trim() === "";

// ---------- préparation ----------

export interface Prepared {
  X: number[][]; // NaN = valeur manquante
  y: number[]; // indice de classe, ou valeur
  names: string[]; // nom de chaque colonne encodée
  sources: string[]; // colonne d'origine de chacune
  classes: string[];
  task: Task;
  rowsTotal: number; // lignes avec une cible renseignée
  sampled: boolean;
  dropped: { column: string; reason: "missing" | "constant" | "id_like" | "too_wide" }[];
}

export function prepare(t: Table, target: string, task: Task, opts: { features?: string[]; seed?: number } = {}): Prepared {
  const ti = t.headers.indexOf(target);
  if (ti < 0) throw new AutoMlError("target_not_found", target);
  let rows = t.rows.filter((r) => !isEmpty(r[ti]));
  const rowsTotal = rows.length;
  if (rowsTotal < MIN_ROWS) throw new AutoMlError("too_few_rows", String(rowsTotal));
  const sampled = rowsTotal > MAX_TRAIN_ROWS;
  if (sampled) rows = shuffle(rows, rng(opts.seed ?? 42)).slice(0, MAX_TRAIN_ROWS);

  let y: number[];
  let classes: string[] = [];
  if (task === "regression") {
    y = rows.map((r) => asNumber(r[ti]) ?? NaN);
    if (y.some((v) => Number.isNaN(v))) throw new AutoMlError("target_not_numeric", target);
  } else {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r[ti].trim(), (counts.get(r[ti].trim()) ?? 0) + 1);
    classes = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map((e) => e[0]);
    if (classes.length < 2) throw new AutoMlError("single_class");
    if (classes.length > MAX_CLASSES) throw new AutoMlError("too_many_classes", String(classes.length));
    const idx = new Map(classes.map((c, i) => [c, i]));
    y = rows.map((r) => idx.get(r[ti].trim())!);
  }

  const wanted = opts.features ?? t.headers.filter((h) => h !== target);
  for (const f of wanted) if (!t.headers.includes(f) || f === target) throw new AutoMlError("unknown_feature", f);

  const names: string[] = [];
  const sources: string[] = [];
  const cols: number[][] = []; // colonnes encodées (par colonne, puis transposées)
  const dropped: Prepared["dropped"] = [];
  for (const col of wanted) {
    const ci = t.headers.indexOf(col);
    const raw = rows.map((r) => r[ci]);
    const present = raw.filter((v) => !isEmpty(v));
    if (present.length / raw.length < 0.4) { dropped.push({ column: col, reason: "missing" }); continue; }
    const distinct = new Set(present.map((v) => v.trim()));
    if (distinct.size <= 1) { dropped.push({ column: col, reason: "constant" }); continue; }
    const nums = raw.map((v) => (isEmpty(v) ? NaN : asNumber(v) ?? NaN));
    const numericShare = nums.filter((v) => !Number.isNaN(v)).length / present.length;
    if (numericShare >= 0.95) {
      if (names.length + 1 > MAX_FEATURES) { dropped.push({ column: col, reason: "too_wide" }); continue; }
      names.push(col); sources.push(col); cols.push(nums);
      continue;
    }
    if (distinct.size > 50 && distinct.size / present.length > 0.5) { dropped.push({ column: col, reason: "id_like" }); continue; }
    const freq = new Map<string, number>();
    for (const v of present) freq.set(v.trim(), (freq.get(v.trim()) ?? 0) + 1);
    let top = [...freq.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, TOP_CATEGORIES).map((e) => e[0]);
    if (distinct.size === 2) top = top.slice(0, 1); // binaire : une seule colonne suffit
    if (names.length + top.length > MAX_FEATURES) { dropped.push({ column: col, reason: "too_wide" }); continue; }
    for (const cat of top) {
      names.push(`${col}=${cat}`); sources.push(col);
      cols.push(raw.map((v) => (v.trim() === cat ? 1 : 0)));
    }
  }
  if (names.length === 0) throw new AutoMlError("no_usable_features");
  const X = rows.map((_, i) => cols.map((c) => c[i]));
  return { X, y, names, sources, classes, task, rowsTotal, sampled, dropped };
}

// ---------- imputation / standardisation (apprises sur l'entraînement seulement) ----------

interface Scaler { med: number[]; mean: number[]; sd: number[] }

function fitScaler(X: number[][], idx: number[], p: number): Scaler {
  const med: number[] = [], mean: number[] = [], sd: number[] = [];
  for (let j = 0; j < p; j++) {
    const vals = idx.map((i) => X[i][j]).filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
    const m = vals.length === 0 ? 0 : vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
    med.push(m);
    let s = 0, ss = 0;
    for (const i of idx) { const v = Number.isNaN(X[i][j]) ? m : X[i][j]; s += v; ss += v * v; }
    const mu = s / idx.length;
    mean.push(mu);
    sd.push(Math.sqrt(Math.max(ss / idx.length - mu * mu, 0)) || 1);
  }
  return { med, mean, sd };
}
const impute = (row: number[], sc: Scaler): number[] => row.map((v, j) => (Number.isNaN(v) ? sc.med[j] : v));
const standardize = (row: number[], sc: Scaler): number[] => row.map((v, j) => (v - sc.mean[j]) / sc.sd[j]);

// ---------- modèles ----------

interface Fitted { predict: (x: number[]) => number; importance: number[] }
interface Ctx { task: Task; K: number; p: number; sc: Scaler; seed: number }
type Params = Record<string, number>;

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / d;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / (M[r][r] || 1e-12);
  }
  return x;
}

function fitBaseline(_X: number[][], y: number[], ctx: Ctx): Fitted {
  if (ctx.task === "regression") {
    const m = y.reduce((a, b) => a + b, 0) / y.length;
    return { predict: () => m, importance: new Array(ctx.p).fill(0) };
  }
  const c = new Array<number>(ctx.K).fill(0);
  for (const v of y) c[v]++;
  const best = c.indexOf(Math.max(...c));
  return { predict: () => best, importance: new Array(ctx.p).fill(0) };
}

function fitLinear(X: number[][], y: number[], ctx: Ctx, prm: Params): Fitted {
  const n = X.length, p = ctx.p;
  const Z = X.map((r) => standardize(r, ctx.sc));
  const l2 = prm.l2 ?? 1;
  if (ctx.task === "regression") {
    const ym = y.reduce((a, b) => a + b, 0) / n;
    const A = Array.from({ length: p }, () => new Array<number>(p).fill(0));
    const b = new Array<number>(p).fill(0);
    for (let i = 0; i < n; i++) {
      const z = Z[i], t = y[i] - ym;
      for (let j = 0; j < p; j++) {
        b[j] += z[j] * t;
        for (let k = j; k < p; k++) A[j][k] += z[j] * z[k];
      }
    }
    for (let j = 0; j < p; j++) {
      A[j][j] += l2;
      for (let k = 0; k < j; k++) A[j][k] = A[k][j];
    }
    const beta = solve(A, b);
    return {
      predict: (x) => { const z = standardize(x, ctx.sc); let s = ym; for (let j = 0; j < p; j++) s += beta[j] * z[j]; return s; },
      importance: beta.map(Math.abs),
    };
  }
  // Régression logistique multinomiale (softmax), descente de gradient avec pénalité L2.
  const K = ctx.K;
  const W = Array.from({ length: K }, () => new Array<number>(p + 1).fill(0)); // dernier = biais
  const iters = Math.max(30, Math.min(200, Math.floor(1.5e8 / (n * (p + 1) * K))));
  const lr = 0.5, lam = l2 / n;
  const logits = new Array<number>(K).fill(0);
  for (let it = 0; it < iters; it++) {
    const G = Array.from({ length: K }, () => new Array<number>(p + 1).fill(0));
    for (let i = 0; i < n; i++) {
      const z = Z[i];
      let mx = -Infinity;
      for (let k = 0; k < K; k++) {
        let s = W[k][p];
        for (let j = 0; j < p; j++) s += W[k][j] * z[j];
        logits[k] = s;
        if (s > mx) mx = s;
      }
      let sum = 0;
      for (let k = 0; k < K; k++) { logits[k] = Math.exp(logits[k] - mx); sum += logits[k]; }
      for (let k = 0; k < K; k++) {
        const err = logits[k] / sum - (y[i] === k ? 1 : 0);
        for (let j = 0; j < p; j++) G[k][j] += err * z[j];
        G[k][p] += err;
      }
    }
    for (let k = 0; k < K; k++) for (let j = 0; j <= p; j++) W[k][j] -= lr * (G[k][j] / n + (j < p ? lam * W[k][j] : 0));
  }
  return {
    predict: (x) => {
      const z = standardize(x, ctx.sc);
      let best = 0, bs = -Infinity;
      for (let k = 0; k < K; k++) {
        let s = W[k][p];
        for (let j = 0; j < p; j++) s += W[k][j] * z[j];
        if (s > bs) { bs = s; best = k; }
      }
      return best;
    },
    importance: Array.from({ length: p }, (_, j) => W.reduce((a, w) => a + Math.abs(w[j]), 0)),
  };
}

// --- arbres (CART sur variables discrétisées en ≤ 16 classes de quantiles) ---

type TreeNode = { f: number; t: number; l: TreeNode; r: TreeNode } | { leaf: number[] | number };

function makeBins(X: number[][], p: number): number[][] {
  const thr: number[][] = [];
  for (let j = 0; j < p; j++) {
    const v = X.map((r) => r[j]).sort((a, b) => a - b);
    const uniq = v.filter((x, i) => i === 0 || x !== v[i - 1]);
    if (uniq.length <= MAX_BINS) { thr.push(uniq.slice(0, -1)); continue; }
    const cuts = new Set<number>();
    for (let q = 1; q < MAX_BINS; q++) cuts.add(v[Math.floor((q * v.length) / MAX_BINS)]);
    thr.push([...cuts].filter((c) => c < uniq[uniq.length - 1]).sort((a, b) => a - b));
  }
  return thr;
}
function binOf(thr: number[], x: number): number {
  let lo = 0, hi = thr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (x <= thr[m]) hi = m; else lo = m + 1; }
  return lo;
}

interface TreeCfg { maxDepth: number; minLeaf: number; mtry: number; rand: () => number }

function buildTree(
  Xb: number[][], y: number[], K: number, task: Task, thr: number[][], idx: number[], depth: number,
  cfg: TreeCfg, imp: number[],
): TreeNode {
  const n = idx.length;
  const p = thr.length;
  const leaf = (): TreeNode => {
    if (task === "regression") return { leaf: idx.reduce((a, i) => a + y[i], 0) / n };
    const c = new Array<number>(K).fill(0);
    for (const i of idx) c[y[i]]++;
    return { leaf: c.map((v) => v / n) };
  };
  const pc = new Array<number>(task === "classification" ? K : 0).fill(0);
  let ps = 0, pss = 0;
  if (task === "classification") for (const i of idx) pc[y[i]]++;
  else for (const i of idx) { ps += y[i]; pss += y[i] * y[i]; }
  const gini = (c: number[], m: number) => { let s = 0; for (const v of c) s += (v / m) ** 2; return 1 - s; };
  const variance = (s: number, ss: number, m: number) => Math.max(ss / m - (s / m) ** 2, 0);
  const parentImp = task === "classification" ? gini(pc, n) : variance(ps, pss, n);
  if (depth >= cfg.maxDepth || n < 2 * cfg.minLeaf || parentImp < 1e-12) return leaf();

  let feats = Array.from({ length: p }, (_, j) => j);
  if (cfg.mtry < p) feats = shuffle(feats, cfg.rand).slice(0, cfg.mtry);
  let bestGain = 1e-9, bestF = -1, bestB = -1;
  for (const f of feats) {
    const nb = thr[f].length + 1;
    if (nb < 2) continue;
    if (task === "classification") {
      const h = new Float64Array(nb * K), cnt = new Float64Array(nb);
      for (const i of idx) { const b = Xb[i][f]; h[b * K + y[i]]++; cnt[b]++; }
      const left = new Array<number>(K).fill(0);
      let nl = 0;
      for (let b = 0; b < nb - 1; b++) {
        for (let k = 0; k < K; k++) left[k] += h[b * K + k];
        nl += cnt[b];
        const nr = n - nl;
        if (nl < cfg.minLeaf || nr < cfg.minLeaf) continue;
        const right = pc.map((v, k) => v - left[k]);
        const g = parentImp - (nl * gini(left, nl) + nr * gini(right, nr)) / n;
        if (g > bestGain) { bestGain = g; bestF = f; bestB = b; }
      }
    } else {
      const cnt = new Float64Array(nb), sm = new Float64Array(nb), sq = new Float64Array(nb);
      for (const i of idx) { const b = Xb[i][f]; cnt[b]++; sm[b] += y[i]; sq[b] += y[i] * y[i]; }
      let nl = 0, sl = 0, ql = 0;
      for (let b = 0; b < nb - 1; b++) {
        nl += cnt[b]; sl += sm[b]; ql += sq[b];
        const nr = n - nl;
        if (nl < cfg.minLeaf || nr < cfg.minLeaf) continue;
        const g = parentImp - (nl * variance(sl, ql, nl) + nr * variance(ps - sl, pss - ql, nr)) / n;
        if (g > bestGain) { bestGain = g; bestF = f; bestB = b; }
      }
    }
  }
  if (bestF < 0) return leaf();
  imp[bestF] += bestGain * n;
  const li: number[] = [], ri: number[] = [];
  for (const i of idx) (Xb[i][bestF] <= bestB ? li : ri).push(i);
  return {
    f: bestF, t: thr[bestF][bestB],
    l: buildTree(Xb, y, K, task, thr, li, depth + 1, cfg, imp),
    r: buildTree(Xb, y, K, task, thr, ri, depth + 1, cfg, imp),
  };
}
function walk(node: TreeNode, x: number[]): number[] | number {
  while ("f" in node) node = x[node.f] <= node.t ? node.l : node.r;
  return node.leaf;
}

function fitForest(X: number[][], y: number[], ctx: Ctx, prm: Params, trees: number): Fitted {
  const n = X.length, p = ctx.p;
  const thr = makeBins(X, p);
  const Xb = X.map((r) => r.map((v, j) => binOf(thr[j], v)));
  const rand = rng(ctx.seed);
  const imp = new Array<number>(p).fill(0);
  const mtry = trees === 1 ? p : Math.max(1, Math.round(ctx.task === "classification" ? Math.sqrt(p) : p / 3));
  const cfg: TreeCfg = { maxDepth: prm.depth ?? 6, minLeaf: prm.min_leaf ?? 5, mtry, rand };
  const all: TreeNode[] = [];
  for (let b = 0; b < trees; b++) {
    let idx: number[];
    if (trees === 1) idx = Array.from({ length: n }, (_, i) => i);
    else { const m = Math.min(n, 3000); idx = Array.from({ length: m }, () => Math.floor(rand() * n)); }
    all.push(buildTree(Xb, y, ctx.K, ctx.task, thr, idx, 0, cfg, imp));
  }
  return {
    predict: (x) => {
      if (ctx.task === "regression") return all.reduce((a, t) => a + (walk(t, x) as number), 0) / all.length;
      const s = new Array<number>(ctx.K).fill(0);
      for (const t of all) (walk(t, x) as number[]).forEach((v, k) => (s[k] += v));
      return s.indexOf(Math.max(...s));
    },
    importance: imp,
  };
}

// ---------- métriques ----------

export function classificationMetrics(yTrue: number[], yPred: number[], K: number): Record<string, number> {
  let ok = 0;
  const tp = new Array<number>(K).fill(0), fp = new Array<number>(K).fill(0), fn = new Array<number>(K).fill(0);
  for (let i = 0; i < yTrue.length; i++) {
    if (yTrue[i] === yPred[i]) { ok++; tp[yTrue[i]]++; } else { fp[yPred[i]]++; fn[yTrue[i]]++; }
  }
  let pr = 0, rc = 0, f1 = 0, m = 0;
  for (let k = 0; k < K; k++) {
    if (tp[k] + fn[k] === 0) continue; // classe absente de la vérité
    const p = tp[k] + fp[k] === 0 ? 0 : tp[k] / (tp[k] + fp[k]);
    const r = tp[k] / (tp[k] + fn[k]);
    pr += p; rc += r; f1 += p + r === 0 ? 0 : (2 * p * r) / (p + r); m++;
  }
  return { accuracy: round(ok / yTrue.length), f1_macro: round(f1 / m), precision_macro: round(pr / m), recall_macro: round(rc / m) };
}
export function regressionMetrics(yTrue: number[], yPred: number[]): Record<string, number> {
  const n = yTrue.length;
  const mean = yTrue.reduce((a, b) => a + b, 0) / n;
  let se = 0, ae = 0, st = 0;
  for (let i = 0; i < n; i++) { const e = yTrue[i] - yPred[i]; se += e * e; ae += Math.abs(e); st += (yTrue[i] - mean) ** 2; }
  return { rmse: round(Math.sqrt(se / n)), mae: round(ae / n), r2: round(st === 0 ? 0 : 1 - se / st) };
}
const scoreOf = (task: Task, m: Record<string, number>) => (task === "classification" ? m.f1_macro + m.accuracy * 1e-3 : -m.rmse);

// ---------- AutoML ----------

export interface Candidate { algorithm: Algorithm | "baseline"; label: string; params: Params }

export function candidatesFor(plan: Plan): Candidate[] {
  // Les 3 types de base d'abord (le plan gratuit s'arrête là) : si le temps manque, Premium garde au moins
  // le résultat du plan gratuit. « AutoML complet » : réglages supplémentaires évalués tant que le budget le permet.
  const base: Candidate[] = [
    { algorithm: "linear", label: "linear", params: { l2: 1 } },
    { algorithm: "tree", label: "tree", params: { depth: 5 } },
    { algorithm: "forest", label: "forest", params: { depth: 6, trees: 20 } },
  ];
  if (plan === "free") return base;
  return [
    ...base,
    ...[0.1, 10].map((l2): Candidate => ({ algorithm: "linear", label: `linear(l2=${l2})`, params: { l2 } })),
    ...[3, 8, 12].map((depth): Candidate => ({ algorithm: "tree", label: `tree(depth=${depth})`, params: { depth } })),
    { algorithm: "forest", label: "forest(trees=40,depth=8)", params: { depth: 8, trees: 40 } },
    { algorithm: "forest", label: "forest(trees=80,depth=12)", params: { depth: 12, trees: 80 } },
  ];
}

function fitCandidate(c: Candidate, X: number[][], y: number[], ctx: Ctx): Fitted {
  switch (c.algorithm) {
    case "baseline": return fitBaseline(X, y, ctx);
    case "linear": return fitLinear(X, y, ctx, c.params);
    case "tree": return fitForest(X, y, ctx, c.params, 1);
    case "forest": return fitForest(X, y, ctx, c.params, c.params.trees ?? 30);
  }
}

export interface LeaderboardEntry { label: string; algorithm: string; params: Params; metrics: Record<string, number>; score: number }
export interface AutoMlResult {
  task: Task;
  algorithm: string;
  metrics: Record<string, number>;
  baseline: Record<string, number>;
  leaderboard: LeaderboardEntry[];
  skipped: string[];
  feature_importance: Record<string, number>;
  n_rows: number; // lignes avec cible renseignée
  n_rows_used: number; // lignes réellement utilisées (échantillon si > MAX_TRAIN_ROWS)
  n_features: number; // colonnes d'origine retenues
  folds: number;
  classes: string[];
  dropped: Prepared["dropped"];
}

class OutOfTime extends Error {}

// `deadline` : heure (ms) après laquelle on ne démarre plus de candidat ; `hardDeadline` : heure après laquelle
// un candidat en cours est abandonné (par défaut deadline + 300 ms). Les candidats non évalués sont listés dans `skipped`.
export function runAutoMl(
  prep: Prepared, plan: Plan, opts: { seed?: number; deadline?: number; hardDeadline?: number } = {},
): AutoMlResult {
  const seed = opts.seed ?? 42;
  const n = prep.X.length, p = prep.names.length, K = prep.classes.length;
  const rand = rng(seed);
  const folds = n < 60 ? 3 : 5;
  // Affectation des plis (stratifiée en classification).
  const fold = new Array<number>(n).fill(0);
  const order = shuffle(Array.from({ length: n }, (_, i) => i), rand);
  if (prep.task === "classification") {
    const seen = new Array<number>(K).fill(0);
    for (const i of order) fold[i] = seen[prep.y[i]]++ % folds;
  } else order.forEach((i, r) => (fold[i] = r % folds));

  const hard = opts.hardDeadline ?? (opts.deadline ? opts.deadline + 300 : 0);
  const evaluate = (c: Candidate, enforce = true): { metrics: Record<string, number> } => {
    const pred = new Array<number>(n).fill(0);
    for (let f = 0; f < folds; f++) {
      if (enforce && hard && Date.now() > hard) throw new OutOfTime();
      const tr: number[] = [], te: number[] = [];
      for (let i = 0; i < n; i++) (fold[i] === f ? te : tr).push(i);
      const sc = fitScaler(prep.X, tr, p);
      const Xtr = tr.map((i) => impute(prep.X[i], sc));
      const model = fitCandidate(c, Xtr, tr.map((i) => prep.y[i]), { task: prep.task, K, p, sc, seed: seed + f });
      for (const i of te) pred[i] = model.predict(impute(prep.X[i], sc));
    }
    return { metrics: prep.task === "classification" ? classificationMetrics(prep.y, pred, K) : regressionMetrics(prep.y, pred) };
  };

  const base: Candidate = { algorithm: "baseline", label: "baseline", params: {} };
  const baseline = evaluate(base, false).metrics; // la référence est quasi gratuite : jamais interrompue
  const board: (LeaderboardEntry & { cand: Candidate })[] = [];
  const skipped: string[] = [];
  for (const c of candidatesFor(plan)) {
    if (opts.deadline && Date.now() > opts.deadline) { skipped.push(c.label); continue; }
    let metrics: Record<string, number>;
    try {
      ({ metrics } = evaluate(c));
    } catch (e) {
      if (e instanceof OutOfTime) { skipped.push(c.label); continue; }
      throw e;
    }
    board.push({ label: c.label, algorithm: c.algorithm, params: c.params, metrics, score: round(scoreOf(prep.task, metrics), 6), cand: c });
  }
  board.sort((a, b) => b.score - a.score);
  const best = board[0];
  const useBaseline = !best || scoreOf(prep.task, baseline) >= best.score; // jamais pire que « ne rien apprendre »

  // Réentraînement du meilleur sur toutes les lignes utilisées, pour l'importance des variables.
  const all = Array.from({ length: n }, (_, i) => i);
  const sc = fitScaler(prep.X, all, p);
  const Xall = prep.X.map((r) => impute(r, sc));
  const final = fitCandidate(useBaseline ? base : best.cand, Xall, prep.y, { task: prep.task, K, p, sc, seed });
  const bySource = new Map<string, number>();
  prep.sources.forEach((s, j) => bySource.set(s, (bySource.get(s) ?? 0) + final.importance[j]));
  const total = [...bySource.values()].reduce((a, b) => a + b, 0);
  const importance: Record<string, number> = {};
  if (total > 0) {
    for (const [s, v] of [...bySource.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) importance[s] = round(v / total);
  }
  return {
    task: prep.task,
    algorithm: useBaseline ? "baseline" : best.label,
    metrics: useBaseline ? baseline : best.metrics,
    baseline,
    leaderboard: board.map((e): LeaderboardEntry => ({ label: e.label, algorithm: e.algorithm, params: e.params, metrics: e.metrics, score: e.score })),
    skipped,
    feature_importance: importance,
    n_rows: prep.rowsTotal,
    n_rows_used: n,
    n_features: new Set(prep.sources).size,
    folds,
    classes: prep.classes,
    dropped: prep.dropped,
  };
}
