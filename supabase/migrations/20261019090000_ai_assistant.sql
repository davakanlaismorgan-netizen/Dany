/*
  Assistant IA réel (PR 5).

  - ai_provider_keys : clé API LLM de l'utilisateur, CHIFFRÉE côté serveur (AES-GCM, secret AI_KEY_ENCRYPTION_SECRET).
    Le client ne peut lire que le fournisseur et les 4 derniers caractères ; il ne peut jamais lire le texte chiffré.
  - ai_usage : compteur par utilisateur, par jour et par type ('message' = messages à l'assistant,
    'key' = enregistrements de clé, limités pour qu'on ne puisse pas tester des clés volées en série).
    claim_ai_usage / release_ai_usage : réservation atomique, réservées à service_role.
  - ai_conversations : écrite par le serveur uniquement (l'historique envoyé au LLM vient de la base,
    jamais du navigateur). Le client peut lire, renommer et supprimer ses conversations.
  Non destructif ; retour arrière : supabase/rollback/20261019090000_ai_assistant.down.sql
*/

-- =====================================================================
-- 1. CLÉS LLM (chiffrées)
-- =====================================================================
create table if not exists public.ai_provider_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'openai')),
  ciphertext text not null,
  key_last4 text not null check (char_length(key_last4) between 1 and 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ai_provider_keys enable row level security;
revoke all on public.ai_provider_keys from anon, authenticated;
-- Colonnes non secrètes seulement ; jamais ciphertext.
grant select (user_id, provider, key_last4, updated_at) on public.ai_provider_keys to authenticated;
grant delete on public.ai_provider_keys to authenticated;
grant select, insert, update, delete on public.ai_provider_keys to service_role;

drop policy if exists "ai_provider_keys_select_own" on public.ai_provider_keys;
create policy "ai_provider_keys_select_own" on public.ai_provider_keys for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "ai_provider_keys_delete_own" on public.ai_provider_keys;
create policy "ai_provider_keys_delete_own" on public.ai_provider_keys for delete to authenticated
  using ((select auth.uid()) = user_id);

-- =====================================================================
-- 2. COMPTEURS D'USAGE
-- =====================================================================
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('message', 'key')),
  used integer not null default 0 check (used >= 0),
  primary key (user_id, day, kind)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
grant select, insert, update, delete on public.ai_usage to service_role;

-- Réserve une unité si la limite du jour n'est pas atteinte. Atomique (une seule instruction).
create or replace function public.claim_ai_usage(p_user uuid, p_kind text, p_limit integer)
returns table (allowed boolean, used integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  if p_kind not in ('message', 'key') or p_limit < 1 then
    raise exception 'invalid_request';
  end if;
  insert into public.ai_usage as u (user_id, day, kind, used)
  values (p_user, (now() at time zone 'utc')::date, p_kind, 1)
  on conflict (user_id, day, kind) do update set used = u.used + 1
    where u.used < p_limit
  returning u.used into v_used;
  if v_used is null then
    select u.used into v_used from public.ai_usage u
     where u.user_id = p_user and u.day = (now() at time zone 'utc')::date and u.kind = p_kind;
    return query select false, coalesce(v_used, 0);
  else
    return query select true, v_used;
  end if;
end;
$$;

-- Rend une unité (le fournisseur LLM a échoué : l'utilisateur ne doit pas perdre un message).
create or replace function public.release_ai_usage(p_user uuid, p_kind text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_usage
     set used = greatest(used - 1, 0)
   where user_id = p_user and day = (now() at time zone 'utc')::date and kind = p_kind;
$$;

revoke all on function public.claim_ai_usage(uuid, text, integer), public.release_ai_usage(uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_ai_usage(uuid, text, integer), public.release_ai_usage(uuid, text)
  to service_role;

-- =====================================================================
-- 3. CONVERSATIONS : écrites par le serveur
-- =====================================================================
alter table public.ai_conversations
  add column if not exists project_id uuid references public.projects(id) on delete set null;

revoke insert, update on public.ai_conversations from authenticated;
grant update (title) on public.ai_conversations to authenticated;
grant select, insert, update, delete on public.ai_conversations to service_role;
