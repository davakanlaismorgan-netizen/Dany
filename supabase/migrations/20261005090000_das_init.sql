/*
# DAS — Schéma initial (remplace les 4 migrations générées par Bolt)

À appliquer sur un projet Supabase vierge : `supabase link` puis `supabase db push`.

## Principes de sécurité
- RLS activée sur toutes les tables ; l'accès est ensuite restreint par GRANT, car la RLS
  seule ne protège pas les colonnes (plan, rôle) ni les opérations non voulues.
- Facturation : les tables `subscriptions` et `payments` sont en LECTURE SEULE pour les
  utilisateurs. Seule la fonction `activate_plan` (service_role, appelée par les edge
  functions) peut les modifier. Un paiement ne peut être consommé qu'une seule fois.
- Le plan n'est plus stocké dans `profiles` : la source de vérité est `subscriptions`,
  lue via `current_plan()` qui tient compte de la date d'expiration.
- Les tables enfants (datasets, pipelines…) vérifient que `project_id` appartient bien
  à l'utilisateur à l'insertion et à la modification.
- Les fonctions SECURITY DEFINER ne sont exécutables que par les rôles qui en ont besoin.
*/

-- =====================================================================
-- 1. TABLES
-- =====================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  company text,
  role text not null default 'analyst',
  preferred_language text not null default 'fr' check (preferred_language in ('fr', 'en')),
  phone text,
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  sector text default 'general',
  status text default 'active',
  config jsonb default '{}'::jsonb,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.datasets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  source_type text default 'csv',
  source_config jsonb default '{}'::jsonb,
  row_count integer default 0,
  column_count integer default 0,
  size_bytes bigint default 0,
  profiling jsonb default '{}'::jsonb,
  status text default 'uploaded',
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text default 'Main Pipeline',
  nodes jsonb default '[]'::jsonb,
  edges jsonb default '[]'::jsonb,
  status text default 'draft',
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.models (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  dataset_id uuid references public.datasets(id) on delete set null,
  name text not null,
  model_type text not null,
  task_type text not null,
  algorithm text,
  metrics jsonb default '{}'::jsonb,
  config jsonb default '{}'::jsonb,
  status text default 'pending',
  feature_importance jsonb default '{}'::jsonb,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.visualizations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  dataset_id uuid references public.datasets(id) on delete set null,
  name text not null,
  chart_type text not null,
  config jsonb default '{}'::jsonb,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  format text default 'pdf',
  config jsonb default '{}'::jsonb,
  status text default 'pending',
  file_url text,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  title text default 'New Conversation',
  messages jsonb default '[]'::jsonb,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  member_email text not null,
  role text default 'viewer',
  status text default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  model_training boolean default true,
  report_generated boolean default true,
  data_quality boolean default true,
  weekly_summary boolean default false,
  team_activity boolean default false,
  channels jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Abonnement courant (une seule ligne par utilisateur). Écriture réservée au serveur.
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'premium', 'enterprise')),
  status text not null default 'active' check (status in ('active', 'canceled', 'past_due')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Historique des paiements. La contrainte d'unicité empêche de réutiliser une transaction.
-- user_id passe à NULL si le compte est supprimé : la trace comptable est conservée.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  provider text not null default 'kkiapay',
  transaction_id text not null,
  plan text not null check (plan in ('premium', 'enterprise')),
  amount integer not null check (amount > 0),
  currency text not null default 'XOF',
  method text,
  created_at timestamptz not null default now(),
  unique (provider, transaction_id)
);

-- =====================================================================
-- 2. INDEX
-- =====================================================================

