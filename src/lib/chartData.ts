// Transforme l'aperçu stocké d'un jeu de données (100 premières lignes, calculé par le serveur)
// en séries pour les graphiques. Aucune donnée inventée : tout vient du fichier de l'utilisateur.
export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'scatter';
export const CHART_TYPES: ChartType[] = ['bar', 'line', 'area', 'pie', 'scatter'];

export interface Profiling {
  headers?: string[];
  preview?: string[][];
  columns?: { name: string; type: 'number' | 'text'; missing: number; distinct: number }[];
}
export interface ChartConfig { dataset_id?: string; x?: string; y?: string }
export interface Point { name: string; value: number; x?: number }

export function parseNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/\s/g, '');
  if (!/^[-+]?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?$/.test(s)) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const TOP = 10;

export function isCompatible(type: ChartType, cfg: ChartConfig, p: Profiling): boolean {
  const cols = p.columns ?? [];
  const kind = (n?: string) => cols.find((c) => c.name === n)?.type;
  if (!cfg.x || !kind(cfg.x)) return false;
  if (type === 'scatter') return kind(cfg.x) === 'number' && kind(cfg.y) === 'number';
  if (type === 'line' || type === 'area') return kind(cfg.y) === 'number';
  return !cfg.y || kind(cfg.y) === 'number'; // bar / pie : comptage, ou somme d'une colonne numérique
}

export function buildChartData(type: ChartType, cfg: ChartConfig, p: Profiling): Point[] {
  const headers = p.headers ?? [];
  const rows = p.preview ?? [];
  const xi = headers.indexOf(cfg.x ?? '');
  const yi = cfg.y ? headers.indexOf(cfg.y) : -1;
  if (xi < 0 || !isCompatible(type, cfg, p)) return [];

  if (type === 'scatter') {
    return rows.flatMap((r, i): Point[] => {
      const x = parseNumber(r[xi]);
      const y = parseNumber(r[yi]);
      return x === null || y === null ? [] : [{ name: String(i + 1), x, value: y }];
    });
  }
  if (type === 'line' || type === 'area') {
    return rows.flatMap((r): Point[] => {
      const y = parseNumber(r[yi]);
      return y === null ? [] : [{ name: r[xi] ?? '', value: y }];
    });
  }
  // bar / pie : regroupement par catégorie
  const groups = new Map<string, number>();
  for (const r of rows) {
    const key = (r[xi] ?? '').trim() || '—';
    const inc = yi >= 0 ? parseNumber(r[yi]) : 1;
    if (inc === null) continue;
    groups.set(key, (groups.get(key) ?? 0) + inc);
  }
  return [...groups.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP);
}
