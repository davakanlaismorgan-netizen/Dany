import { supabase } from '@/lib/supabase';

// Codes d'erreur ayant un message traduit (pipeline.err.<code>) ; tout autre code → message générique.
export const PIPELINE_ERROR_CODES = [
  'invalid_graph', 'too_many_nodes', 'unknown_node_type', 'cycle', 'no_output', 'dangling_node', 'wrong_inputs',
  'invalid_config', 'column_not_found', 'not_numeric', 'too_many_rows', 'too_many_columns', 'source_not_found',
  'empty_result', 'plan_limit_rows', 'server_error', 'not_found', 'unauthorized', 'empty', 'invalid_json', 'unsupported',
];
export const pipelineErrorCode = (code: string): string => (PIPELINE_ERROR_CODES.includes(code) ? code : 'unknown');

export interface PipelineStep { node_id: string; type: string; rows_out: number }
export type PipelineRunResult =
  | { ok: true; datasetId: string; rowCount: number; columnCount: number; steps: PipelineStep[] }
  | { ok: false; code: string; nodeId: string | null; detail: string | null };

// Le serveur exécute le pipeline ENREGISTRÉ (jamais un graphe envoyé par le navigateur) sur les
// fichiers réellement stockés, puis enregistre le résultat comme nouveau jeu de données.
export async function runPipeline(pipelineId: string): Promise<PipelineRunResult> {
  const { data, error } = await supabase.functions.invoke('run-pipeline', { body: { pipeline_id: pipelineId } });
  if (!error) {
    const d = (data ?? {}) as { dataset_id?: string; row_count?: number; column_count?: number; steps?: PipelineStep[] };
    return { ok: true, datasetId: d.dataset_id ?? '', rowCount: d.row_count ?? 0, columnCount: d.column_count ?? 0, steps: d.steps ?? [] };
  }
  let body: { error?: unknown; node_id?: unknown; detail?: unknown } = {};
  const ctx = (error as { context?: unknown }).context;
  if (ctx instanceof Response) {
    try { body = await ctx.json(); } catch { /* corps non JSON : erreur inconnue */ }
  }
  return {
    ok: false,
    code: typeof body.error === 'string' ? body.error : 'unknown',
    nodeId: typeof body.node_id === 'string' ? body.node_id : null,
    detail: typeof body.detail === 'string' ? body.detail : null,
  };
}
