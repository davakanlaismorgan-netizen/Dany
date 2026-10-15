// Moteur de pipelines : chaque bloc est une vraie opération sur les données du fichier stocké.
// Fonctions pures (aucun accès réseau ni base) : testables seules, exécutées côté serveur.
import Papa from "npm:papaparse@5.5.3";
import { DatasetError, decodeText, MAX_ROWS, uniqueHeaders } from "./dataset.ts";

export const MAX_NODES = 30;
const MAX_COLUMNS = 500;
const NUMERIC = /^[-+]?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?$/;

export interface Table {
  headers: string[];
  rows: string[][];
}
export interface PipelineNodeDef {
  id: string;
  type: string;
  config: Record<string, unknown>;
}
export interface PipelineEdgeDef {
  from: string;
  to: string;
}
export type PipelineErrorCode =
  | "invalid_graph" | "too_many_nodes" | "unknown_node_type" | "cycle" | "no_output" | "dangling_node"
  | "wrong_inputs" | "invalid_config" | "column_not_found" | "not_numeric" | "too_many_rows"
  | "too_many_columns" | "source_not_found" | "empty_result";

export class PipelineError extends Error {
  constructor(public code: PipelineErrorCode, public nodeId?: string, msg?: string) {
    super(msg ?? code);
  }
}
export interface StepResult {
  node_id: string;
  type: string;
  rows_out: number;
}
export interface PipelineRun {
  table: Table;
  output_name: string;
  steps: StepResult[];
}

export const NODE_TYPES = ["source", "filter", "select", "dedupe", "fill_missing", "aggregate", "join", "output"] as const;
type NodeType = typeof NODE_TYPES[number];
const isNodeType = (t: unknown): t is NodeType => (NODE_TYPES as readonly string[]).includes(t as string);

// ---------- lecture / écriture d'un fichier ----------

function toTable(headers: unknown[], rows: unknown[][]): Table {
  if (headers.length > MAX_COLUMNS) throw new DatasetError("too_many_columns");
  const h = uniqueHeaders(headers);
  const out: string[][] = [];
  for (const r of rows) {
    if (out.length >= MAX_ROWS) throw new DatasetError("too_many_rows");
    out.push(h.map((_, i) => {
      const v = r[i];
      return v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    }));
  }
  return { headers: h, rows: out };
}

export function parseTable(kind: string, bytes: Uint8Array): Table {
  const { text } = decodeText(bytes);
  if (kind === "csv") {
    const res = Papa.parse<string[]>(text, {
      delimiter: "",
      delimitersToGuess: [",", ";", "\t", "|"],
      skipEmptyLines: "greedy",
    });
    if (res.data.length < 2) throw new DatasetError("empty");
    return toTable(res.data[0], res.data.slice(1));
  }
  if (kind === "json") {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new DatasetError("invalid_json");
    }
    const arr = (Array.isArray(data) ? data : [data]).filter(
      (x): x is Record<string, unknown> => x !== null && typeof x === "object" && !Array.isArray(x),
    );
    if (arr.length === 0) throw new DatasetError("invalid_json");
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const o of arr) for (const k of Object.keys(o)) if (!seen.has(k)) { seen.add(k); keys.push(k); }
    return toTable(keys, arr.map((o) => keys.map((k) => o[k])));
  }
  throw new DatasetError("unsupported");
}

// Séparateur « , », guillemets si nécessaire ; BOM UTF-8 pour qu'Excel lise bien les accents.
export function tableToCsv(t: Table): Uint8Array {
  const csv = Papa.unparse({ fields: t.headers, data: t.rows }, { newline: "\n" });
  return new TextEncoder().encode("﻿" + csv + "\n");
}

// ---------- utilitaires ----------

const isEmpty = (v: string) => v.trim() === "";
export const asNumber = (v: string): number | null => {
  const t = v.trim();
  if (!NUMERIC.test(t)) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const fmt = (n: number): string => String(Math.round(n * 1e6) / 1e6);

function str(node: PipelineNodeDef, key: string): string {
  const v = node.config[key];
  if (typeof v !== "string" || v.trim() === "") throw new PipelineError("invalid_config", node.id, key);
  return v;
}
function strList(node: PipelineNodeDef, key: string, required: boolean): string[] {
  const v = node.config[key];
  if (v == null && !required) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || x === "") || (required && v.length === 0)) {
    throw new PipelineError("invalid_config", node.id, key);
  }
  return v as string[];
}
function colIndex(t: Table, name: string, node: PipelineNodeDef): number {
  const i = t.headers.indexOf(name);
  if (i < 0) throw new PipelineError("column_not_found", node.id, name);
  return i;
}
function checkRows(n: number, node: PipelineNodeDef) {
  if (n > MAX_ROWS) throw new PipelineError("too_many_rows", node.id);
}

