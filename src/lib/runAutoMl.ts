import { supabase } from '@/lib/supabase';

export const AUTOML_ERROR_CODES = [
  'target_not_found', 'target_not_numeric', 'too_few_rows', 'single_class', 'too_many_classes', 'no_usable_features',
  'unknown_feature', 'dataset_not_ready', 'dataset_too_large', 'server_error', 'not_found', 'unauthorized', 'invalid_request',
  'empty', 'invalid_json', 'unsupported', 'too_many_rows', 'too_many_columns',
];
// Tout code inconnu → message générique (pas de clé de traduction manquante).
export const automlErrorCode = (code: string): string => (AUTOML_ERROR_CODES.includes(code) ? code : 'unknown');

export interface AutoMlRequest { datasetId: string; target: string; task: 'classification' | 'regression'; name?: string }
export type AutoMlRunResult =
  | { ok: true; modelId: string; algorithm: string; metrics: Record<string, number> }
  | { ok: false; code: string; detail: string | null };

// Le serveur lit le fichier stocké, entraîne et ÉVALUE les modèles (validation croisée), détermine le plan
// effectif du propriétaire et enregistre lui-même le modèle : le navigateur ne fournit aucune métrique.
export async function runAutoMl(req: AutoMlRequest): Promise<AutoMlRunResult> {
  const { data, error } = await supabase.functions.invoke('run-automl', {
    body: { dataset_id: req.datasetId, target: req.target, task: req.task, ...(req.name ? { name: req.name } : {}) },
  });
  if (!error) {
    const d = (data ?? {}) as { model_id?: string; algorithm?: string; metrics?: Record<string, number> };
    return { ok: true, modelId: d.model_id ?? '', algorithm: d.algorithm ?? '', metrics: d.metrics ?? {} };
  }
  let body: { error?: unknown; detail?: unknown } = {};
  const ctx = (error as { context?: unknown }).context;
  if (ctx instanceof Response) {
    try { body = await ctx.json(); } catch { /* corps non JSON */ }
  }
  return {
    ok: false,
    code: typeof body.error === 'string' ? body.error : 'unknown',
    detail: typeof body.detail === 'string' ? body.detail : null,
  };
}
