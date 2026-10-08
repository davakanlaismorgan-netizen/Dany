import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

type Listener = (event: string, session: unknown) => void;
const h = vi.hoisted(() => ({
  listener: null as Listener | null,
  profileCalls: 0,
  rpcCalls: 0,
  failRpc: false,
  unsubscribe: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: Listener) => {
        h.listener = cb;
        return { data: { subscription: { unsubscribe: h.unsubscribe } } };
      },
    },
    from: (table: string) => {
      if (table === 'profiles') h.profileCalls++;
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve({ data: table === 'profiles' ? { id: 'u1', email: 'a@b.c' } : { current_period_end: null }, error: null }),
      };
      return chain;
    },
    rpc: () => {
      h.rpcCalls++;
      return h.failRpc ? Promise.reject(new Error('réseau')) : Promise.resolve({ data: 'premium', error: null });
    },
  },
}));

import { AuthProvider, useAuth } from './AuthContext';

function Probe() {
  const { loading, profile } = useAuth();
  return <p data-testid="state">{loading ? 'loading' : 'ready'}|{profile?.plan ?? 'none'}</p>;
}
const state = () => screen.getByTestId('state').textContent;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 10)); });
const session = { user: { id: 'u1' } };
const emit = (event: string, s: unknown) => act(async () => { h.listener!(event, s); await new Promise((r) => setTimeout(r, 10)); });

describe('AuthProvider : chargement du profil', () => {
  beforeEach(() => { h.profileCalls = 0; h.rpcCalls = 0; h.failRpc = false; h.listener = null; vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('sans session au démarrage : prêt immédiatement, aucune requête', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await emit('INITIAL_SESSION', null);
    expect(state()).toBe('ready|none');
    expect(h.profileCalls + h.rpcCalls).toBe(0);
  });

  it('avec session : un seul chargement (profil + plan), et le plan vient de current_plan()', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(state()).toBe('loading|none');
    await emit('INITIAL_SESSION', session);
    expect(state()).toBe('ready|premium');
    expect(h.profileCalls).toBe(1);
    expect(h.rpcCalls).toBe(1);
  });

  it('ne recharge pas sur un SIGNED_IN répété (retour sur l\'onglet) ni sur un renouvellement de jeton', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await emit('INITIAL_SESSION', session);
    await emit('SIGNED_IN', session);
    await emit('TOKEN_REFRESHED', session);
    expect(h.profileCalls).toBe(1);
  });

  it('recharge quand l\'utilisateur est mis à jour, ou qu\'un autre utilisateur se connecte', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await emit('INITIAL_SESSION', session);
    await emit('USER_UPDATED', session);
    expect(h.profileCalls).toBe(2);
    await emit('SIGNED_IN', { user: { id: 'u2' } });
    expect(h.profileCalls).toBe(3);
  });

  it('SIGNED_OUT vide le profil, et une reconnexion recharge', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await emit('INITIAL_SESSION', session);
    await emit('SIGNED_OUT', null);
    expect(state()).toBe('ready|none');
    await emit('SIGNED_IN', session);
    expect(h.profileCalls).toBe(2);
  });

  it('un échec de chargement ne bloque jamais sur l\'écran de chargement', async () => {
    h.failRpc = true;
    render(<AuthProvider><Probe /></AuthProvider>);
    await emit('INITIAL_SESSION', session);
    await flush();
    expect(state()?.startsWith('ready')).toBe(true);
  });

  it('se désabonne au démontage', () => {
    const { unmount } = render(<AuthProvider><Probe /></AuthProvider>);
    unmount();
    expect(h.unsubscribe).toHaveBeenCalled();
  });
});
