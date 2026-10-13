-- RETOUR ARRIÈRE de 20261013090000_team_collaboration.sql.
-- À exécuter à la main (SQL Editor de Supabase, ou psql) : ce dossier n'est PAS lu par « supabase db push ».
-- Effet : les membres perdent tout accès (retour au modèle « seul le propriétaire voit ses données »).
-- Les données ne sont pas touchées. Les colonnes ajoutées (member_id, accepted_at, created_by) et les
-- contraintes de team_members restent en place : elles sont inoffensives sans les politiques d'équipe.
-- Pour rétablir l'équipe ensuite : ré-appliquer la migration (elle est rejouable).

begin;

-- 1. Déclencheurs
do $$
declare t text;
begin
  foreach t in array array['datasets', 'pipelines', 'models', 'visualizations', 'reports'] loop
    execute format('drop trigger if exists aa_set_workspace_owner on public.%I', t);
  end loop;
  foreach t in array array['projects', 'datasets', 'pipelines', 'models', 'visualizations', 'reports'] loop
    execute format('drop trigger if exists forbid_owner_change on public.%I', t);
  end loop;
end $$;
drop trigger if exists enforce_team_limit on public.team_members;

-- 2. Politiques d'origine (section 7 « POLITIQUES RLS » et 8 « STORAGE » de la migration initiale).
--    Elles remplacent les politiques d'équipe AVANT la suppression des fonctions qu'elles appellent.
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

-- 3. Droits d'origine sur team_members (la table entière, comme avant la migration d'équipe).
revoke insert (member_email, role), update (role) on public.team_members from authenticated;
grant insert, update on public.team_members to authenticated;

-- 4. Fonctions d'équipe (plus aucune politique ni déclencheur ne les utilise).
drop function if exists public.workspace_role_text(text);
drop function if exists public.can_write_workspace(uuid);
drop function if exists public.can_read_workspace(uuid);
drop function if exists public.workspace_role(uuid);
drop function if exists public.my_invitations();
drop function if exists public.accept_team_invitation(uuid);
drop function if exists public.decline_team_invitation(uuid);
drop function if exists public.my_workspaces();
drop function if exists public.aa_set_workspace_owner();
drop function if exists public.forbid_owner_change();
drop function if exists public.enforce_team_limit();

commit;
