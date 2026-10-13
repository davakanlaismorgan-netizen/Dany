// Collaboration d'équipe : appels à Supabase et traduction des erreurs.
// La sécurité est appliquée par la base (RLS + fonctions SQL, voir la migration
// 20261013090000_team_collaboration.sql) : ce fichier ne décide d'aucun droit.
import { supabase } from '@/lib/supabase';

export type TeamRole = 'viewer' | 'editor';

export interface TeamMember {
  id: string;
  member_email: string;
  role: TeamRole;
  status: 'pending' | 'accepted';
  created_at: string;
}
export interface Invitation {
  id: string;
  owner_name: string | null;
  owner_email: string | null;
  role: TeamRole;
  created_at: string;
}
export interface Workspace {
  owner_id: string;
  owner_name: string | null;
  owner_email: string | null;
  role: TeamRole;
}

// Doit rester identique à enforce_team_limit() dans la migration (Entreprise : illimité).
export const MAX_TEAM_PREMIUM = 10;

export function isValidEmail(value: string): boolean {
  const v = value.trim();
  return v.length <= 254 && /^[^@\s]+@[^@\s]+$/.test(v);
}

// Traduit une erreur Supabase en clé i18n `team.err.*` (jamais de message technique à l'écran).
export function teamErrorKey(err: unknown): string {
  const message =
    typeof err === 'object' && err !== null && 'message' in err ? String((err as { message: unknown }).message) : '';
  if (message.includes('team_limit')) return 'team.err.limit';
  if (message.includes('duplicate key')) return 'team.err.duplicate';
  if (message.includes('email_check')) return 'team.err.invalid_email';
  if (message.includes('email_not_confirmed')) return 'team.err.email_not_confirmed';
  if (message.includes('invitation_not_found')) return 'team.err.invitation_not_found';
  if (message.includes('already_member')) return 'team.err.already_member';
  if (message.includes('row-level security')) return 'team.err.plan';
  return 'team.err.unknown';
}

export async function listMembers(ownerId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('id, member_email, role, status, created_at')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TeamMember[];
}

export async function inviteMember(email: string, role: TeamRole): Promise<void> {
  const { error } = await supabase.from('team_members').insert({ member_email: email.trim().toLowerCase(), role });
  if (error) throw error;
}

export async function updateMemberRole(id: string, role: TeamRole): Promise<void> {
  const { error } = await supabase.from('team_members').update({ role }).eq('id', id);
  if (error) throw error;
}

export async function removeMember(id: string): Promise<void> {
  const { error } = await supabase.from('team_members').delete().eq('id', id);
  if (error) throw error;
}

// Un membre quitte l'équipe d'un propriétaire (la base n'autorise que sa propre ligne).
export async function leaveTeam(ownerId: string, memberId: string): Promise<void> {
  const { error } = await supabase.from('team_members').delete().eq('owner_id', ownerId).eq('member_id', memberId);
  if (error) throw error;
}

export async function listInvitations(): Promise<Invitation[]> {
  const { data, error } = await supabase.rpc('my_invitations');
  if (error) throw error;
  return (data ?? []) as Invitation[];
}

export async function acceptInvitation(id: string): Promise<void> {
  const { error } = await supabase.rpc('accept_team_invitation', { p_id: id });
  if (error) throw error;
}

export async function declineInvitation(id: string): Promise<void> {
  const { error } = await supabase.rpc('decline_team_invitation', { p_id: id });
  if (error) throw error;
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const { data, error } = await supabase.rpc('my_workspaces');
  if (error) throw error;
  return (data ?? []) as Workspace[];
}
