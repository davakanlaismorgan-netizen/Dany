import { supabase } from '@/lib/supabase';
import type { ChatMessage } from '@/types';

export type AiProvider = 'anthropic' | 'openai';
export const AI_PROVIDERS: AiProvider[] = ['anthropic', 'openai'];
export const MAX_MESSAGE_CHARS = 4000; // identique à la fonction serveur ai-assistant

export const ASSISTANT_ERROR_CODES = [
  'no_key', 'key_unreadable', 'quota', 'provider_invalid_key', 'provider_rate_limited', 'provider_error', 'not_configured',
  'conversation_full', 'not_found', 'unauthorized', 'invalid_request', 'server_error',
  'invalid_key', 'too_many_attempts',
];
// Tout code inconnu → message générique (pas de clé de traduction manquante).
export const assistantErrorCode = (code: string): string => (ASSISTANT_ERROR_CODES.includes(code) ? code : 'unknown');

export interface AssistantReply {
  reply: string;
  conversationId: string | null;
  saved: boolean;
  remaining: number;
  limit: number;
  dataset: string | null;
  statsComputed: boolean;
}
export type AssistantResult = { ok: true; data: AssistantReply } | { ok: false; code: string };
export interface AiKeyStatus { provider: AiProvider; last4: string }
export interface ConversationItem { id: string; title: string; updated_at: string }

async function errorCode(error: unknown): Promise<string> {
  let body: { error?: unknown } = {};
  const ctx = (error as { context?: unknown }).context;
  if (ctx instanceof Response) {
    try { body = await ctx.json(); } catch { /* corps non JSON */ }
  }
  return typeof body.error === 'string' ? body.error : 'unknown';
}

// Le serveur décide de tout : clé de l'utilisateur, quota du plan, calcul des chiffres, historique.
// Le navigateur n'envoie que le message, le projet, le jeu de données choisi et la langue.
export async function sendAssistantMessage(args: {
  projectId: string; datasetId: string | null; conversationId: string | null; message: string; lang: 'fr' | 'en';
}): Promise<AssistantResult> {
  const { data, error } = await supabase.functions.invoke('ai-assistant', {
    body: {
      project_id: args.projectId, message: args.message, lang: args.lang,
      ...(args.datasetId ? { dataset_id: args.datasetId } : {}),
      ...(args.conversationId ? { conversation_id: args.conversationId } : {}),
    },
  });
  if (error) return { ok: false, code: await errorCode(error) };
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    data: {
      reply: typeof d.reply === 'string' ? d.reply : '',
      conversationId: typeof d.conversation_id === 'string' ? d.conversation_id : null,
      saved: d.saved === true,
      remaining: typeof d.remaining === 'number' ? d.remaining : 0,
      limit: typeof d.limit === 'number' ? d.limit : 0,
      dataset: typeof d.dataset === 'string' ? d.dataset : null,
      statsComputed: d.stats_computed === true,
    },
  };
}

// La clé est vérifiée auprès du fournisseur puis chiffrée côté serveur ; elle ne revient jamais au navigateur.
export async function saveAiKey(provider: AiProvider, apiKey: string): Promise<{ ok: true; last4: string } | { ok: false; code: string }> {
  const { data, error } = await supabase.functions.invoke('ai-key', { body: { provider, api_key: apiKey } });
  if (error) return { ok: false, code: await errorCode(error) };
  return { ok: true, last4: typeof (data as { last4?: unknown })?.last4 === 'string' ? (data as { last4: string }).last4 : '' };
}

export async function getAiKeyStatus(): Promise<AiKeyStatus | null> {
  const { data, error } = await supabase.from('ai_provider_keys').select('provider, key_last4').maybeSingle();
  if (error) throw error;
  return data ? { provider: data.provider as AiProvider, last4: data.key_last4 as string } : null;
}

export async function deleteAiKey(userId: string): Promise<void> {
  const { error } = await supabase.from('ai_provider_keys').delete().eq('user_id', userId);
  if (error) throw error;
}

export async function listConversations(projectId: string): Promise<ConversationItem[]> {
  const { data, error } = await supabase.from('ai_conversations').select('id, title, updated_at')
    .eq('project_id', projectId).order('updated_at', { ascending: false }).limit(20);
  if (error) throw error;
  return (data ?? []) as ConversationItem[];
}

export async function loadConversation(id: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase.from('ai_conversations').select('messages').eq('id', id).maybeSingle();
  if (error) throw error;
  return Array.isArray(data?.messages) ? (data.messages as ChatMessage[]) : [];
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await supabase.from('ai_conversations').delete().eq('id', id);
  if (error) throw error;
}

export async function listProjects(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from('projects').select('id, name').order('updated_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as { id: string; name: string }[];
}

export async function listAnalysedDatasets(projectId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from('datasets').select('id, name').eq('project_id', projectId)
    .eq('status', 'profiled').order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []) as { id: string; name: string }[];
}
