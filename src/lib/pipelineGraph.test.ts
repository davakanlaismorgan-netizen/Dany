import { describe, expect, it } from 'vitest';
import { dependsOn, fromStored, outputColumns, toStored, type EditorNode } from './pipelineGraph';

const ds = [{ id: 'd1', headers: ['ville', 'montant'] }, { id: 'd2', headers: ['ville', 'pays'] }];
const node = (id: string, type: EditorNode['type'], inputs: string[] = [], config: Record<string, unknown> = {}): EditorNode =>
  ({ id, type, x: 0, y: 0, inputs, config });

describe('pipelineGraph', () => {
  it('propage les colonnes à travers les blocs', () => {
    const nodes = [
      node('a', 'source', [], { dataset_id: 'd1' }),
      node('f', 'filter', ['a']),
      node('g', 'aggregate', ['f'], { group_by: ['ville'], aggregations: [{ column: 'montant', fn: 'sum' }, { column: '*', fn: 'count' }] }),
      node('s', 'select', ['f'], { columns: ['montant'] }),
    ];
    expect(outputColumns(nodes, ds, 'f')).toEqual(['ville', 'montant']);
    expect(outputColumns(nodes, ds, 'g')).toEqual(['ville', 'sum_montant', 'count_rows']);
    expect(outputColumns(nodes, ds, 's')).toEqual(['montant']);
  });

  it('jointure : colonnes de gauche puis de droite sans la clé, noms uniques', () => {
    const nodes = [
      node('a', 'source', [], { dataset_id: 'd1' }), node('b', 'source', [], { dataset_id: 'd2' }),
      node('j', 'join', ['a', 'b'], { left_key: 'ville', right_key: 'ville' }),
    ];
    expect(outputColumns(nodes, ds, 'j')).toEqual(['ville', 'montant', 'pays']);
  });

  it('source inconnue, entrée manquante ou cycle : liste vide, sans boucle infinie', () => {
    expect(outputColumns([node('a', 'source', [], { dataset_id: 'nope' })], ds, 'a')).toEqual([]);
    expect(outputColumns([node('f', 'filter', [])], ds, 'f')).toEqual([]);
    expect(outputColumns([node('x', 'filter', ['y']), node('y', 'filter', ['x'])], ds, 'x')).toEqual([]);
  });

  it('dependsOn détecte les dépendances directes, indirectes et les cycles', () => {
    const nodes = [node('a', 'source'), node('b', 'filter', ['a']), node('c', 'dedupe', ['b'])];
    expect(dependsOn(nodes, 'c', 'a')).toBe(true);
    expect(dependsOn(nodes, 'a', 'c')).toBe(false);
    expect(dependsOn([node('x', 'filter', ['y']), node('y', 'filter', ['x'])], 'x', 'z')).toBe(false);
  });

  it('enregistrement : les liens suivent l\'ordre des entrées, les liens orphelins sont ignorés', () => {
    const nodes = [node('a', 'source'), node('b', 'source'), node('j', 'join', ['b', 'a']), node('o', 'output', ['ghost'])];
    const { nodes: sn, edges } = toStored(nodes, (t) => t.toUpperCase());
    expect(sn[2].label).toBe('JOIN');
    expect(edges).toEqual([{ id: 'b-j', from: 'b', to: 'j' }, { id: 'a-j', from: 'a', to: 'j' }]);
    expect(fromStored(sn, edges).find((n) => n.id === 'j')?.inputs).toEqual(['b', 'a']);
  });

  it('chargement : les anciens blocs de démonstration (types inconnus) sont écartés', () => {
    const out = fromStored(
      [{ id: 'n1', type: 'csv_import', x: 0, y: 0 }, { id: 'n2', type: 'filter', x: 1, y: 1, config: { column: 'a' } }],
      [{ from: 'n1', to: 'n2' }],
    );
    expect(out.map((n) => n.id)).toEqual(['n2']);
    expect(out[0].config).toEqual({ column: 'a' });
  });
});
