import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/context/I18nContext';
import { WorkspaceContext } from '@/lib/workspace';

const DS = 'aaaaaaaa-2222-0000-0000-000000000001';
const h = vi.hoisted(() => ({
  invoked: [] as [string, { body: Record<string, unknown> }][],
  invokeResult: { data: { model_id: 'm2', algorithm: 'forest', metrics: { accuracy: 0.9 } }, error: null } as { data: unknown; error: unknown },
  inserts: 0,
}));

const model = {
  id: 'm1', project_id: 'p1', dataset_id: 'd', name: 'Churn', model_type: 'automl', task_type: 'classification', algorithm: 'forest',
  status: 'completed', user_id: 'u1', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  metrics: { accuracy: 0.9123, f1_macro: 0.9, precision_macro: 0.91, recall_macro: 0.89 },
  feature_importance: { age: 0.7, ville: 0.3 },
  config: {
    plan: 'free', baseline: { accuracy: 0.55, f1_macro: 0.35 }, n_rows: 5000, n_rows_used: 1000, skipped: ['forest(trees=80,depth=12)'],
    leaderboard: [{ label: 'forest', score: 0.9, metrics: { f1_macro: 0.9 } }, { label: 'tree', score: 0.8, metrics: { f1_macro: 0.8 } }],
    dropped: [{ column: 'ident', reason: 'id_like' }],
  },
};

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (name: string, opts: { body: Record<string, unknown> }) => { h.invoked.push([name, opts]); return Promise.resolve(h.invokeResult); } },
    from: (table: string) => ({
      select: () => ({
        eq: () => table === 'models'
          ? { order: () => Promise.resolve({ data: [model], error: null }) }
          : { eq: () => Promise.resolve({ data: [{ id: DS, name: 'clients', profiling: { headers: ['age', 'ville', 'churn'] } }], error: null }) },
      }),
      insert: () => { h.inserts++; return Promise.resolve({ error: null }); },
    }),
  },
}));

import { ModelsTab } from '@/pages/workspace/tabs/ModelsTab';

beforeEach(() => {
  h.invoked = []; h.inserts = 0;
  h.invokeResult = { data: { model_id: 'm2', algorithm: 'forest', metrics: { accuracy: 0.9 } }, error: null };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(cleanup);

const renderTab = (canWrite = true) => render(
  <I18nProvider>
    <WorkspaceContext.Provider value={{ ownerId: 'u1', role: canWrite ? 'owner' : 'viewer', canWrite, isOwner: canWrite }}>
      <ModelsTab projectId="p1" />
    </WorkspaceContext.Provider>
  </I18nProvider>,
);

async function openForm() {
  renderTab();
  await waitFor(() => screen.getByText('Churn'));
  fireEvent.click(screen.getAllByRole('button', { name: /Entraîner|Train/i })[0]);
  await waitFor(() => expect(screen.getByLabelText(/jeu de données|dataset/i)).toBeTruthy());
}

describe('ModelsTab (AutoML réel)', () => {
  it("affiche les métriques enregistrées, la référence, l'échantillon et les colonnes ignorées — sans rien inventer", async () => {
    renderTab();
    await waitFor(() => screen.getByText('Churn'));
    expect(screen.getByText('0.912')).toBeTruthy(); // valeur lue en base, pas tirée au hasard
    fireEvent.click(screen.getByText('Churn'));
    await waitFor(() => expect(screen.getByText(/91\.2%/)).toBeTruthy()); // exactitude du modèle
    expect(screen.getByText(/55\.0%/)).toBeTruthy(); // référence
    expect(screen.getByText(/1000/)).toBeTruthy(); // échantillon
    expect(screen.getByText(/ident \(/)).toBeTruthy();
  });

  it("lance l'entraînement côté serveur avec les seuls choix de l'utilisateur (aucune métrique envoyée, aucune écriture directe)", async () => {
    await openForm();
    fireEvent.change(screen.getByLabelText(/jeu de données|dataset/i), { target: { value: DS } });
    fireEvent.change(screen.getByLabelText(/colonne cible|target/i), { target: { value: 'churn' } });
    fireEvent.click(screen.getByRole('button', { name: /Lancer|Start/i }));
    await waitFor(() => expect(h.invoked).toHaveLength(1));
    expect(h.invoked[0]).toEqual(['run-automl', { body: { dataset_id: DS, target: 'churn', task: 'classification' } }]);
    expect(h.inserts).toBe(0);
  });

  it("affiche l'erreur du serveur", async () => {
    h.invokeResult = { data: null, error: { context: new Response(JSON.stringify({ error: 'single_class' }), { status: 422 }) } };
    await openForm();
    fireEvent.change(screen.getByLabelText(/jeu de données|dataset/i), { target: { value: DS } });
    fireEvent.change(screen.getByLabelText(/colonne cible|target/i), { target: { value: 'age' } });
    fireEvent.click(screen.getByRole('button', { name: /Lancer|Start/i }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/une seule valeur|single value/));
  });

  it("un lecteur ne peut pas entraîner de modèle", async () => {
    renderTab(false);
    await waitFor(() => screen.getByText('Churn'));
    expect(screen.queryByRole('button', { name: /Entraîner|Train/i })).toBeNull();
  });
});
