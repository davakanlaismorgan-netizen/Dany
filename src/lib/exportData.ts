import { supabase } from '@/lib/supabase';

// Tables contenant des données de l'utilisateur. Depuis l'équipe, la RLS laisse aussi lire les projets
// d'un propriétaire qui nous a invité : l'export ne doit contenir QUE les lignes dont on est propriétaire
// (filtre explicite sur user_id), jamais celles d'un autre compte.
export const EXPORT_TABLES = [
  'profiles', 'subscriptions', 'payments', 'projects', 'datasets', 'pipelines', 'models',
  'visualizations', 'reports', 'ai_conversations', 'notification_preferences', 'team_members',
  'activity_log',
] as const;

const PAGE_SIZE = 1000; // limite par requête de l'API

// Tables partageables avec l'équipe : on n'exporte que les lignes dont user_id = soi.
const OWNED_TABLES = new Set(['projects', 'datasets', 'pipelines', 'models', 'visualizations', 'reports']);

export interface DataExport {
  exported_at: string;
  user_id: string;
  tables: Record<string, unknown[]>;
  // Tables qui n'ont pas pu être lues en entier (l'export reste utilisable pour les autres).
  errors: string[];
}

async function readAll(table: string, userId: string): Promise<{ rows: unknown[]; error: string | null }> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const base = supabase.from(table).select('*');
    const { data, error } = await (OWNED_TABLES.has(table) ? base.eq('user_id', userId) : base)
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error: error.message };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return { rows, error: null };
  }
}

export async function collectUserData(userId: string): Promise<DataExport> {
  const results = await Promise.all(EXPORT_TABLES.map(async (table) => ({ table, ...(await readAll(table, userId)) })));
  return {
    exported_at: new Date().toISOString(),
    user_id: userId,
    tables: Object.fromEntries(results.map((r) => [r.table, r.rows])),
    errors: results.filter((r) => r.error).map((r) => `${r.table}: ${r.error}`),
  };
}

export function downloadJson(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
