import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/context/I18nContext';

const h = vi.hoisted(() => ({
  uploads: [] as string[],
  inserts: [] as Record<string, unknown>[],
  deletes: 0,
  removed: [] as string[][],
  invoked: [] as unknown[],
  invokeResult: { data: { row_count: 3, column_count: 2 }, error: null } as { data: unknown; error: unknown },
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/lib/activity', () => ({ logActivity: vi.fn() }));
vi.mock('@/lib/supabase', () => {
  const list = Promise.resolve({ data: [], error: null });
  return {
    supabase: {
      storage: {
        from: () => ({
          upload: (path: string) => { h.uploads.push(path); return Promise.resolve({ error: null }); },
          remove: (paths: string[]) => { h.removed.push(paths); return Promise.resolve({ error: null }); },
        }),
      },
      functions: { invoke: (name: string, opts: unknown) => { h.invoked.push([name, opts]); return Promise.resolve(h.invokeResult); } },
      from: () => ({
        select: () => ({ eq: () => ({ order: () => list }) }),
        insert: (row: Record<string, unknown>) => {
          h.inserts.push(row);
          return { select: () => ({ single: () => Promise.resolve({ data: { id: 'aaaaaaaa-2222-0000-0000-000000000001' }, error: null }) }) };
        },
        delete: () => ({ eq: () => { h.deletes++; return Promise.resolve({ error: null }); } }),
      }),
    },
  };
});

import { DataTab } from '@/pages/workspace/tabs/DataTab';

beforeEach(() => {
  h.uploads = []; h.inserts = []; h.deletes = 0; h.removed = []; h.invoked = [];
  h.invokeResult = { data: { row_count: 3, column_count: 2 }, error: null };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(cleanup);

async function pick(file: File) {
  render(<I18nProvider><DataTab projectId="p1" /></I18nProvider>);
  await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(0));
  fireEvent.click(screen.getAllByRole('button', { name: /Import|Importer/i })[0]);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}
const csv = new File(['a,b\n1,2\n'], 'ventes.csv', { type: 'text/csv' });

describe('DataTab : import', () => {
  it("n'envoie que les colonnes d'identité : lignes, colonnes et profil viennent du serveur", async () => {
    await pick(csv);
    await waitFor(() => expect(h.invoked).toHaveLength(1));
    expect(Object.keys(h.inserts[0]).sort()).toEqual(['name', 'project_id', 'size_bytes', 'source_config', 'source_type']);
    expect(h.invoked[0]).toEqual(['process-dataset', { body: { dataset_id: 'aaaaaaaa-2222-0000-0000-000000000001' } }]);
    expect(h.uploads[0]).toMatch(/^u1\/p1\/\d+_ventes\.csv$/);
    expect(h.deletes).toBe(0);
  });

  it('un fichier Excel est refusé clairement, sans rien envoyer', async () => {
    await pick(new File(['x'], 'budget.xlsx'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Excel/);
    expect(h.uploads).toEqual([]);
    expect(h.inserts).toEqual([]);
  });

  it('dépassement du plan gratuit : message explicite, le serveur a déjà tout supprimé', async () => {
    h.invokeResult = { data: null, error: { context: new Response(JSON.stringify({ error: 'plan_limit_rows' }), { status: 422 }) } };
    await pick(csv);
    expect((await screen.findByText(/10[\s\u202f\u00a0,]?000/)).textContent).toBeTruthy();
    expect(h.deletes).toBe(0);
    expect(h.removed).toEqual([]);
  });

  it('autre échec serveur : message précis et nettoyage (ligne + fichier)', async () => {
    h.invokeResult = { data: null, error: { context: new Response(JSON.stringify({ error: 'empty' }), { status: 422 }) } };
    await pick(csv);
    await screen.findByText(/vide|empty/i);
    expect(h.deletes).toBe(1);
    expect(h.removed[0][0]).toMatch(/^u1\/p1\//);
  });
});
