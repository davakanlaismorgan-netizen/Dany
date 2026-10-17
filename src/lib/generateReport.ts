import { supabase } from '@/lib/supabase';

export type ReportTemplate = 'exec' | 'detailed' | 'data';
export const REPORT_ERROR_CODES = ['invalid_request', 'not_found', 'unauthorized', 'rate_limited', 'server_error'];
// Tout code inconnu → message générique (pas de clé de traduction manquante).
export const reportErrorCode = (code: string): string => (REPORT_ERROR_CODES.includes(code) ? code : 'unknown');

export type GenerateReportResult =
  | { ok: true; reportId: string; branding: 'das' | 'custom'; brandNameMissing: boolean }
  | { ok: false; code: string };

// Le fichier est produit par le serveur à partir des données réelles du projet. La marque (DAS ou celle du client)
// est décidée par le serveur d'après le plan effectif du propriétaire : le navigateur ne peut pas la demander.
export async function generateReport(projectId: string, template: ReportTemplate, lang: 'fr' | 'en'): Promise<GenerateReportResult> {
  const { data, error } = await supabase.functions.invoke('generate-report', {
    body: { project_id: projectId, template, lang },
  });
  if (!error) {
    const d = (data ?? {}) as { report_id?: string; branding?: string; brand_name_missing?: boolean };
    return { ok: true, reportId: d.report_id ?? '', branding: d.branding === 'custom' ? 'custom' : 'das', brandNameMissing: d.brand_name_missing === true };
  }
  let body: { error?: unknown } = {};
  const ctx = (error as { context?: unknown }).context;
  if (ctx instanceof Response) {
    try { body = await ctx.json(); } catch { /* corps non JSON */ }
  }
  return { ok: false, code: typeof body.error === 'string' ? body.error : 'unknown' };
}
