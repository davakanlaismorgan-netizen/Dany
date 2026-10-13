// Droits de l'utilisateur dans l'espace de travail d'un projet (le sien ou celui d'un propriétaire
// qui l'a invité). Sert uniquement à adapter l'interface : les droits réels sont imposés par la base.
import { createContext, useContext } from 'react';

export type WorkspaceRole = 'owner' | 'editor' | 'viewer';

export interface WorkspaceAccess {
  /** Propriétaire du projet : détermine le dossier de fichiers (<propriétaire>/<projet>/...). */
  ownerId: string | null;
  role: WorkspaceRole;
  canWrite: boolean;
  isOwner: boolean;
}

export function accessFor(ownerId: string, userId: string, workspaceRole: 'editor' | 'viewer' | null): WorkspaceAccess {
  if (ownerId === userId) return { ownerId, role: 'owner', canWrite: true, isOwner: true };
  if (workspaceRole === 'editor') return { ownerId, role: 'editor', canWrite: true, isOwner: false };
  return { ownerId, role: 'viewer', canWrite: false, isOwner: false };
}

// Valeur par défaut (hors page projet) : propriétaire, donc comportement inchangé.
export const WorkspaceContext = createContext<WorkspaceAccess>({
  ownerId: null,
  role: 'owner',
  canWrite: true,
  isOwner: true,
});

export function useWorkspace(): WorkspaceAccess {
  return useContext(WorkspaceContext);
}
