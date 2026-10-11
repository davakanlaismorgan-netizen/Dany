import { supabase } from '@/lib/supabase';

// Supprime les fichiers d'un projet dans Storage (dossier <user>/<projet>/). Sans cela, les fichiers
// restent orphelins (et facturés) après la suppression du projet. Lève une erreur en cas d'échec :
// l'appelant ne supprime alors pas le projet, et l'opération peut être relancée.
export async function removeProjectFiles(userId: string, projectId: string): Promise<number> {
  const folder = `${userId}/${projectId}`;
  let removed = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from('datasets').list(folder, { limit: 100 });
    if (error) throw error;
    const files = (data ?? []).filter((f) => f.id !== null).map((f) => `${folder}/${f.name}`);
    if (files.length === 0) return removed;
    const { error: rmError } = await supabase.storage.from('datasets').remove(files);
    if (rmError) throw rmError;
    removed += files.length;
  }
}