// ---------- opérations ----------

const FILTER_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "empty", "not_empty"] as const;

function opFilter(t: Table, node: PipelineNodeDef): Table {
  const i = colIndex(t, str(node, "column"), node);
  const op = node.config.op;
  if (!(FILTER_OPS as readonly unknown[]).includes(op)) throw new PipelineError("invalid_config", node.id, "op");
  const needsValue = op !== "empty" && op !== "not_empty";
  const raw = node.config.value;
  if (needsValue && (typeof raw !== "string" && typeof raw !== "number")) throw new PipelineError("invalid_config", node.id, "value");
  const value = String(raw ?? "").trim();
  const vNum = asNumber(value);
  const cmp = (cell: string): number => {
    const c = cell.trim();
    const cn = asNumber(c);
    if (cn !== null && vNum !== null) return cn - vNum;
    return c < value ? -1 : c > value ? 1 : 0;
  };
  const keep = (cell: string): boolean => {
    switch (op) {
      case "eq": return cmp(cell) === 0;
      case "neq": return cmp(cell) !== 0;
      case "gt": return !isEmpty(cell) && cmp(cell) > 0;
      case "gte": return !isEmpty(cell) && cmp(cell) >= 0;
      case "lt": return !isEmpty(cell) && cmp(cell) < 0;
      case "lte": return !isEmpty(cell) && cmp(cell) <= 0;
      case "contains": return cell.toLowerCase().includes(value.toLowerCase());
      case "empty": return isEmpty(cell);
      default: return !isEmpty(cell);
    }
  };
  return { headers: t.headers, rows: t.rows.filter((r) => keep(r[i])) };
}

function opSelect(t: Table, node: PipelineNodeDef): Table {
  const cols = strList(node, "columns", true);
  if (new Set(cols).size !== cols.length) throw new PipelineError("invalid_config", node.id, "columns");
  const idx = cols.map((c) => colIndex(t, c, node));
  return { headers: cols, rows: t.rows.map((r) => idx.map((i) => r[i])) };
}

function opDedupe(t: Table, node: PipelineNodeDef): Table {
  const cols = strList(node, "columns", false);
  const idx = cols.length ? cols.map((c) => colIndex(t, c, node)) : t.headers.map((_, i) => i);
  const seen = new Set<string>();
  const rows: string[][] = [];
  for (const r of t.rows) {
    const key = idx.map((i) => r[i].trim()).join("\u0001");
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(r);
  }
  return { headers: t.headers, rows };
}

function opFillMissing(t: Table, node: PipelineNodeDef): Table {
  const i = colIndex(t, str(node, "column"), node);
  const strategy = node.config.strategy;
  const present = t.rows.map((r) => r[i]).filter((v) => !isEmpty(v));
  let fill: string;
  switch (strategy) {
    case "drop":
      return { headers: t.headers, rows: t.rows.filter((r) => !isEmpty(r[i])) };
    case "constant": {
      const v = node.config.value;
      if (typeof v !== "string" && typeof v !== "number") throw new PipelineError("invalid_config", node.id, "value");
      fill = String(v);
      break;
    }
    case "mean":
    case "median": {
      const nums = present.map(asNumber);
      if (nums.length === 0 || nums.some((n) => n === null)) throw new PipelineError("not_numeric", node.id, t.headers[i]);
      const xs = (nums as number[]).slice().sort((a, b) => a - b);
      if (strategy === "mean") fill = fmt(xs.reduce((a, b) => a + b, 0) / xs.length);
      else fill = fmt(xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2);
      break;
    }
    case "mode": {
      if (present.length === 0) throw new PipelineError("invalid_config", node.id, "column");
      const counts = new Map<string, number>();
      for (const v of present) counts.set(v.trim(), (counts.get(v.trim()) ?? 0) + 1);
      // Égalité : la valeur apparue en premier (déterministe).
      fill = [...counts.entries()].reduce((best, e) => (e[1] > best[1] ? e : best))[0];
      break;
    }
    default:
      throw new PipelineError("invalid_config", node.id, "strategy");
  }
  return { headers: t.headers, rows: t.rows.map((r) => (isEmpty(r[i]) ? r.map((v, k) => (k === i ? fill : v)) : r)) };
}

