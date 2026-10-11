import { describe, expect, it } from 'vitest';
import { buildChartData, isCompatible, parseNumber, type Profiling } from '@/lib/chartData';

const p: Profiling = {
  headers: ['ville', 'ventes', 'jour'],
  columns: [
    { name: 'ville', type: 'text', missing: 0, distinct: 2 },
    { name: 'ventes', type: 'number', missing: 0, distinct: 4 },
    { name: 'jour', type: 'number', missing: 0, distinct: 4 },
  ],
  preview: [['Cotonou', '10', '1'], ['Lomé', '5,5', '2'], ['Cotonou', '4', '3'], ['Lomé', 'n/a', '4']],
};

describe('parseNumber', () => {
  it('lit entiers, décimales à virgule et refuse le reste', () => {
    expect(parseNumber('12')).toBe(12);
    expect(parseNumber('5,5')).toBe(5.5);
    expect(parseNumber(' 1 000 ')).toBe(1000);
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
    expect(parseNumber(Infinity)).toBeNull();
  });
});

describe('buildChartData', () => {
  it('bar sans y : comptage par catégorie', () => {
    expect(buildChartData('bar', { x: 'ville' }, p)).toEqual([{ name: 'Cotonou', value: 2 }, { name: 'Lomé', value: 2 }]);
  });
  it('bar avec y numérique : somme, valeurs non numériques ignorées', () => {
    const d = buildChartData('pie', { x: 'ville', y: 'ventes' }, p);
    expect(d).toEqual([{ name: 'Cotonou', value: 14 }, { name: 'Lomé', value: 5.5 }]);
  });
  it('line : une valeur par ligne valide', () => {
    expect(buildChartData('line', { x: 'jour', y: 'ventes' }, p).map((d) => d.value)).toEqual([10, 5.5, 4]);
  });
  it('scatter : deux colonnes numériques', () => {
    expect(buildChartData('scatter', { x: 'jour', y: 'ventes' }, p)[1]).toEqual({ name: '2', x: 2, value: 5.5 });
  });
  it('combinaisons incompatibles ou colonnes inconnues : aucune donnée inventée', () => {
    expect(buildChartData('scatter', { x: 'ville', y: 'ventes' }, p)).toEqual([]);
    expect(buildChartData('line', { x: 'jour' }, p)).toEqual([]);
    expect(buildChartData('bar', { x: 'inconnue' }, p)).toEqual([]);
    expect(buildChartData('bar', { x: 'ville' }, {})).toEqual([]);
    expect(isCompatible('bar', { x: 'ville', y: 'ville' }, p)).toBe(false);
  });
  it('limite aux 10 premières catégories', () => {
    const rows = Array.from({ length: 30 }, (_, i) => [`c${i}`, '1', '1']);
    expect(buildChartData('bar', { x: 'ville' }, { ...p, preview: rows })).toHaveLength(10);
  });
});
