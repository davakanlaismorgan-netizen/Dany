import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/context/I18nContext';
import { WorkspaceContext } from '@/lib/workspace';

const h = vi.hoisted(() => ({
  invoked: [] as [string, { body: Record<string, unknown> }][],
  invokeResult: { data: { report_id: 'r2', format: 'pdf', branding: 'das', brand_name_missing: false }, error: null } as { data: unknown; error: unknown },
  signed: [] as [string, number, unknown][],
  removed: [] as string[][],
  deleted: [] as string[],
  plan: 'free',
  company: '' as string,
  reports: [] as unknown[],
}));

const report = (over: Record<string, unknown> = {}) => ({
  id: 'r1', project_id: 'p1', name: 'Synthèse exécutive — 2026-10-17', format: 'pdf', status: 'completed',
  file_url: 'u1/r1.pdf', config: { branding: 'das' }, user_id: 'u1', created_at: new Date().toISOString(), ...over,
});

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: { plan: h.plan, company: h.company } }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (name: string, opts: { body: Record<string, unknown> }) => { h.invoked.push([name, opts]); return Promise.resolve(h.invokeResult); } },
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: h.reports, error: null }) }) }),
      delete: () => ({ eq: (_c: string, id: string) => { h.deleted.push(id); return Promise.resolve({ error: null }); } }),
    }),
    storage: {
      from: () => ({
        createSignedUrl: (path: string, s: number, o: unknown) => { h.signed.push([path, s, o]); return Promise.resolve({ data: { signedUrl: `https://signed/${path}` }, error: null }); },
        remove: (paths: string[]) => { h.removed.push(paths); return Promise.resolve({ error: null }); },
        upload: () => Promise.resolve({ error: null }),
      }),
    },
  },
}));

import { ReportsTab } from '@/pages/workspace/tabs/ReportsTab';

beforeEach(() => {
  h.invoked = []; h.signed = []; h.removed = []; h.deleted = []; h.plan = 'free'; h.company = ''; h.reports = [report()];
  h.invokeResult = { data: { report_id: 'r2', format: 'pdf', branding: 'das', brand_name_missing: false }, error: null };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(window, 'open').mockImplementation(() => null);
});
afterEach(cleanup);

const renderTab = (role: 'owner' | 'editor' | 'viewer' = 'owner') => render(
  <MemoryRouter>
    <I18nProvider>
      <WorkspaceContext.Provider value={{ ownerId: 'u1', role, canWrite: role !== 'viewer', isOwner: role === 'owner' }}>
        <ReportsTab projectId="p1" />
      </WorkspaceContext.Provider>
    </I18nProvider>
  </MemoryRouter>,
);