create index if not exists idx_projects_user_id on public.projects(user_id);
create index if not exists idx_projects_created_at on public.projects(created_at desc);
create index if not exists idx_datasets_user_id on public.datasets(user_id);
create index if not exists idx_datasets_project_id on public.datasets(project_id);
create index if not exists idx_pipelines_user_id on public.pipelines(user_id);
create index if not exists idx_pipelines_project_id on public.pipelines(project_id);
create index if not exists idx_models_user_id on public.models(user_id);
create index if not exists idx_models_project_id on public.models(project_id);
create index if not exists idx_models_dataset_id on public.models(dataset_id);
create index if not exists idx_visualizations_user_id on public.visualizations(user_id);
create index if not exists idx_visualizations_project_id on public.visualizations(project_id);
create index if not exists idx_visualizations_dataset_id on public.visualizations(dataset_id);
create index if not exists idx_reports_user_id on public.reports(user_id);
create index if not exists idx_reports_project_id on public.reports(project_id);
create index if not exists idx_ai_conversations_user_id on public.ai_conversations(user_id);
create index if not exists idx_ai_conversations_updated_at on public.ai_conversations(updated_at desc);
create index if not exists idx_activity_log_user_id on public.activity_log(user_id);
create index if not exists idx_activity_log_created_at on public.activity_log(created_at desc);
create index if not exists idx_team_members_owner_id on public.team_members(owner_id);
create unique index if not exists team_members_owner_email_unique
  on public.team_members(owner_id, lower(member_email));
create index if not exists idx_payments_user_id on public.payments(user_id);

-- =====================================================================
-- 3. PLAN EFFECTIF (source de vérité = subscriptions, avec expiration)
-- =====================================================================

create or replace function public.effective_plan(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case
              when s.plan <> 'free'
               and s.status = 'active'
               and (s.current_period_end is null or s.current_period_end > now())
              then s.plan
              else 'free'
            end
       from public.subscriptions s
      where s.user_id = p_user_id),
    'free'
  );
$$;

-- Plan de l'utilisateur connecté (appelé par le front via supabase.rpc('current_plan')).
create or replace function public.current_plan()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.effective_plan((select auth.uid()));
$$;

-- =====================================================================
-- 4. ACTIVATION D'UN PLAN APRÈS PAIEMENT (appelée uniquement par le serveur)
-- =====================================================================
-- Atomique : enregistre le paiement ET active l'abonnement dans la même transaction.
-- - Même transaction rejouée par le même utilisateur : idempotent (aucune double activation).
-- - Même transaction présentée par un autre utilisateur : refusée (transaction_already_used).
-- - Un renouvellement avant l'échéance prolonge la période en cours au lieu de la raccourcir.

