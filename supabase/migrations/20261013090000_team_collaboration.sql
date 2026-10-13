-- Collaboration d'équipe (PR 1).
--
-- Modèle : l'équipe est rattachée au COMPTE du propriétaire (Premium ou Entreprise).
--   - viewer : lit les projets, jeux de données, pipelines, modèles, visualisations, rapports et fichiers
--   - editor : en plus, modifie/ajoute du contenu dans les projets EXISTANTS du propriétaire
--   - seul le propriétaire crée/renomme/supprime un projet, gère l'équipe, la facturation et le compte
-- Les lignes gardent le propriétaire comme user_id ; created_by garde la trace de l'auteur réel.
-- Si le plan du propriétaire n'est plus actif, les membres perdent l'accès (données conservées).
--
-- Non destructive : colonnes ajoutées, fonctions ajoutées, politiques remplacées.
-- Retour arrière : voir docs/EQUIPE.md.

-- =====================================================================
-- 1. TABLE team_members : lien vers le compte du membre, contraintes
-- =====================================================================

alter table public.team_members
  add column if not exists member_id uuid references auth.users(id) on delete cascade,
  add column if not exists accepted_at timestamptz;

-- Nettoyage de valeurs libres éventuellement écrites avant cette migration.
update public.team_members set role = 'viewer' where role is null or role not in ('viewer', 'editor');
update public.team_members set status = 'pending', member_id = null
 where status is null or status not in ('pending', 'accepted') or (status = 'accepted' and member_id is null);

alter table public.team_members
  alter column role set not null,
  alter column status set not null;

alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members add constraint team_members_role_check check (role in ('viewer', 'editor'));
alter table public.team_members drop constraint if exists team_members_status_check;
alter table public.team_members add constraint team_members_status_check check (status in ('pending', 'accepted'));
alter table public.team_members drop constraint if exists team_members_accepted_has_member;
alter table public.team_members add constraint team_members_accepted_has_member
  check (status = 'pending' or member_id is not null);
alter table public.team_members drop constraint if exists team_members_email_check;
alter table public.team_members add constraint team_members_email_check
  check (length(member_email) <= 254 and member_email ~* '^[^@[:space:]]+@[^@[:space:]]+$') not valid;

create unique index if not exists team_members_owner_member_unique
  on public.team_members(owner_id, member_id) where member_id is not null;
create index if not exists idx_team_members_member_id on public.team_members(member_id);

-- =====================================================================
-- 2. AUTEUR RÉEL DES LIGNES (created_by) sur les tables rattachées à un projet
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array['datasets', 'pipelines', 'models', 'visualizations', 'reports'] loop
    execute format(
      'alter table public.%I add column if not exists created_by uuid references auth.users(id) on delete set null', t);
  end loop;
end $$;

-- =====================================================================
-- 3. RÔLE DANS L'ESPACE D'UN PROPRIÉTAIRE
-- =====================================================================
-- Renvoie 'owner' (c'est moi), 'editor' / 'viewer' (membre accepté d'un propriétaire dont le plan
-- est actif), ou NULL. Fonctions security definer : elles lisent team_members et l'abonnement
-- sans exposer ces tables, et ne révèlent que le rôle de l'appelant lui-même.

