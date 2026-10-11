import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  pages: [] as { name: string; id: string | null }[][],
  removed: [] as string[][],
  listError: null as { message: string } | null,
  removeError: null as { message: string } | null,
  lastFolder: '',
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        list: (folder: string) => {
          h.lastFolder = folder;
          return Promise.resolve({ data: h.pages.shift() ?? [], error: h.listError });
        },
        remove: (paths: string[]) => { h.removed.push(paths); return Promise.resolve({ error: h.removeError }); },
      }),
    },
  },
}));

import { removeProjectFiles } from '@/lib/projectCleanup';

beforeEach(() => { h.pages = []; h.removed = []; h.listError = null; h.removeError = null; });

describe('removeProjectFiles', () => {
  it('supprime tous les fichiers du dossier utilisateur/projet, page après page', async () => {
    h.pages = [[{ name: 'a.csv', id: '1' }, { name: 'b.csv', id: '2' }], [{ name: 'c.csv', id: '3' }], []];
    expect(await removeProjectFiles('u1', 'p1')).toBe(3);
    expect(h.lastFolder).toBe('u1/p1');
    expect(h.removed).toEqual([['u1/p1/a.csv', 'u1/p1/b.csv'], ['u1/p1/c.csv']]);
  });
  it('rien à supprimer : 0', async () => {
    expect(await removeProjectFiles('u1', 'p1')).toBe(0);
    expect(h.removed).toEqual([]);
  });
  it('erreur de lecture ou de suppression : propagée (le projet ne doit pas être supprimé)', async () => {
    h.listError = { message: 'boom' };
    await expect(removeProjectFiles('u1', 'p1')).rejects.toMatchObject({ message: 'boom' });
    h.listError = null; h.pages = [[{ name: 'a', id: '1' }]]; h.removeError = { message: 'nope' };
    await expect(removeProjectFiles('u1', 'p1')).rejects.toMatchObject({ message: 'nope' });
  });
});