create or replace function public.activate_plan(
  p_user_id uuid,
  p_plan text,
  p_provider text,
  p_transaction_id text,
  p_amount integer,
  p_currency text,
  p_method text,
  p_months integer default 1
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted uuid;
  v_owner uuid;
  v_current_end timestamptz;
  v_end timestamptz;
begin
  if p_plan not in ('premium', 'enterprise') then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if p_months is null or p_months < 1 or p_months > 12 then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'unknown_user' using errcode = 'P0001';
  end if;

  insert into public.payments (user_id, provider, transaction_id, plan, amount, currency, method)
  values (p_user_id, p_provider, p_transaction_id, p_plan, p_amount, p_currency, p_method)
  on conflict (provider, transaction_id) do nothing
  returning id into v_inserted;

  if v_inserted is null then
    select user_id into v_owner
      from public.payments
     where provider = p_provider and transaction_id = p_transaction_id;
    if v_owner is distinct from p_user_id then
      raise exception 'transaction_already_used' using errcode = 'P0001';
    end if;
    select current_period_end into v_end from public.subscriptions where user_id = p_user_id;
    return v_end;
  end if;

  select current_period_end into v_current_end
    from public.subscriptions
   where user_id = p_user_id and status = 'active' and plan = p_plan;

  v_end := greatest(coalesce(v_current_end, now()), now()) + make_interval(months => p_months);

  insert into public.subscriptions (user_id, plan, status, current_period_start, current_period_end)
  values (p_user_id, p_plan, 'active', now(), v_end)
  on conflict (user_id) do update
    set plan = excluded.plan,
        status = 'active',
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end;

  return v_end;
end;
$$;

-- =====================================================================
-- 5. TRIGGERS
-- =====================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'projects', 'datasets', 'pipelines', 'models', 'visualizations',
    'ai_conversations', 'notification_preferences', 'subscriptions'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Création automatique du profil, de l'abonnement gratuit et des préférences à l'inscription.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, company)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 200),
    left(nullif(new.raw_user_meta_data ->> 'company', ''), 200)
  );
  insert into public.subscriptions (user_id) values (new.id);
  insert into public.notification_preferences (user_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Limites du plan gratuit appliquées côté base (et non plus seulement affichées).
-- Limite des lignes : basée sur row_count fourni par le client ; une vraie garantie
-- demandera un comptage côté serveur lors d'une évolution ultérieure.
create or replace function public.enforce_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.effective_plan(new.user_id) <> 'free' then
    return new;
  end if;

  if tg_table_name = 'projects' then
    if (select count(*) from public.projects where user_id = new.user_id) >= 3 then
      raise exception 'plan_limit:projects' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'datasets' then
    if coalesce(new.row_count, 0) > 10000 then
      raise exception 'plan_limit:rows' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'visualizations' then
    if (select count(*) from public.visualizations where user_id = new.user_id) >= 5 then
      raise exception 'plan_limit:visualizations' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_plan_limits on public.projects;
create trigger enforce_plan_limits before insert on public.projects
  for each row execute function public.enforce_plan_limits();

drop trigger if exists enforce_plan_limits on public.datasets;
create trigger enforce_plan_limits before insert or update of row_count on public.datasets
  for each row execute function public.enforce_plan_limits();

drop trigger if exists enforce_plan_limits on public.visualizations;
create trigger enforce_plan_limits before insert on public.visualizations
  for each row execute function public.enforce_plan_limits();

-- =====================================================================
-- 6. DROITS D'ACCÈS (GRANT / REVOKE)
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'projects', 'datasets', 'pipelines', 'models', 'visualizations', 'reports',
    'ai_conversations', 'team_members', 'activity_log', 'notification_preferences',
    'subscriptions', 'payments'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Tables que l'utilisateur gère lui-même (CRUD limité par RLS à ses propres lignes).
grant select, insert, update, delete on
  public.projects, public.datasets, public.pipelines, public.models,
  public.visualizations, public.reports, public.ai_conversations,
  public.team_members, public.notification_preferences
  to authenticated;

-- Profil : lecture, et modification des seules colonnes inoffensives.
-- Pas d'INSERT (créé par trigger) ni de DELETE (supprimé via la suppression du compte).
grant select on public.profiles to authenticated;
grant update (full_name, avatar_url, company, preferred_language, phone, country)
  on public.profiles to authenticated;

-- Journal d'activité : ajout et lecture uniquement (intégrité de l'audit).
grant select, insert on public.activity_log to authenticated;

-- Facturation : lecture seule.
grant select on public.subscriptions, public.payments to authenticated;