describe('ReportsTab', () => {
  it('liste les vrais rapports, sans bandeau Démo', async () => {
    renderTab();
    await waitFor(() => screen.getByText('Synthèse exécutive — 2026-10-17'));
    expect(screen.queryByText(/Démo|Demo/)).toBeNull();
    expect(screen.getByText(/Marque DAS|DAS branding/)).toBeTruthy();
  });

  it('génère via le serveur : seuls le projet, le modèle et la langue sont envoyés (jamais la marque)', async () => {
    renderTab();
    await waitFor(() => screen.getByText('Synthèse exécutive — 2026-10-17'));
    fireEvent.click(screen.getAllByRole('button', { name: /Générer un Rapport|Generate Report/i })[0]);
    fireEvent.click(screen.getByRole('radio', { name: /Analyse détaillée|Detailed analysis/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Générer$|^Generate$/i }));
    await waitFor(() => expect(h.invoked.length).toBe(1));
    expect(h.invoked[0][0]).toBe('generate-report');
    expect(h.invoked[0][1].body).toEqual({ project_id: 'p1', template: 'detailed', lang: 'fr' });
  });

  it('erreur serveur : message clair, rien n\'est ajouté à la liste', async () => {
    h.invokeResult = { data: null, error: { context: new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 }) } };
    renderTab();
    await waitFor(() => screen.getByText('Synthèse exécutive — 2026-10-17'));
    fireEvent.click(screen.getAllByRole('button', { name: /Générer un Rapport|Generate Report/i })[0]);
    fireEvent.click(screen.getByRole('radio', { name: /Synthèse exécutive|Executive summary/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Générer$|^Generate$/i }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/20 par heure/));
  });

  it('le bouton Télécharger crée un lien signé court avec le nom du fichier ; « Ouvrir » ne force pas le téléchargement', async () => {
    renderTab();
    await waitFor(() => screen.getByText('Synthèse exécutive — 2026-10-17'));
    fireEvent.click(screen.getByRole('button', { name: /^Télécharger$|^Download$/ }));
    await waitFor(() => expect(h.signed.length).toBe(1));
    expect(h.signed[0][0]).toBe('u1/r1.pdf');
    expect(h.signed[0][1]).toBeLessThanOrEqual(300);
    expect(h.signed[0][2]).toEqual({ download: 'Synthèse exécutive — 2026-10-17.pdf' });
    expect(window.open).toHaveBeenCalledWith('https://signed/u1/r1.pdf', '_blank', 'noopener');
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir le rapport|Open report/ }));
    await waitFor(() => expect(h.signed.length).toBe(2));
    expect(h.signed[1][2]).toBeUndefined();
  });

  it('la suppression retire la ligne ET le fichier', async () => {
    renderTab();
    await waitFor(() => screen.getByText('Synthèse exécutive — 2026-10-17'));
    fireEvent.click(screen.getByRole('button', { name: /Supprimer le rapport|Delete report/ }));
    await waitFor(() => expect(h.removed).toEqual([['u1/r1.pdf']]));
    expect(h.deleted).toEqual(['r1']);
  });

  it('lecteur : ni génération ni suppression ; éditeur : pas de réglage de marque', async () => {
    renderTab('viewer');
    await waitFor(() => screen.getByText('Synthèse exécutive — 2026-10-17'));
    expect(screen.queryByRole('button', { name: /Générer un Rapport|Generate Report/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Supprimer le rapport|Delete report/ })).toBeNull();
    cleanup();
    renderTab('editor');
    await waitFor(() => screen.getByText('Synthèse exécutive — 2026-10-17'));
    expect(screen.queryByText(/Marque des rapports|Report branding/)).toBeNull();
    expect(screen.getAllByRole('button', { name: /Générer un Rapport|Generate Report/i }).length).toBeGreaterThan(0);
  });

  it('plan gratuit : marque DAS + lien vers Premium, aucun réglage de logo', async () => {
    renderTab();
    await waitFor(() => screen.getByText(/Marque des rapports|Report branding/));
    expect(screen.getByRole('link', { name: /Premium/ })).toBeTruthy();
    expect(screen.queryByLabelText(/Choisir un logo|Choose a logo/)).toBeNull();
  });

  it('Premium : nom d\'organisation et réglage du logo ; sans nom, invitation à le renseigner', async () => {
    h.plan = 'premium'; h.company = 'Acme Analytics';
    renderTab();
    await waitFor(() => screen.getByText('Acme Analytics'));
    expect(screen.getByLabelText(/Choisir un logo|Choose a logo/)).toBeTruthy();
    cleanup();
    h.company = '';
    renderTab();
    await waitFor(() => screen.getByText(/Renseignez le nom de votre organisation/));
  });

  it('un ancien rapport sans fichier est signalé comme indisponible (pas de faux bouton Télécharger)', async () => {
    h.reports = [report({ file_url: null, status: 'generating' })];
    renderTab();
    await waitFor(() => screen.getByText(/Fichier indisponible|File unavailable/));
    expect(screen.queryByRole('button', { name: /^Télécharger$|^Download$/ })).toBeNull();
  });
});
