-- RETOUR ARRIÈRE de 20261018100000_invitation_email.sql.
-- À exécuter à la main (SQL Editor de Supabase, ou psql) : ce dossier n'est PAS lu par « supabase db push ».
-- Effet : supprime le suivi des envois d'e-mails d'invitation (les invitations elles-mêmes ne sont pas touchées).

drop function if exists public.claim_invitation_email(uuid, integer, integer);
drop function if exists public.release_invitation_email(uuid, timestamptz);
alter table public.team_members drop column if exists invite_emailed_at, drop column if exists invite_email_count;