-- Fonctions : par défaut exécutables par tout le monde. On restreint explicitement.
revoke all on function public.effective_plan(uuid) from public, anon, authenticated;
revoke all on function public.current_plan() from public, anon;
grant execute on function public.current_plan() to authenticated;
revoke all on function public.activate_plan(uuid, text, text, text, integer, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.activate_plan(uuid, text, text, text, integer, text, text, integer)
  to service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.enforce_plan_limits() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- =====================================================================
-- 7. POLITIQUES RLS
-- =====================================================================

-- Profil
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Facturation (lecture de ses propres lignes)
drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own" on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own" on public.payments for select to authenticated
  using ((select auth.uid()) = user_id);

-- Tables simples : propriétaire uniquement
do $$
declare t text;
begin
  foreach t in array array['projects', 'ai_conversations', 'notification_preferences'] loop
    execute format('drop policy if exists "%1$s_select_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_insert_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_update_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_delete_own" on public.%1$I', t);
    execute format('create policy "%1$s_select_own" on public.%1$I for select to authenticated
                      using ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s_insert_own" on public.%1$I for insert to authenticated
                      with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s_update_own" on public.%1$I for update to authenticated
                      using ((select auth.uid()) = user_id)
                      with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s_delete_own" on public.%1$I for delete to authenticated
                      using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- Tables rattachées à un projet : en plus, le projet référencé doit appartenir à l'utilisateur
do $$
declare t text;
begin
  foreach t in array array['datasets', 'pipelines', 'models', 'visualizations', 'reports'] loop
    execute format('drop policy if exists "%1$s_select_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_insert_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_update_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_delete_own" on public.%1$I', t);
    execute format('create policy "%1$s_select_own" on public.%1$I for select to authenticated
                      using ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s_insert_own" on public.%1$I for insert to authenticated
                      with check (
                        (select auth.uid()) = user_id
                        and exists (select 1 from public.projects p
                                     where p.id = project_id and p.user_id = (select auth.uid())))', t);
    execute format('create policy "%1$s_update_own" on public.%1$I for update to authenticated
                      using ((select auth.uid()) = user_id)
                      with check (
                        (select auth.uid()) = user_id
                        and exists (select 1 from public.projects p
                                     where p.id = project_id and p.user_id = (select auth.uid())))', t);
    execute format('create policy "%1$s_delete_own" on public.%1$I for delete to authenticated
                      using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- Un modèle / une visualisation ne peut référencer qu'un jeu de données de l'utilisateur.
drop policy if exists "models_dataset_owner" on public.models;
create policy "models_dataset_owner" on public.models as restrictive for all to authenticated
  using (true)
  with check (
    dataset_id is null
    or exists (select 1 from public.datasets d
                where d.id = dataset_id and d.user_id = (select auth.uid()))
  );
drop policy if exists "visualizations_dataset_owner" on public.visualizations;
create policy "visualizations_dataset_owner" on public.visualizations as restrictive for all to authenticated
  using (true)
  with check (
    dataset_id is null
    or exists (select 1 from public.datasets d
                where d.id = dataset_id and d.user_id = (select auth.uid()))
  );

-- Journal d'activité : lecture et ajout seulement
drop policy if exists "activity_log_select_own" on public.activity_log;
create policy "activity_log_select_own" on public.activity_log for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "activity_log_insert_own" on public.activity_log;
create policy "activity_log_insert_own" on public.activity_log for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Équipe : le propriétaire gère ; le membre invité voit sa propre invitation.
-- (auth.jwt() et non une sous-requête sur auth.users, inaccessible au rôle authenticated)
drop policy if exists "team_members_select" on public.team_members;
create policy "team_members_select" on public.team_members for select to authenticated
  using (
    (select auth.uid()) = owner_id
    or lower(member_email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );
drop policy if exists "team_members_insert" on public.team_members;
create policy "team_members_insert" on public.team_members for insert to authenticated
  with check ((select auth.uid()) = owner_id);
drop policy if exists "team_members_update" on public.team_members;
create policy "team_members_update" on public.team_members for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "team_members_delete" on public.team_members;
create policy "team_members_delete" on public.team_members for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- =====================================================================
-- 8. STORAGE
-- =====================================================================
-- Limites de taille et de type appliquées par le serveur (et non plus seulement par le navigateur).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('datasets', 'datasets', false, 52428800, null),
  ('avatars',  'avatars',  true,  2097152,  array['image/png', 'image/jpeg', 'image/webp']),
  ('reports',  'reports',  false, 52428800, null)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Chaque utilisateur gère uniquement les fichiers de son dossier « <user_id>/... ».
-- Le bucket public « avatars » est lisible via son URL publique sans politique SELECT anonyme
-- (qui permettrait en plus de lister tous les fichiers).
do $$
declare b text;
begin
  foreach b in array array['datasets', 'avatars', 'reports'] loop
    execute format('drop policy if exists "%s_select_own" on storage.objects', b);
    execute format('drop policy if exists "%s_insert_own" on storage.objects', b);
    execute format('drop policy if exists "%s_update_own" on storage.objects', b);
    execute format('drop policy if exists "%s_delete_own" on storage.objects', b);
    execute format($p$create policy "%1$s_select_own" on storage.objects for select to authenticated
      using (bucket_id = %2$L and (storage.foldername(name))[1] = (select auth.uid())::text)$p$, b, b);
    execute format($p$create policy "%1$s_insert_own" on storage.objects for insert to authenticated
      with check (bucket_id = %2$L and (storage.foldername(name))[1] = (select auth.uid())::text)$p$, b, b);
    execute format($p$create policy "%1$s_update_own" on storage.objects for update to authenticated
      using (bucket_id = %2$L and (storage.foldername(name))[1] = (select auth.uid())::text)
      with check (bucket_id = %2$L and (storage.foldername(name))[1] = (select auth.uid())::text)$p$, b, b);
    execute format($p$create policy "%1$s_delete_own" on storage.objects for delete to authenticated
      using (bucket_id = %2$L and (storage.foldername(name))[1] = (select auth.uid())::text)$p$, b, b);
  end loop;
end $$;
