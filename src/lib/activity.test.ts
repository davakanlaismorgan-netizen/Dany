import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
import { countByDay } from '@/lib/activity';

describe('countByDay', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  it('compte par jour, du plus ancien au plus récent, zéros inclus', () => {
    const r = countByDay(['2026-10-10T01:00:00Z', '2026-10-10T23:00:00Z', '2026-10-08T05:00:00Z'], 3, now);
    expect(r).toEqual([{ day: '10-08', count: 1 }, { day: '10-09', count: 0 }, { day: '10-10', count: 2 }]);
  });
  it('ignore les événements hors fenêtre', () => {
    expect(countByDay(['2026-09-01T00:00:00Z'], 7, now).reduce((s, d) => s + d.count, 0)).toBe(0);
  });
});