const AGG_FNS = ["count", "sum", "mean", "min", "max"] as const;
type AggFn = typeof AGG_FNS[number];

function opAggregate(t: Table, node: PipelineNodeDef): Table {
  const groupBy = strList(node, "group_by", false);
  const gIdx = groupBy.map((c) => colIndex(t, c, node));
  const specs = node.config.aggregations;
  if (!Array.isArray(specs) || specs.length === 0) throw new PipelineError("invalid_config", node.id, "aggregations");
  const aggs = specs.map((s: unknown) => {
    const o = (s ?? {}) as Record<string, unknown>;
    const fn = o.fn as AggFn;
    if (!(AGG_FNS as readonly unknown[]).includes(fn)) throw new PipelineError("invalid_config", node.id, "fn");
    if (typeof o.column !== "string" || o.column === "") throw new PipelineError("invalid_config", node.id, "column");
    const star = o.column === "*" && fn === "count";
    const idx = star ? -1 : colIndex(t, o.column, node);
    return { fn, idx, name: `${fn}_${star ? "rows" : o.column}` };
  });
  const names = [...groupBy, ...aggs.map((a) => a.name)];
  if (new Set(names).size !== names.length) throw new PipelineError("invalid_config", node.id, "aggregations");

  interface Acc { n: number; sum: number; num: number; min: number; max: number }
  const groups = new Map<string, { key: string[]; accs: Acc[] }>();
  for (const r of t.rows) {
    const key = gIdx.map((i) => r[i]);
    const k = key.join("\u0001");
    let g = groups.get(k);
    if (!g) {
      g = { key, accs: aggs.map(() => ({ n: 0, sum: 0, num: 0, min: Infinity, max: -Infinity })) };
      groups.set(k, g);
    }
    aggs.forEach((a, j) => {
      const acc = g!.accs[j];
      if (a.idx < 0) { acc.n++; return; }
      const v = r[a.idx];
      if (isEmpty(v)) return;
      acc.n++;
      const x = asNumber(v);
      if (x === null) return;
      acc.num++; acc.sum += x;
      if (x < acc.min) acc.min = x;
      if (x > acc.max) acc.max = x;
    });
  }
  const rows = [...groups.values()].map((g) => [
    ...g.key,
    ...aggs.map((a, j) => {
      const acc = g.accs[j];
      if (a.fn === "count") return String(acc.n);
      if (acc.num === 0) return "";
      return fmt(a.fn === "sum" ? acc.sum : a.fn === "mean" ? acc.sum / acc.num : a.fn === "min" ? acc.min : acc.max);
    }),
  ]);
  return { headers: names, rows };
}

function opJoin(left: Table, right: Table, node: PipelineNodeDef): Table {
  const lk = colIndex(left, str(node, "left_key"), node);
  const rk = colIndex(right, str(node, "right_key"), node);
  const kind = node.config.kind ?? "inner";
  if (kind !== "inner" && kind !== "left") throw new PipelineError("invalid_config", node.id, "kind");
  const rightKeep = right.headers.map((_, i) => i).filter((i) => i !== rk);
  const headers = uniqueHeaders([...left.headers, ...rightKeep.map((i) => right.headers[i])]);
  if (headers.length > MAX_COLUMNS) throw new PipelineError("too_many_columns", node.id);
  const index = new Map<string, string[][]>();
  for (const r of right.rows) {
    const k = r[rk].trim();
    if (k === "") continue; // une clé vide ne correspond à rien
    const list = index.get(k);
    if (list) list.push(r); else index.set(k, [r]);
  }
  const rows: string[][] = [];
  for (const l of left.rows) {
    const matches = l[lk].trim() === "" ? undefined : index.get(l[lk].trim());
    if (matches) {
      for (const m of matches) {
        rows.push([...l, ...rightKeep.map((i) => m[i])]);
        checkRows(rows.length, node);
      }
    } else if (kind === "left") {
      rows.push([...l, ...rightKeep.map(() => "")]);
      checkRows(rows.length, node);
    }
  }
  return { headers, rows };
}

// ---------- graphe ----------

