import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/context/I18nContext';

const h = vi.hoisted(() => ({ fail: false }));

vi.mock('@/lib/supabase', () => {
  const result = (table: string) => {
    if (h.fail && table === 'payments') return { data: null, error: { message: 'x' }, count: null };
    if (table === 'payments') return { data: [
      { id: '1', transaction_id: 'TX-OK', plan: 'premium', amount: 17900, method: 'momo', provider: 'kkiapay', created_at: '2026-10-01T10:00:00Z', refunded_at: null },
      { id: '2', transaction_id: 'TX-REF', plan: 'premium', amount: 17900, method: 'card', provider: 'kkiapay-sandbox', created_at: '2026-09-01T10:00:00Z', refunded_at: '2026-09-02T10:00:00Z' },
    ], error: null };
    if (table === 'datasets') return { data: [{ row_count: 9000 }], error: null };
    return { data: null, error: null, count: 2 };
  };
  const chain = (table: string): unknown => {
    const p = Promise.resolve(result(table));
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'limit']) c[m] = () => c;
    c.then = p.then.bind(p);
    return c;
  };
  return { supabase: { from: (t: string) => chain(t) } };
});

import { BillingDetails } from '@/components/BillingDetails';

afterEach(cleanup);
const ui = (free: boolean) => render(<I18nProvider><BillingDetails isFree={free} /></I18nProvider>);

describe('BillingDetails', () => {
  it('affiche l\'historique (payé / remboursé / test) et la consommation réelle', async () => {
    ui(true);
    await waitFor(() => expect(screen.getByText('TX-OK')).toBeTruthy());
    expect(screen.getByText(/TX-REF/).textContent).toContain('(test)');
    expect(screen.getAllByText(/17[\s  ,]900 FCFA/).length).toBe(2);
    const bars = screen.getAllByRole('progressbar');
    expect(bars).toHaveLength(3);
    expect(bars[0].getAttribute('aria-valuenow')).toBe('2');
    expect(bars[2].getAttribute('aria-valuenow')).toBe('9000');
  });

  it('en Premium : pas de barres de limite', async () => {
    ui(false);
    await waitFor(() => expect(screen.getByText('TX-OK')).toBeTruthy());
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
  });

  it('erreur de chargement : message avec réessai, pas de faux zéros', async () => {
    h.fail = true;
    ui(true);
    await waitFor(() => expect(screen.getByRole('button')).toBeTruthy());
    expect(screen.queryByRole('progressbar')).toBeNull();
    h.fail = false;
  });
});
