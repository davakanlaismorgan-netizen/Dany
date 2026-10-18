-- E-mail d'invitation d'équipe : suivi des envois, pour limiter les renvois.
-- Seul le SERVEUR (edge function notify-invitation, rôle service_role) lit et écrit ces colonnes :
-- le client n'a de droit d'écriture que sur member_email et role (voir 20261013090000_team_collaboration.sql).
--
-- Principe « réserver puis envoyer » : claim_invitation_email() réserve l'envoi dans une seule instruction verrouillée
-- (deux clics simultanés ne peuvent pas envoyer deux e-mails) ; si le fournisseur échoue, release_invitation_email()
-- rend la réservation pour que l'utilisateur puisse réessayer.

alter table public.team_members
  add column if not exists invite_emailed_at timestamptz,
  add column if not exists invite_email_count integer not null default 0;

grant select, update on public.team_members to service_role;

create or replace function public.claim_invitation_email(p_id uuid, p_cooldown_seconds integer, p_max integer)
returns table (claimed boolean, prev_at timestamptz, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.team_members%rowtype;
begin
  select * into v from public.team_members where id = p_id for update;
  if not found or v.status <> 'pending' then
    return query select false, null::timestamptz, 'not_pending'::text;
    return;
  end if;
  if v.invite_email_count >= p_max then
    return query select false, v.invite_emailed_at, 'max_sent'::text;
    return;
  end if;
  if v.invite_emailed_at is not null and v.invite_emailed_at > now() - make_interval(secs => p_cooldown_seconds) then
    return query select false, v.invite_emailed_at, 'too_soon'::text;
    return;
  end if;
  update public.team_members
     set invite_emailed_at = now(), invite_email_count = invite_email_count + 1
   where id = p_id;
  return query select true, v.invite_emailed_at, null::text;
end $$;

create or replace function public.release_invitation_email(p_id uuid, p_prev_at timestamptz)
returns void
language sql
security definer
set search_path = public
as $$
  update public.team_members
     set invite_emailed_at = p_prev_at, invite_email_count = greatest(invite_email_count - 1, 0)
   where id = p_id;
$$;

revoke all on function public.claim_invitation_email(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.release_invitation_email(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_invitation_email(uuid, integer, integer) to service_role;
grant execute on function public.release_invitation_email(uuid, timestamptz) to service_role;
