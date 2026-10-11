// Suppression récursive des fichiers d'un utilisateur dans Supabase Storage.
// (supabase.storage.list ne descend pas dans les sous-dossiers : il faut parcourir l'arbre.)

export interface StorageEntry {
  name: string;
  id: string | null; // null = dossier
}
export interface StorageLike {
  list(
    path: string,
    options: { limit: number; offset: number },
  ): Promise<{ data: StorageEntry[] | null; error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ error: { message: string } | null }>;
}

export async function listAllFiles(bucket: StorageLike, prefix: string, pageSize = 100): Promise<string[]> {
  const files: string[] = [];
  const pending = [prefix];
  while (pending.length > 0) {
    const dir = pending.pop()!;
    for (let offset = 0;; offset += pageSize) {
      const { data, error } = await bucket.list(dir, { limit: pageSize, offset });
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      for (const entry of data) {
        const path = `${dir}/${entry.name}`;
        if (entry.id === null) pending.push(path);
        else files.push(path);
      }
      if (data.length < pageSize) break;
    }
  }
  return files;
}

// Renvoie un message d'erreur, ou null si tout a été supprimé.
export async function removeAllUnder(bucket: StorageLike, prefix: string, pageSize = 100): Promise<string | null> {
  try {
    const files = await listAllFiles(bucket, prefix, pageSize);
    for (let i = 0; i < files.length; i += 100) {
      const { error } = await bucket.remove(files.slice(i, i + 100));
      if (error) return error.message;
    }
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "storage_error";
  }
}
