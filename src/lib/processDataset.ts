import { supabase } from '@/lib/supabase';

export type ProcessErrorCode =
  | 'plan_limit_rows' | 'empty' | 'invalid_json' | 'too_many_rows' | 'too_many_columns'
  | 'unsupported' | 'file_missing' | 'file_too_large' | 'unauthorized' | 'unknown';

export type ProcessResult =
  | { ok: true; rowCount: number; columnCount: number }
  | { ok: false; code: ProcessErrorCode };

const KNOWN: ProcessErrorCode[] = [
  'plan_limit_rows', 'empty', 'invalid_json', 'too_many_rows', 'too_many_columns',
  'unsupported', 'file_missing', 'file_too_large', 'unauthorized',
];

export function toProcessCode(v: unknown): ProcessErrorCode {
  return KNOWN.includes(v as ProcessErrorCode) ? (v as ProcessErrorCode) : 'unknown';
}

// Le serveur (edge function process-dataset) lit le fichier stocké et enregistre lui-même
// nombre de lignes, colonnes et profil : le client n'a aucun moyen de les fixer.
export async function processDataset(datasetId: string): Promise<ProcessResult> {
  const { data, error } = await supabase.functions.invoke('process-dataset', { body: { dataset_id: datasetId } });
  if (!error) {
    const d = data as { row_count?: number; column_count?: number } | null;
    return { ok: true, rowCount: d?.row_count ?? 0, columnCount: d?.column_count ?? 0 };
  }
  let code: unknown;
  const ctx = (error as { context?: unknown }).context;
  if (ctx instanceof Response) {
    try {
      code = (await ctx.json())?.error;
    } catch { /* corps non JSON : code inconnu */ }
  }
  return { ok: false, code: toProcessCode(code) };
}
