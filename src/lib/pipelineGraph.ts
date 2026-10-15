// Modèle côté client d'un pipeline : blocs, liens (entrées de chaque bloc) et propagation des
// colonnes pour proposer des listes de colonnes valides. Le calcul réel est fait par le serveur
// (fonction run-pipeline) ; ici on ne fait que guider la saisie.
export type BlockType = 'source' | 'filter' | 'select' | 'dedupe' | 'fill_missing' | 'aggregate' | 'join' | 'output';

export const BLOCK_CATEGORIES: { key: 'data' | 'transform' | 'output'; types: BlockType[] }[] = [
  { key: 'data', types: ['source'] },
  { key: 'transform', types: ['filter', 'select', 'dedupe', 'fill_missing', 'aggregate', 'join'] },
  { key: 'output', types: ['output'] },
];

export interface EditorNode {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  config: Record<string, unknown>;
  inputs: string[]; // ids des blocs en entrée (2 pour une jointure : gauche puis droite)
}
export interface StoredNode { id: string; type: string; label?: string; x: number; y: number; config?: Record<string, unknown> }
export interface StoredEdge { id?: string; from: string; to: string }

export const BLOCK_TYPES: BlockType[] = ['source', 'filter', 'select', 'dedupe', 'fill_missing', 'aggregate', 'join', 'output'];
export const isBlockType = (t: unknown): t is BlockType => BLOCK_TYPES.includes(t as BlockType);
export const inputCount = (t: BlockType): number => (t === 'source' ? 0 : t === 'join' ? 2 : 1);

export function fromStored(nodes: StoredNode[], edges: StoredEdge[]): EditorNode[] {
  return nodes.filter((n) => isBlockType(n.type)).map((n) => ({
    id: n.id, type: n.type as BlockType, x: n.x, y: n.y,
    config: n.config && typeof n.config === 'object' ? n.config : {},
    inputs: edges.filter((e) => e.to === n.id).map((e) => e.from),
  }));
}

export function toStored(nodes: EditorNode[], label: (t: BlockType) => string): { nodes: StoredNode[]; edges: StoredEdge[] } {
  const ids = new Set(nodes.map((n) => n.id));
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: n.type, label: label(n.type), x: n.x, y: n.y, config: n.config })),
    edges: nodes.flatMap((n) =>
      n.inputs.filter((from) => from && ids.has(from) && from !== n.id).map((from) => ({ id: `${from}-${n.id}`, from, to: n.id })),
    ),
  };
}

export interface DatasetColumns { id: string; headers: string[] }

// Colonnes en sortie d'un bloc (même règles que le serveur ; approximation pour les noms en double).
export function outputColumns(nodes: EditorNode[], datasets: DatasetColumns[], id: string, seen: Set<string> = new Set()): string[] {
  const node = nodes.find((n) => n.id === id);
  if (!node || seen.has(id)) return [];
  const next = new Set(seen).add(id);
  const input = (i: number) => (node.inputs[i] ? outputColumns(nodes, datasets, node.inputs[i], next) : []);
  const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  switch (node.type) {
    case 'source': {
      const d = datasets.find((x) => x.id === node.config.dataset_id);
      return d ? d.headers : [];
    }
    case 'select': return strs(node.config.columns);
    case 'aggregate': {
      const aggs = Array.isArray(node.config.aggregations) ? node.config.aggregations as { fn?: string; column?: string }[] : [];
      return [...strs(node.config.group_by), ...aggs.map((a) => `${a.fn}_${a.column === '*' ? 'rows' : a.column}`)];
    }
    case 'join': {
      const right = input(1).filter((c) => c !== node.config.right_key);
      const left = input(0);
      const taken = new Set(left);
      return [...left, ...right.map((c) => { let n = c, k = 2; while (taken.has(n)) n = `${c}_${k++}`; taken.add(n); return n; })];
    }
    default: return input(0); // filter, dedupe, fill_missing, output
  }
}

// Un bloc ne peut pas dépendre (même indirectement) de lui-même : sert à filtrer la liste des entrées possibles.
export function dependsOn(nodes: EditorNode[], id: string, target: string, seen: Set<string> = new Set()): boolean {
  if (id === target) return true;
  if (seen.has(id)) return false;
  seen.add(id);
  const node = nodes.find((n) => n.id === id);
  return !!node && node.inputs.some((i) => dependsOn(nodes, i, target, seen));
}
