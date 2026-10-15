// Analyse d'un fichier de données (CSV ou JSON) : exécutée CÔTÉ SERVEUR, sur le fichier réellement
// stocké. Le résultat fait foi pour le nombre de lignes (limites du plan) et le profil.
import Papa from "npm:papaparse@5.5.3";

export const MAX_ROWS = 500_000; // au-delà : refus (limite de temps de calcul d'une edge function)
export const PREVIEW_ROWS = 100;
const MAX_COLUMNS = 500;

export type ColumnType = "number" | "text";
export interface ColumnProfile {
  name: string;
  type: ColumnType;
  missing: number;
  distinct: number; // plafonné à DISTINCT_CAP
}
export interface DatasetProfile {
  headers: string[];
  rowCount: number;
  badRows: number; // lignes dont le nombre de colonnes diffère de l'en-tête
  preview: string[][];
  columns: ColumnProfile[];
  encoding: "utf-8" | "windows-1252";
  delimiter: string;
}
export class DatasetError extends Error {
  constructor(public code: "empty" | "too_many_rows" | "too_many_columns" | "invalid_json" | "unsupported", msg?: string) {
    super(msg ?? code);
  }
}

const DISTINCT_CAP = 1000;
const NUMERIC = /^[-+]?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?$/;

// UTF-8 si valide, sinon Windows-1252 (cas courant des CSV exportés depuis Excel).
export function decodeText(bytes: Uint8Array): { text: string; encoding: "utf-8" | "windows-1252" } {
  let encoding: "utf-8" | "windows-1252" = "utf-8";
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
    encoding = "windows-1252";
  }
  return { text: text.replace(/^\uFEFF/, ""), encoding };
}

// Noms vides ou répétés : rendus uniques pour que le profil (et les pipelines) restent exploitables.
export function uniqueHeaders(h: unknown[]): string[] {
  const seen = new Map<string, number>();
  return h.map((raw, i) => {
    const base = String(raw ?? "").trim() || `col_${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
}

class Collector {
  headers: string[] = [];
  rowCount = 0;
  badRows = 0;
  preview: string[][] = [];
  private missing: number[] = [];
  private numeric: number[] = [];
  private distinct: Set<string>[] = [];

  setHeaders(h: string[]) {
    if (h.length > MAX_COLUMNS) throw new DatasetError("too_many_columns");
    this.headers = uniqueHeaders(h);
    this.missing = this.headers.map(() => 0);
    this.numeric = this.headers.map(() => 0);
    this.distinct = this.headers.map(() => new Set<string>());
  }

  addRow(cells: unknown[]) {
    if (this.rowCount >= MAX_ROWS) throw new DatasetError("too_many_rows");
    this.rowCount++;
    if (cells.length !== this.headers.length) this.badRows++;
    const row: string[] = [];
    for (let i = 0; i < this.headers.length; i++) {
      const v = cells[i] == null ? "" : typeof cells[i] === "object" ? JSON.stringify(cells[i]) : String(cells[i]);
      row.push(v);
      const t = v.trim();
      if (t === "") {
        this.missing[i]++;
        continue;
      }
      if (NUMERIC.test(t)) this.numeric[i]++;
      const d = this.distinct[i];
      if (d.size < DISTINCT_CAP) d.add(t);
    }
    if (this.preview.length < PREVIEW_ROWS) this.preview.push(row);
  }

  finish(encoding: DatasetProfile["encoding"], delimiter: string): DatasetProfile {
    if (this.headers.length === 0 || this.rowCount === 0) throw new DatasetError("empty");
    const columns = this.headers.map((name, i): ColumnProfile => {
      const nonEmpty = this.rowCount - this.missing[i];
      return {
        name,
        type: nonEmpty > 0 && this.numeric[i] / nonEmpty >= 0.95 ? "number" : "text",
        missing: this.missing[i],
        distinct: this.distinct[i].size,
      };
    });
    return {
      headers: this.headers, rowCount: this.rowCount, badRows: this.badRows,
      preview: this.preview, columns, encoding, delimiter,
    };
  }
}

export function profileCsv(bytes: Uint8Array): DatasetProfile {
  const { text, encoding } = decodeText(bytes);
  const c = new Collector();
  let first = true;
  let delimiter = ",";
  const res = Papa.parse<string[]>(text, {
    delimiter: "",
    delimitersToGuess: [",", ";", "\t", "|"],
    skipEmptyLines: "greedy",
    step: (r: Papa.ParseStepResult<string[]>, parser: Papa.Parser) => {
      try {
        if (first) {
          first = false;
          c.setHeaders(r.data);
          delimiter = r.meta.delimiter;
        } else {
          c.addRow(r.data);
        }
      } catch (e) {
        parser.abort();
        throw e;
      }
    },
  });
  void res;
  return c.finish(encoding, delimiter);
}

export function profileJson(bytes: Uint8Array): DatasetProfile {
  const { text, encoding } = decodeText(bytes);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new DatasetError("invalid_json");
  }
  const arr = Array.isArray(data) ? data : [data];
  const objs = arr.filter((x): x is Record<string, unknown> => x !== null && typeof x === "object" && !Array.isArray(x));
  if (objs.length === 0) throw new DatasetError("invalid_json", "attendu : un tableau d'objets");
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const o of objs) for (const k of Object.keys(o)) if (!seen.has(k)) { seen.add(k); keys.push(k); }
  const c = new Collector();
  c.setHeaders(keys);
  for (const o of objs) c.addRow(keys.map((k) => o[k]));
  return c.finish(encoding, "json");
}

export function profileFile(kind: string, bytes: Uint8Array): DatasetProfile {
  if (kind === "csv") return profileCsv(bytes);
  if (kind === "json") return profileJson(bytes);
  throw new DatasetError("unsupported");
}
