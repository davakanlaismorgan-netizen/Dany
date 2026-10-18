-- Retour arrière de 20261019090000_ai_assistant.sql (à exécuter à la main).
-- Les clés enregistrées et les compteurs sont supprimés ; les conversations existantes sont conservées.
drop function if exists public.claim_ai_usage(uuid, text, integer);
drop function if exists public.release_ai_usage(uuid, text);
drop table if exists public.ai_usage;
drop table if exists public.ai_provider_keys;
alter table public.ai_conversations drop column if exists project_id;
revoke update (title) on public.ai_conversations from authenticated;
grant insert, update on public.ai_conversations to authenticated;
