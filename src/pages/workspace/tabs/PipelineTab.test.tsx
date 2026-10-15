import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/context/I18nContext';
import { WorkspaceContext } from '@/lib/workspace';

const PID = 'aaaaaaaa-3333-0000-0000-000000000001';
const h = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
  invoked: [] as unknown[],
  invokeResult: { data: null, error: null } as { data: unknown; error: unknown },
  pipeline: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (name: string, opts: unknown) => { h.invoked.push([name, opts]); return Promise.resolve(h.invokeResult); } },
    from: (table: string) => ({
      select: () => ({
        eq: () => table === 'pipelines'
          ? { maybeSingle: () => Promise.resolve({ data: h.pipeline, error: null }) }
          : { eq: () => Promise.resolve({ data: [{ id: 'd1', name: 'ventes', status: 'profiled', profiling: { headers: ['ville', 'montant'] } }], error: null }) },
      }),
      update: (row: Record<string, unknown>) => { h.updates.push(row); return { eq: () => Promise.resolve({ error: null }) }; },
    }),
  },
}));

import { PipelineTab } from '@/pages/workspace/tabs/PipelineTab';

const stored = () => ({
  id: PID, status: 'draft',
  nodes: [
    { id: 'a', type: 'source', label: 'x', x: 10, y: 10, config: { dataset_id: 'd1' } },
    { id: 'f', type: 'filter', label: 'x', x: 200, y: 10, config: { column: 'montant', op: 'gt', value: '10' } },
    { id: 'z', type: 'output', label: 'x', x: 400, y: 10, config: { name: 'Résultat' } },
  ],
  edges: [{ id: 'a-f', from: 'a', to: 'f' }, { id: 'f-z', from: 'f', to: 'z' }],
});

beforeEach(() => {
  h.updates = []; h.invoked = []; h.pipeline = stored();
  h.invokeResult = { data: { dataset_id: 'n1', row_count: 7, column_count: 2, steps: [{ node_id: 'a', type: 'source', rows_out: 10 }, { node_id: 'f', type: 'filter', rows_out: 7 }, { node_id: 'z', type: 'output', rows_out: 7 }] }, error: null };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(cleanup);

const renderTab = (canWrite = true) => render(
  <I18nProvider>
    <WorkspaceContext.Provider value={{ ownerId: 'u1', role: canWrite ? 'owner' : 'viewer', canWrite, isOwner: canWrite }}>
      <PipelineTab projectId="p1" />
    </WorkspaceContext.Provider>
  </I18nProvider>,
);

describe('PipelineTab', () => {
  it("charge le pipeline enregistré, l'enregistre puis demande au serveur de l'exécuter (par identifiant, sans graphe)", async () => {
    renderTab();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Filtrer les lignes|Filter rows/ }).length).toBeGreaterThan(1));
    fireEvent.click(screen.getByRole('button', { name: /Exécuter|Run/ }));
    await waitFor(() => expect(h.invoked).toHaveLength(1));
    expect(h.invoked[0]).toEqual(['run-pipeline', { body: { pipeline_id: PID } }]);
    expect(h.updates).toHaveLength(1); // enregistré avant l'exécution
    expect((h.updates[0].edges as unknown[]).length).toBe(2);
    await waitFor(() => expect(screen.getByText(/7 (lignes|rows)/, { selector: 'strong' })).toBeTruthy());
  });

  it("affiche l'erreur du serveur et surligne le bloc fautif", async () => {
    const body = JSON.stringify({ error: 'column_not_found', node_id: 'f', detail: 'montant' });
    h.invokeResult = { data: null, error: { context: new Response(body, { status: 422 }) } };
    renderTab();
    await waitFor(() => screen.getAllByRole('button', { name: /Filtrer les lignes|Filter rows/ }));
    fireEvent.click(screen.getByRole('button', { name: /Exécuter|Run/ }));
    await waitFor(() => expect(screen.getByText(/Colonne introuvable|Column not found/)).toBeTruthy());
    expect(screen.getByText('montant', { selector: 'code' })).toBeTruthy();
  });

  it('un lecteur (viewer) ne peut ni exécuter, ni enregistrer, ni ajouter de bloc', async () => {
    renderTab(false);
    await waitFor(() => screen.getAllByRole('button', { name: /Filtrer les lignes|Filter rows/ }));
    expect(screen.queryByRole('button', { name: /Exécuter|Run/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Enregistrer|Save/ })).toBeNull();
    const add = screen.getAllByRole('button', { name: /Filtrer les lignes|Filter rows/ }).find((b) => (b as HTMLButtonElement).disabled);
    expect(add).toBeTruthy();
  });
});