export function validateGraph(nodes: PipelineNodeDef[], edges: PipelineEdgeDef[]): { order: string[]; outputId: string } {
  if (nodes.length > MAX_NODES) throw new PipelineError("too_many_nodes");
  const byId = new Map<string, PipelineNodeDef>();
  for (const n of nodes) {
    if (typeof n.id !== "string" || n.id === "" || byId.has(n.id)) throw new PipelineError("invalid_graph", n.id);
    if (!isNodeType(n.type)) throw new PipelineError("unknown_node_type", n.id, String(n.type));
    byId.set(n.id, n);
  }
  const incoming = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  const outgoing = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to) || e.from === e.to) throw new PipelineError("invalid_graph");
    incoming.get(e.to)!.push(e.from); // l'ordre des liens fait foi pour « gauche / droite » d'une jointure
    outgoing.set(e.from, outgoing.get(e.from)! + 1);
  }
  const outputs = nodes.filter((n) => n.type === "output");
  if (outputs.length !== 1) throw new PipelineError("no_output");
  const outputId = outputs[0].id;
  for (const n of nodes) {
    const want = n.type === "source" ? 0 : n.type === "join" ? 2 : 1;
    if (incoming.get(n.id)!.length !== want || new Set(incoming.get(n.id)).size !== want) {
      throw new PipelineError("wrong_inputs", n.id);
    }
    if (n.type === "output" && outgoing.get(n.id)! > 0) throw new PipelineError("invalid_graph", n.id);
  }
  // Ordre topologique (Kahn) : détecte aussi les cycles.
  const deg = new Map(nodes.map((n) => [n.id, incoming.get(n.id)!.length]));
  const queue = nodes.filter((n) => deg.get(n.id) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of edges) {
      if (e.from !== id) continue;
      deg.set(e.to, deg.get(e.to)! - 1);
      if (deg.get(e.to) === 0) queue.push(e.to);
    }
  }
  if (order.length !== nodes.length) throw new PipelineError("cycle");
  // Tout bloc doit contribuer au résultat.
  const needed = new Set<string>([outputId]);
  const stack = [outputId];
  while (stack.length) for (const p of incoming.get(stack.pop()!)!) if (!needed.has(p)) { needed.add(p); stack.push(p); }
  const dangling = nodes.find((n) => !needed.has(n.id));
  if (dangling) throw new PipelineError("dangling_node", dangling.id);
  return { order, outputId };
}

export function sourceIds(nodes: PipelineNodeDef[]): string[] {
  return nodes.filter((n) => n.type === "source").map((n) => {
    const id = n.config.dataset_id;
    if (typeof id !== "string") throw new PipelineError("invalid_config", n.id, "dataset_id");
    return id;
  });
}

// `load` fournit le contenu d'un jeu de données (déjà contrôlé : appartient au même espace de travail).
export async function runPipeline(
  nodes: PipelineNodeDef[],
  edges: PipelineEdgeDef[],
  load: (datasetId: string, nodeId: string) => Promise<Table>,
): Promise<PipelineRun> {
  const { order, outputId } = validateGraph(nodes, edges);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const results = new Map<string, Table>();
  const steps: StepResult[] = [];
  let outputName = "";
  for (const id of order) {
    const node = byId.get(id)!;
    const inputs = edges.filter((e) => e.to === id).map((e) => results.get(e.from)!);
    let out: Table;
    switch (node.type as NodeType) {
      case "source": out = await load(str(node, "dataset_id"), id); break;
      case "filter": out = opFilter(inputs[0], node); break;
      case "select": out = opSelect(inputs[0], node); break;
      case "dedupe": out = opDedupe(inputs[0], node); break;
      case "fill_missing": out = opFillMissing(inputs[0], node); break;
      case "aggregate": out = opAggregate(inputs[0], node); break;
      case "join": out = opJoin(inputs[0], inputs[1], node); break;
      case "output": {
        const n = node.config.name;
        outputName = (typeof n === "string" ? n.trim() : "").slice(0, 100) || "Pipeline";
        out = inputs[0];
        break;
      }
    }
    checkRows(out.rows.length, node);
    results.set(id, out);
    steps.push({ node_id: id, type: node.type, rows_out: out.rows.length });
  }
  const table = results.get(outputId)!;
  if (table.rows.length === 0) throw new PipelineError("empty_result", outputId);
  return { table, output_name: outputName, steps };
}
