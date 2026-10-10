import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/report';

export type ActivityAction = 'project.created' | 'dataset.imported' | 'dataset.deleted' | 'visualization.saved';

// Journal d'activité (lecture/ajout seuls côté base). Un échec ne doit jamais bloquer l'action
// de l'utilisateur, mais il est signalé via reportError, jamais avalé.
export async function logActivity(action: ActivityAction, entityType: string, entityId?: string, metadata?: Record<string, unknown>) {
  try {
    const { error } = await supabase.from('activity_log').insert({
      action, entity_type: entityType, entity_id: entityId ?? null, metadata: metadata ?? {},
    });
    if (error) throw error;
  } catch (err) {
    reportError(err, { where: 'logActivity', action });
  }
}

// Regroupe des dates ISO par jour sur les `days` derniers jours (le plus ancien d'abord).
export function countByDay(isoDates: string[], days: number, now = new Date()): { day: string; count: number }[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    keys.push(d.toISOString().slice(0, 10));
  }
  const counts = new Map(keys.map((k) => [k, 0]));
  for (const iso of isoDates) {
    const k = new Date(iso).toISOString().slice(0, 10);
    if (counts.has(k)) counts.set(k, counts.get(k)! + 1);
  }
  return keys.map((day) => ({ day: day.slice(5), count: counts.get(day)! }));
}
