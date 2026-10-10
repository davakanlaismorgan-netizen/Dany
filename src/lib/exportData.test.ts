import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  ranges: [] as [string, number, number][],
  rowsFor: ((): { data: unknown[] | null; error: { message: string } | null } => ({ data: [], error: null })) as (t: string, from: number) => { data: unknown[] | null; error: { message: string } | null },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        order: () => ({
          range: (from: number, to: number) => {
            h.ranges.push([table, from, to]);
            return Promise.resolve(h.rowsFor(table, from));
          },
        }),
      }),
    }),
  },
}));

import { collectUserData, EXPORT_TABLES } from '@/lib/exportData';

beforeEach(() => {
  h.ranges = [];
  h.rowsFor = () => ({ data: [], error: null });
});

describe('collectUserData', () => {
  it('lit toutes les tables déclarées', async () => {
    const r = await collectUserData('u1');
    expect(Object.keys(r.tables).sort()).toEqual([...EXPORT_TABLES].sort());
    expect(r.user_id).toBe('u1');
    expect(r.errors).toEqual([]);
  });

  it('pagine au-delà de 1000 lignes sans rien perdre', async () => {
    h.rowsFor = (t, from) => {
      if (t !== 'projects') return { data: [], error: null };
      const n = from === 0 ? 1000 : from === 1000 ? 1000 : 250;
      return { data: Array.from({ length: n }, (_, i) => ({ id: from + i })), error: null };
    };
    const r = await collectUserData('u1');
    expect(r.tables.projects).toHaveLength(2250);
    expect(h.ranges.filter(([t]) => t === 'projects').map(([, f]) => f)).toEqual([0, 1000, 2000]);
  });

  it("signale une table illisible sans casser l'export des autres", async () => {
    h.rowsFor = (t) => (t === 'payments' ? { data: null, error: { message: 'boom' } } : { data: [{ id: 1 }], error: null });
    const r = await collectUserData('u1');
    expect(r.errors).toEqual(['payments: boom']);
    expect(r.tables.projects).toHaveLength(1);
    expect(r.tables.payments).toEqual([]);
  });
});
