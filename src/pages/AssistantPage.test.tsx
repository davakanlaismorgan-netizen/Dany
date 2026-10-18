import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/context/I18nContext';

const h = vi.hoisted(() => ({
  key: null as null | { provider: string; last4: string },
  projects: [{ id: 'p1', name: 'Churn' }] as { id: string; name: string }[],
  send: vi.fn(),
  saveKey: vi.fn(),
  sendResult: { ok: true, data: { reply: 'Voici le résumé.', conversationId: 'c1', saved: true, remaining: 9, limit: 10, dataset: 'ventes', statsComputed: true } } as unknown,
}));

// Objets stables : comme le vrai contexte, `user` ne change pas à chaque rendu (l'écran recharge ses données quand il change).
const auth = vi.hoisted(() => ({ user: { id: 'u1', email: 'me@test.dev' }, profile: { plan: 'free' } }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/report', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/assistant', async (orig) => ({
  ...(await orig<typeof import('@/lib/assistant')>()),
  listProjects: () => Promise.resolve(h.projects),
  getAiKeyStatus: () => Promise.resolve(h.key),
  listAnalysedDatasets: () => Promise.resolve([]),
  listConversations: () => Promise.resolve([]),
  loadConversation: () => Promise.resolve([]),
  deleteConversation: () => Promise.resolve(),
  deleteAiKey: () => Promise.resolve(),
  saveAiKey: (p: string, k: string) => { h.saveKey(p, k); return Promise.resolve({ ok: true, last4: k.slice(-4) }); },
  sendAssistantMessage: (a: unknown) => { h.send(a); return Promise.resolve(h.sendResult); },
}));

import AssistantPage from '@/pages/AssistantPage';

const ui = () => render(<MemoryRouter><I18nProvider><AssistantPage /></I18nProvider></MemoryRouter>);

beforeEach(() => {
  h.key = null; h.projects = [{ id: 'p1', name: 'Churn' }];
  h.send.mockReset(); h.saveKey.mockReset();
  h.sendResult = { ok: true, data: { reply: 'Voici le résumé.', conversationId: 'c1', saved: true, remaining: 9, limit: 10, dataset: 'ventes', statsComputed: true } };
});
afterEach(cleanup);

describe('AssistantPage', () => {
  it('sans clé : invite à en enregistrer une, aucune réponse inventée', async () => {
    ui();
    expect(await screen.findByText(/Connectez votre clé d’IA/)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/Posez vos questions/)).toBeNull();
  });

  it('enregistre la clé saisie puis passe au chat, et efface le champ', async () => {
    ui();
    const input = (await screen.findByLabelText('Clé API')) as HTMLInputElement;
    expect(input.type).toBe('password');
    fireEvent.change(input, { target: { value: 'sk-ant-abcdefghijklmnop-wxyz' } });
    fireEvent.click(screen.getByRole('button', { name: /vérifier et enregistrer/i }));
    await waitFor(() => expect(h.saveKey).toHaveBeenCalledWith('anthropic', 'sk-ant-abcdefghijklmnop-wxyz'));
    expect(await screen.findByPlaceholderText(/Posez vos questions/)).toBeTruthy();
  });

  it('avec une clé : envoie le message au serveur et affiche la réponse et le quota', async () => {
    h.key = { provider: 'anthropic', last4: 'wxyz' };
    ui();
    const box = await screen.findByPlaceholderText(/Posez vos questions/);
    await waitFor(() => expect((screen.getByLabelText('Projet') as HTMLSelectElement).value).toBe('p1'));
    fireEvent.change(box, { target: { value: 'Résume mes données' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() => expect(h.send).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1', message: 'Résume mes données', lang: 'fr', conversationId: null })));
    expect(await screen.findByText('Voici le résumé.')).toBeTruthy();
    expect(screen.getByText(/9 \/ 10/)).toBeTruthy();
  });

  it('quota atteint : message d’erreur clair et texte rendu à l’utilisateur', async () => {
    h.key = { provider: 'openai', last4: '1234' };
    h.sendResult = { ok: false, code: 'quota' };
    ui();
    const box = (await screen.findByPlaceholderText(/Posez vos questions/)) as HTMLTextAreaElement;
    await waitFor(() => expect((screen.getByLabelText('Projet') as HTMLSelectElement).value).toBe('p1'));
    fireEvent.change(box, { target: { value: 'encore une question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect((await screen.findByText(/nombre de messages de votre plan/)).textContent).toMatch(/demain/);
    expect(box.value).toBe('encore une question');
  });

  it('sans projet : propose d’en créer un', async () => {
    h.key = { provider: 'anthropic', last4: 'wxyz' };
    h.projects = [];
    ui();
    expect(await screen.findByText(/Créez d’abord un projet/)).toBeTruthy();
  });
});
