import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: h.invoke } } }));

import { assistantErrorCode, saveAiKey, sendAssistantMessage } from '@/lib/assistant';

beforeEach(() => h.invoke.mockReset());

describe('assistantErrorCode', () => {
  it('garde les codes connus et ramène le reste à « unknown »', () => {
    expect(assistantErrorCode('quota')).toBe('quota');
    expect(assistantErrorCode('provider_invalid_key')).toBe('provider_invalid_key');
    expect(assistantErrorCode('<script>')).toBe('unknown');
  });
});

describe('sendAssistantMessage', () => {
  it("n'envoie que le projet, le message et la langue (jamais d'historique ni de clé)", async () => {
    h.invoke.mockResolvedValue({ data: { reply: 'ok', conversation_id: 'c1', saved: true, remaining: 9, limit: 10, dataset: 'ventes', stats_computed: true }, error: null });
    const res = await sendAssistantMessage({ projectId: 'p1', datasetId: null, conversationId: null, message: 'salut', lang: 'fr' });
    expect(h.invoke).toHaveBeenCalledWith('ai-assistant', { body: { project_id: 'p1', message: 'salut', lang: 'fr' } });
    expect(res).toEqual({ ok: true, data: { reply: 'ok', conversationId: 'c1', saved: true, remaining: 9, limit: 10, dataset: 'ventes', statsComputed: true } });
  });

  it('transmet le jeu de données et la conversation choisis', async () => {
    h.invoke.mockResolvedValue({ data: { reply: 'ok' }, error: null });
    await sendAssistantMessage({ projectId: 'p1', datasetId: 'd1', conversationId: 'c1', message: 'x', lang: 'en' });
    expect(h.invoke.mock.calls[0][1].body).toEqual({ project_id: 'p1', message: 'x', lang: 'en', dataset_id: 'd1', conversation_id: 'c1' });
  });

  it("lit le code d'erreur renvoyé par le serveur", async () => {
    h.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: 'quota' }), { status: 429 }) } });
    expect(await sendAssistantMessage({ projectId: 'p', datasetId: null, conversationId: null, message: 'x', lang: 'fr' })).toEqual({ ok: false, code: 'quota' });
  });

  it('erreur sans corps lisible : code « unknown »', async () => {
    h.invoke.mockResolvedValue({ data: null, error: new Error('réseau') });
    expect(await sendAssistantMessage({ projectId: 'p', datasetId: null, conversationId: null, message: 'x', lang: 'fr' })).toEqual({ ok: false, code: 'unknown' });
  });
});

describe('saveAiKey', () => {
  it('renvoie seulement les 4 derniers caractères', async () => {
    h.invoke.mockResolvedValue({ data: { saved: true, last4: 'wxyz' }, error: null });
    expect(await saveAiKey('openai', 'sk-secret-wxyz')).toEqual({ ok: true, last4: 'wxyz' });
    expect(h.invoke).toHaveBeenCalledWith('ai-key', { body: { provider: 'openai', api_key: 'sk-secret-wxyz' } });
  });
  it('clé refusée : code renvoyé', async () => {
    h.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: 'invalid_key' }), { status: 422 }) } });
    expect(await saveAiKey('anthropic', 'x'.repeat(30))).toEqual({ ok: false, code: 'invalid_key' });
  });
});