create or replace function public.workspace_role(p_owner uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when (select auth.uid()) is null then null
    when p_owner = (select auth.uid()) then 'owner'
    else (
      select tm.role
        from public.team_members tm
       where tm.owner_id = p_owner
         and tm.member_id = (select auth.uid())
         and tm.status = 'accepted'
         and public.effective_plan(p_owner) <> 'free'
       limit 1
    )
  end;
$$;

create or replace function public.can_read_workspace(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.workspace_role(p_owner) is not null;
$$;

create or replace function public.can_write_workspace(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.workspace_role(p_owner) in ('owner', 'editor'), false);
$$;

-- Variante pour les chemins de fichiers (dossier = texte, pas forcément un UUID valide).
create or replace function public.workspace_role_text(p_owner text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_owner ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.workspace_role(p_owner::uuid)
  end;
$$;

-- =====================================================================
-- 4. DÉCLENCHEURS
-- =====================================================================

-- À l'insertion dans un projet, la ligne appartient au propriétaire du PROJET (même si c'est un
-- éditeur qui l'ajoute) ; l'auteur réel est enregistré. S'exécute avant enforce_plan_limits
-- (ordre alphabétique des déclencheurs) pour que les limites s'appliquent au bon compte.
create or replace function public.aa_set_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_owner uuid;
begin
  if (select auth.uid()) is null then
    return new; -- service_role / maintenance : valeurs fournies telles quelles
  end if;
  select p.user_id into v_owner from public.projects p where p.id = new.project_id;
  if v_owner is not null then
    new.user_id := v_owner;
  end if;
  new.created_by := (select auth.uid());
  return new;
end;
$$;

-- Le propriétaire d'une ligne ne change jamais (empêche de déplacer du contenu d'un espace de
-- travail à un autre) et l'auteur non plus, sauf mise à NULL par le serveur lors de la
-- suppression du compte de l'auteur (ON DELETE SET NULL s'exécute sans utilisateur connecté).
create or replace function public.forbid_owner_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_old jsonb := to_jsonb(old) -> 'created_by';
  v_new jsonb := to_jsonb(new) -> 'created_by';
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'owner_immutable' using errcode = 'P0001';
  end if;
  if v_new is distinct from v_old
     and not (v_new = 'null'::jsonb and (select auth.uid()) is null) then
    raise exception 'owner_immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Équipe : 10 invitations (en attente + acceptées) maximum en Premium, illimité en Entreprise.
create or replace function public.enforce_team_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.effective_plan(new.owner_id) = 'enterprise' then
    return new;
  end if;
  if (select count(*) from public.team_members where owner_id = new.owner_id) >= 10 then
    raise exception 'team_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['datasets', 'pipelines', 'models', 'visualizations', 'reports'] loop
    execute format('drop trigger if exists aa_set_workspace_owner on public.%I', t);
    execute format(
      'create trigger aa_set_workspace_owner before insert on public.%I
         for each row execute function public.aa_set_workspace_owner()', t);
  end loop;
  foreach t in array array['projects', 'datasets', 'pipelines', 'models', 'visualizations', 'reports'] loop
    execute format('drop trigger if exists forbid_owner_change on public.%I', t);
    execute format(
      'create trigger forbid_owner_change before update on public.%I
         for each row execute function public.forbid_owner_change()', t);
  end loop;
end $$;

drop trigger if exists enforce_team_limit on public.team_members;
create trigger enforce_team_limit before insert on public.team_members
  for each row execute function public.enforce_team_limit();

-- =====================================================================
-- 5. INVITATIONS : acceptation, refus, listes (le client n'écrit jamais status / member_id)
-- =====================================================================

create or replace function public.my_invitations()
returns table (id uuid, owner_name text, owner_email text, role text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select tm.id, p.full_name, p.email, tm.role, tm.created_at
    from public.team_members tm
    join public.profiles p on p.id = tm.owner_id
    join auth.users u on u.id = (select auth.uid())
   where tm.status = 'pending'
     and u.email_confirmed_at is not null
     and lower(tm.member_email) = lower(u.email)
   order by tm.created_at desc;
$$;

create or replace function public.accept_team_invitation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_confirmed timestamptz;
  v_updated int;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  select u.email, u.email_confirmed_at into v_email, v_confirmed from auth.users u where u.id = v_uid;
  -- Sans e-mail confirmé, n'importe qui pourrait créer un compte avec l'adresse d'un invité.
  if v_confirmed is null then
    raise exception 'email_not_confirmed' using errcode = 'P0001';
  end if;
  begin
    update public.team_members
       set member_id = v_uid, status = 'accepted', accepted_at = now()
     where id = p_id
       and status = 'pending'
       and lower(member_email) = lower(v_email)
       and owner_id <> v_uid;
    get diagnostics v_updated = row_count;
  exception when unique_violation then
    raise exception 'already_member' using errcode = 'P0001';
  end;
  if v_updated = 0 then
    raise exception 'invitation_not_found' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.decline_team_invitation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_deleted int;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  select u.email into v_email from auth.users u where u.id = v_uid and u.email_confirmed_at is not null;
  delete from public.team_members
   where id = p_id and status = 'pending' and lower(member_email) = lower(coalesce(v_email, ''));
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'invitation_not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- Espaces auxquels j'ai accès (équipes que j'ai rejointes, plan du propriétaire actif).
create or replace function public.my_workspaces()
returns table (owner_id uuid, owner_name text, owner_email text, role text)
language sql
stable
security definer
set search_path = public
as $$
  select tm.owner_id, p.full_name, p.email, tm.role
    from public.team_members tm
    join public.profiles p on p.id = tm.owner_id
   where tm.member_id = (select auth.uid())
     and tm.status = 'accepted'
     and public.effective_plan(tm.owner_id) <> 'free'
   order by p.full_name;
$$;

-- =====================================================================
-- 6. DROITS D'ACCÈS
-- =====================================================================

revoke all on function
  public.workspace_role(uuid), public.can_read_workspace(uuid), public.can_write_workspace(uuid),
  public.workspace_role_text(text), public.my_invitations(), public.accept_team_invitation(uuid),
  public.decline_team_invitation(uuid), public.my_workspaces(),
  public.aa_set_workspace_owner(), public.forbid_owner_change(), public.enforce_team_limit()
  from public, anon, authenticated;

grant execute on function
  public.workspace_role(uuid), public.can_read_workspace(uuid), public.can_write_workspace(uuid),
  public.workspace_role_text(text), public.my_invitations(), public.accept_team_invitation(uuid),
  public.decline_team_invitation(uuid), public.my_workspaces()
  to authenticated;

-- team_members : le client écrit seulement l'e-mail et le rôle ; status / member_id / accepted_at
-- ne changent que par les fonctions ci-dessus.
revoke insert, update on public.team_members from authenticated;
grant insert (member_email, role) on public.team_members to authenticated;
grant update (role) on public.team_members to authenticated;

-- =====================================================================
-- 7. POLITIQUES RLS
-- =====================================================================

-- Équipe : le propriétaire gère (Premium/Entreprise uniquement) ; le membre voit et peut
-- quitter sa propre ligne. Un compte non confirmé ne voit ses invitations qu'à travers
-- my_invitations() (qui exige l'e-mail confirmé).
drop policy if exists "team_members_select" on public.team_members;
create policy "team_members_select" on public.team_members for select to authenticated
  using ((select auth.uid()) = owner_id or (select auth.uid()) = member_id);

drop policy if exists "team_members_insert" on public.team_members;
create policy "team_members_insert" on public.team_members for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and public.current_plan() <> 'free'
    and lower(member_email) <> lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );

drop policy if exists "team_members_update" on public.team_members;
create policy "team_members_update" on public.team_members for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

drop policy if exists "team_members_delete" on public.team_members;
create policy "team_members_delete" on public.team_members for delete to authenticated
  using ((select auth.uid()) = owner_id or (select auth.uid()) = member_id);

-- Projets : lecture pour l'équipe ; écriture réservée au propriétaire (politiques existantes).
drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own" on public.projects for select to authenticated
  using ((select auth.uid()) = user_id or public.can_read_workspace(user_id));

-- Contenu des projets : lecture pour l'équipe ; écriture pour le propriétaire et les éditeurs,
-- à condition que le projet référencé appartienne au même propriétaire que la ligne.
do $$
declare t text;
begin
  foreach t in array array['datasets', 'pipelines', 'models', 'visualizations', 'reports'] loop
    execute format('drop policy if exists "%1$s_select_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_insert_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_update_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_delete_own" on public.%1$I', t);
    execute format('create policy "%1$s_select_own" on public.%1$I for select to authenticated
                      using ((select auth.uid()) = user_id or public.can_read_workspace(user_id))', t);
    execute format('create policy "%1$s_insert_own" on public.%1$I for insert to authenticated
                      with check (
                        public.can_write_workspace(user_id)
                        and exists (select 1 from public.projects p
                                     where p.id = project_id and p.user_id = %1$I.user_id))', t);
    execute format('create policy "%1$s_update_own" on public.%1$I for update to authenticated
                      using (public.can_write_workspace(user_id))
                      with check (
                        public.can_write_workspace(user_id)
                        and exists (select 1 from public.projects p
                                     where p.id = project_id and p.user_id = %1$I.user_id))', t);
    execute format('create policy "%1$s_delete_own" on public.%1$I for delete to authenticated
                      using (public.can_write_workspace(user_id))', t);
  end loop;
end $$;

-- Un modèle / une visualisation ne référence qu'un jeu de données du MÊME espace de travail.
drop policy if exists "models_dataset_owner" on public.models;
create policy "models_dataset_owner" on public.models as restrictive for all to authenticated
  using (true)
  with check (
    dataset_id is null
    or exists (select 1 from public.datasets d
                where d.id = dataset_id and d.user_id = models.user_id)
  );
drop policy if exists "visualizations_dataset_owner" on public.visualizations;
create policy "visualizations_dataset_owner" on public.visualizations as restrictive for all to authenticated
  using (true)
  with check (
    dataset_id is null
    or exists (select 1 from public.datasets d
                where d.id = dataset_id and d.user_id = visualizations.user_id)
  );

-- Fichiers : dossier « <id du propriétaire>/... ». Lecture pour l'équipe, écriture pour les
-- éditeurs. Le bucket public « avatars » reste réservé à chaque utilisateur.
do $$
declare b text;
begin
  foreach b in array array['datasets', 'reports'] loop
    execute format('drop policy if exists "%s_select_own" on storage.objects', b);
    execute format('drop policy if exists "%s_insert_own" on storage.objects', b);
    execute format('drop policy if exists "%s_update_own" on storage.objects', b);
    execute format('drop policy if exists "%s_delete_own" on storage.objects', b);
    execute format($p$create policy "%1$s_select_own" on storage.objects for select to authenticated
      using (bucket_id = %2$L and (
        (storage.foldername(name))[1] = (select auth.uid())::text
        or public.workspace_role_text((storage.foldername(name))[1]) is not null))$p$, b, b);
    execute format($p$create policy "%1$s_insert_own" on storage.objects for insert to authenticated
      with check (bucket_id = %2$L and (
        (storage.foldername(name))[1] = (select auth.uid())::text
        or public.workspace_role_text((storage.foldername(name))[1]) = 'editor'))$p$, b, b);
    execute format($p$create policy "%1$s_update_own" on storage.objects for update to authenticated
      using (bucket_id = %2$L and (
        (storage.foldername(name))[1] = (select auth.uid())::text
        or public.workspace_role_text((storage.foldername(name))[1]) = 'editor'))
      with check (bucket_id = %2$L and (
        (storage.foldername(name))[1] = (select auth.uid())::text
        or public.workspace_role_text((storage.foldername(name))[1]) = 'editor'))$p$, b, b);
    execute format($p$create policy "%1$s_delete_own" on storage.objects for delete to authenticated
      using (bucket_id = %2$L and (
        (storage.foldername(name))[1] = (select auth.uid())::text
        or public.workspace_role_text((storage.foldername(name))[1]) = 'editor'))$p$, b, b);
  end loop;
end $$;
