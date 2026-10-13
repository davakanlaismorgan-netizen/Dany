import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/context/I18nContext';

const h = vi.hoisted(() => ({
  plan: 'premium' as string,
  members: [] as unknown[],
  invitations: [] as unknown[],
  workspaces: [] as unknown[],
  invite: vi.fn(),
  accept: vi.fn(),
  failInvite: null as null | { message: string },
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'me@test.dev' }, profile: { plan: h.plan, full_name: 'Moi' } }),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/report', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/team', async (orig) => ({
  ...(await orig<typeof import('@/lib/team')>()),
  listMembers: () => Promise.resolve(h.members),
  listInvitations: () => Promise.resolve(h.invitations),
  listWorkspaces: () => Promise.resolve(h.workspaces),
  inviteMember: (email: string, role: string) => {
    h.invite(email, role);
    return h.failInvite ? Promise.reject(h.failInvite) : Promise.resolve();
  },
  acceptInvitation: (id: string) => { h.accept(id); return Promise.resolve(); },
}));

import { TeamPanel } from '@/components/TeamPanel';

const ui = () => render(<MemoryRouter><I18nProvider><TeamPanel /></I18nProvider></MemoryRouter>);

beforeEach(() => {
  h.plan = 'premium';
  h.members = []; h.invitations = []; h.workspaces = [];
  h.invite.mockReset(); h.accept.mockReset(); h.failInvite = null;
});
afterEach(cleanup);

describe('TeamPanel', () => {
  it('plan gratuit : pas de formulaire d’invitation, proposition de passer à Premium', async () => {
    h.plan = 'free';
    ui();
    await waitFor(() => expect(screen.getByRole('link', { name: /plans/i })).toBeTruthy());
    expect(screen.queryByLabelText(/e-mail du collègue/i)).toBeNull();
  });

  it('Premium : invite avec l’e-mail saisi et le rôle choisi', async () => {
    ui();
    const input = await screen.findByLabelText(/e-mail du collègue/i);
    fireEvent.change(input, { target: { value: 'Collegue@Test.dev' } });
    fireEvent.change(screen.getByLabelText('Rôle'), { target: { value: 'editor' } });
    fireEvent.click(screen.getByRole('button', { name: /inviter/i }));
    await waitFor(() => expect(h.invite).toHaveBeenCalledWith('Collegue@Test.dev', 'editor'));
  });

  it('refuse une adresse invalide ou la sienne, sans appeler le serveur', async () => {
    ui();
    const input = await screen.findByLabelText(/e-mail du collègue/i);
    fireEvent.change(input, { target: { value: 'pas-un-email' } });
    fireEvent.click(screen.getByRole('button', { name: /inviter/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/invalide/i);
    fireEvent.change(input, { target: { value: 'ME@test.dev' } });
    fireEvent.click(screen.getByRole('button', { name: /inviter/i }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/vous-même/i));
    expect(h.invite).not.toHaveBeenCalled();
  });

  it('erreur serveur : message lisible, aucun détail technique', async () => {
    h.failInvite = { message: 'team_limit' };
    ui();
    fireEvent.change(await screen.findByLabelText(/e-mail du collègue/i), { target: { value: 'a@b.co' } });
    fireEvent.click(screen.getByRole('button', { name: /inviter/i }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/10 membres/);
    expect(alert.textContent).not.toMatch(/team_limit/);
  });

  it('affiche une invitation reçue et l’accepte', async () => {
    h.invitations = [{ id: 'inv1', owner_name: 'Awa', owner_email: 'awa@test.dev', role: 'viewer', created_at: '2026-10-01T00:00:00Z' }];
    ui();
    fireEvent.click(await screen.findByRole('button', { name: /accepter/i }));
    await waitFor(() => expect(h.accept).toHaveBeenCalledWith('inv1'));
  });
});
