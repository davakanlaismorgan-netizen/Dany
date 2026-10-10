-- Tests de sécurité de la base. Tout s'exécute dans une transaction annulée à la fin :
-- aucune donnée n'est conservée. Échoue (code de sortie ≠ 0) si une attaque réussit.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security.test.sql
--
-- En local sur un PostgreSQL ordinaire : charger d'abord supabase/tests/local-stubs.sql
-- puis la migration. Sur un vrai projet Supabase, utiliser la chaîne de connexion « postgres ».

begin;

create schema tests;
create table tests.results (n serial, label text, ok boolean, detail text);

-- Attend une erreur dont le message contient `pattern`.
create function tests.expect_fail(p_label text, p_role text, p_uid uuid, p_email text, p_stmt text, p_pattern text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'email', p_email, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
  begin
    execute p_stmt;
    reset role;
    insert into tests.results (label, ok, detail) values (p_label, false, 'AUCUN refus : l''attaque a réussi');
  exception when others then
    reset role;
    insert into tests.results (label, ok, detail) values (p_label, sqlerrm ilike '%' || p_pattern || '%', sqlerrm);
  end;
end $$;

-- Attend que l'instruction réussisse.
create function tests.expect_ok(p_label text, p_role text, p_uid uuid, p_email text, p_stmt text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'email', p_email, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
  begin
    execute p_stmt;
    reset role;
    insert into tests.results (label, ok, detail) values (p_label, true, 'ok');
  exception when others then
    reset role;
    insert into tests.results (label, ok, detail) values (p_label, false, sqlerrm);
  end;
end $$;

-- Attend qu'une requête scalaire renvoie `p_expected` (comparaison en texte).
create function tests.expect_val(p_label text, p_role text, p_uid uuid, p_email text, p_query text, p_expected text)
returns void language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'email', p_email, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
  begin
    execute 'select x::text from (' || p_query || ') t(x)' into v;
    reset role;
    insert into tests.results (label, ok, detail) values (p_label, v is not distinct from p_expected, 'obtenu=' || coalesce(v, 'NULL') || ' attendu=' || p_expected);
  exception when others then
    reset role;
    insert into tests.results (label, ok, detail) values (p_label, false, sqlerrm);
  end;
end $$;

-- Jeu d'essai : deux utilisateurs (le trigger crée profil + abonnement gratuit)
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a@test.dev', '{"full_name":"Alice","company":"AcmeCo"}'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'b@test.dev', '{}');

-- Projets et jeux de données préparés par le propriétaire de la base (hors RLS)
insert into public.projects (id, name, user_id) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'Projet A', 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-1111-0000-0000-000000000001', 'Projet B', 'bbbbbbbb-0000-0000-0000-00000000000b');
insert into public.datasets (id, project_id, name, user_id) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'Dataset A', 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-2222-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000001', 'Dataset B', 'bbbbbbbb-0000-0000-0000-00000000000b');

-- Raccourcis
\set A '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set B '''bbbbbbbb-0000-0000-0000-00000000000b'''

-- ===== Inscription =====
select tests.expect_val('trigger: profil créé avec la société', 'postgres', null, null,
  $q$select company from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$, 'AcmeCo');
select tests.expect_val('trigger: abonnement gratuit créé', 'postgres', null, null,
  $q$select plan from public.subscriptions where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$, 'free');
select tests.expect_val('current_plan() = free à l''inscription', 'authenticated', :A::uuid, 'a@test.dev',
  $q$select public.current_plan()$q$, 'free');

-- ===== Attaque : s'octroyer un abonnement / un plan =====
select tests.expect_fail('ATTAQUE: INSERT subscriptions enterprise', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.subscriptions (user_id, plan, status) values ('aaaaaaaa-0000-0000-0000-00000000000a','enterprise','active')$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: UPDATE subscriptions plan', 'authenticated', :A::uuid, 'a@test.dev',
  $q$update public.subscriptions set plan = 'enterprise' where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: DELETE subscriptions', 'authenticated', :A::uuid, 'a@test.dev',
  $q$delete from public.subscriptions where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: supprimer son profil puis le recréer', 'authenticated', :A::uuid, 'a@test.dev',
  $q$delete from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: INSERT profil', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.profiles (id, email, role) values ('aaaaaaaa-0000-0000-0000-00000000000a','x@x','admin')$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: UPDATE profiles.role', 'authenticated', :A::uuid, 'a@test.dev',
  $q$update public.profiles set role = 'admin' where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: UPDATE profiles.email', 'authenticated', :A::uuid, 'a@test.dev',
  $q$update public.profiles set email = 'x@x' where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$, 'permission denied');
select tests.expect_ok('légitime: UPDATE profiles.full_name', 'authenticated', :A::uuid, 'a@test.dev',
  $q$update public.profiles set full_name = 'Alice D.' where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$);
select tests.expect_fail('ATTAQUE: INSERT payments', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.payments (user_id, transaction_id, plan, amount) values ('aaaaaaaa-0000-0000-0000-00000000000a','FAKE','premium',17900)$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: appeler activate_plan', 'authenticated', :A::uuid, 'a@test.dev',
  $q$select public.activate_plan('aaaaaaaa-0000-0000-0000-00000000000a','enterprise','kkiapay','FAKE',1,'XOF','x',12)$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: appeler activate_plan (anon)', 'anon', null, null,
  $q$select public.activate_plan('aaaaaaaa-0000-0000-0000-00000000000a','enterprise','kkiapay','FAKE',1,'XOF','x',12)$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: appeler effective_plan', 'authenticated', :A::uuid, 'a@test.dev',
  $q$select public.effective_plan('bbbbbbbb-0000-0000-0000-00000000000b')$q$, 'permission denied');
select tests.expect_fail('anon: lecture projects interdite', 'anon', null, null,
  $q$select count(*) from public.projects$q$, 'permission denied');
select tests.expect_fail('anon: current_plan interdit', 'anon', null, null,
  $q$select public.current_plan()$q$, 'permission denied');

-- ===== Isolation entre utilisateurs =====
select tests.expect_val('A ne voit pas le projet de B', 'authenticated', :A::uuid, 'a@test.dev',
  $q$select count(*) from public.projects where id = 'bbbbbbbb-1111-0000-0000-000000000001'$q$, '0');
select tests.expect_fail('ATTAQUE: A crée un dataset dans le projet de B', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.datasets (project_id, name) values ('bbbbbbbb-1111-0000-0000-000000000001','intrus')$q$, 'row-level security');
select tests.expect_ok('légitime: A crée un dataset dans son projet', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.datasets (project_id, name) values ('aaaaaaaa-1111-0000-0000-000000000001','ds A bis')$q$);
select tests.expect_fail('ATTAQUE: A déplace son dataset vers le projet de B', 'authenticated', :A::uuid, 'a@test.dev',
  $q$update public.datasets set project_id = 'bbbbbbbb-1111-0000-0000-000000000001' where id = 'aaaaaaaa-2222-0000-0000-000000000001'$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: A référence le dataset de B dans un modèle', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.models (project_id, dataset_id, name, model_type, task_type) values ('aaaaaaaa-1111-0000-0000-000000000001','bbbbbbbb-2222-0000-0000-000000000001','m','x','classification')$q$, 'row-level security');
select tests.expect_ok('légitime: A crée un modèle sans dataset', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.models (project_id, name, model_type, task_type) values ('aaaaaaaa-1111-0000-0000-000000000001','m','x','classification')$q$);
select tests.expect_fail('ATTAQUE: usurper user_id à l''insertion', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.projects (name, user_id) values ('vol','bbbbbbbb-0000-0000-0000-00000000000b')$q$, 'row-level security');

-- ===== Journal d'audit =====
select tests.expect_ok('légitime: écrire dans activity_log', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.activity_log (action) values ('test')$q$);
select tests.expect_fail('ATTAQUE: modifier activity_log', 'authenticated', :A::uuid, 'a@test.dev',
  $q$update public.activity_log set action = 'x'$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: supprimer activity_log', 'authenticated', :A::uuid, 'a@test.dev',
  $q$delete from public.activity_log$q$, 'permission denied');

-- ===== Équipe =====
select tests.expect_ok('légitime: A invite B', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.team_members (owner_id, member_email) values ('aaaaaaaa-0000-0000-0000-00000000000a','B@test.dev')$q$);
select tests.expect_val('B voit son invitation (sans lire auth.users)', 'authenticated', :B::uuid, 'b@test.dev',
  $q$select count(*) from public.team_members$q$, '1');
select tests.expect_fail('ATTAQUE: B s''ajoute dans l''équipe de A', 'authenticated', :B::uuid, 'b@test.dev',
  $q$insert into public.team_members (owner_id, member_email) values ('aaaaaaaa-0000-0000-0000-00000000000a','b@test.dev')$q$, 'row-level security');

-- ===== Limites du plan gratuit =====
select tests.expect_ok('free: 2e projet', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.projects (name) values ('p2')$q$);
select tests.expect_ok('free: 3e projet', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.projects (name) values ('p3')$q$);
select tests.expect_fail('free: 4e projet refusé', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.projects (name) values ('p4')$q$, 'plan_limit:projects');
select tests.expect_ok('free: le serveur enregistre 5 000 lignes', 'service_role', null, null,
  $q$update public.datasets set row_count = 5000 where id = 'aaaaaaaa-2222-0000-0000-000000000001'$q$);
select tests.expect_fail('free: dataset > 10 000 lignes refusé (écriture serveur)', 'service_role', null, null,
  $q$update public.datasets set row_count = 20000 where id = 'aaaaaaaa-2222-0000-0000-000000000001'$q$, 'plan_limit:rows');

select tests.expect_val('free: row_count réellement enregistré par le serveur', 'service_role', null, null,
  $q$select row_count from public.datasets where id = 'aaaaaaaa-2222-0000-0000-000000000001'$q$, '5000');

-- ===== Paiement : activation côté serveur =====
select tests.expect_val('activate_plan renvoie une échéance ~1 mois', 'service_role', null, null,
  $q$select public.activate_plan('aaaaaaaa-0000-0000-0000-00000000000a','premium','kkiapay','TX-1',17900,'XOF','momo',1) between now() + interval '27 days' and now() + interval '32 days'$q$, 'true');
select tests.expect_val('current_plan = premium après paiement', 'authenticated', :A::uuid, 'a@test.dev',
  $q$select public.current_plan()$q$, 'premium');
select tests.expect_ok('premium: 4e projet autorisé', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.projects (name) values ('p4')$q$);
select tests.expect_ok('premium: dataset > 10 000 lignes autorisé', 'service_role', null, null,
  $q$update public.datasets set row_count = 20000 where id = 'aaaaaaaa-2222-0000-0000-000000000001'$q$);
select tests.expect_val('premium: row_count 20 000 enregistré', 'service_role', null, null,
  $q$select row_count from public.datasets where id = 'aaaaaaaa-2222-0000-0000-000000000001'$q$, '20000');
select tests.expect_val('A voit son paiement', 'authenticated', :A::uuid, 'a@test.dev',
  $q$select count(*) from public.payments$q$, '1');
select tests.expect_val('B ne voit pas le paiement de A', 'authenticated', :B::uuid, 'b@test.dev',
  $q$select count(*) from public.payments$q$, '0');

-- Rejeu de la même transaction
select tests.expect_val('rejeu par le même utilisateur: idempotent (échéance inchangée)', 'service_role', null, null,
  $q$select public.activate_plan('aaaaaaaa-0000-0000-0000-00000000000a','premium','kkiapay','TX-1',17900,'XOF','momo',1) = (select current_period_end from public.subscriptions where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a')$q$, 'true');
select tests.expect_val('rejeu: toujours un seul paiement enregistré', 'postgres', null, null,
  $q$select count(*) from public.payments where transaction_id = 'TX-1'$q$, '1');
select tests.expect_fail('ATTAQUE: rejouer TX-1 sur le compte de B', 'service_role', null, null,
  $q$select public.activate_plan('bbbbbbbb-0000-0000-0000-00000000000b','premium','kkiapay','TX-1',17900,'XOF','momo',1)$q$, 'transaction_already_used');
select tests.expect_val('B reste en plan gratuit', 'authenticated', :B::uuid, 'b@test.dev',
  $q$select public.current_plan()$q$, 'free');

-- Renouvellement avant échéance : la période s'ajoute
select tests.expect_val('renouvellement anticipé: ~2 mois cumulés', 'service_role', null, null,
  $q$select public.activate_plan('aaaaaaaa-0000-0000-0000-00000000000a','premium','kkiapay','TX-2',17900,'XOF','card',1) > now() + interval '55 days'$q$, 'true');

-- Validations d'entrée
select tests.expect_fail('activate_plan refuse le plan free', 'service_role', null, null,
  $q$select public.activate_plan('bbbbbbbb-0000-0000-0000-00000000000b','free','kkiapay','TX-3',17900,'XOF','x',1)$q$, 'invalid_plan');
select tests.expect_fail('activate_plan refuse un utilisateur inconnu', 'service_role', null, null,
  $q$select public.activate_plan('cccccccc-0000-0000-0000-00000000000c','premium','kkiapay','TX-4',17900,'XOF','x',1)$q$, 'unknown_user');
select tests.expect_fail('activate_plan refuse une durée de 0 mois', 'service_role', null, null,
  $q$select public.activate_plan('bbbbbbbb-0000-0000-0000-00000000000b','premium','kkiapay','TX-5',17900,'XOF','x',0)$q$, 'invalid_period');

-- Expiration : le plan retombe à free et les limites s'appliquent de nouveau
update public.subscriptions set current_period_end = now() - interval '1 day'
 where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
select tests.expect_val('expiration: current_plan = free', 'authenticated', :A::uuid, 'a@test.dev',
  $q$select public.current_plan()$q$, 'free');
select tests.expect_fail('expiration: nouveaux projets refusés', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.projects (name) values ('p5')$q$, 'plan_limit:projects');

-- ===== Storage =====
select tests.expect_ok('légitime: A écrit dans son dossier datasets', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into storage.objects (bucket_id, name) values ('datasets','aaaaaaaa-0000-0000-0000-00000000000a/p/f.csv')$q$);
select tests.expect_fail('ATTAQUE: A écrit dans le dossier de B', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into storage.objects (bucket_id, name) values ('datasets','bbbbbbbb-0000-0000-0000-00000000000b/p/f.csv')$q$, 'row-level security');
select tests.expect_val('B ne voit pas les fichiers de A', 'authenticated', :B::uuid, 'b@test.dev',
  $q$select count(*) from storage.objects$q$, '0');
select tests.expect_val('anon ne peut pas lister les objets (même avatars)', 'anon', null, null,
  $q$select count(*) from storage.objects$q$, '0');
select tests.expect_val('avatars: limite 2 Mo', 'postgres', null, null,
  $q$select file_size_limit from storage.buckets where id = 'avatars'$q$, '2097152');
select tests.expect_val('datasets: limite 50 Mo, privé', 'postgres', null, null,
  $q$select file_size_limit::text || public::text from storage.buckets where id = 'datasets'$q$, '52428800false');

-- ===== Acceptation des CGU =====
select tests.expect_fail('ATTAQUE: le client ne peut pas écrire terms_accepted_at', 'authenticated', :A::uuid, 'a@test.dev',
  $q$update public.profiles set terms_accepted_at = now() where id = auth.uid()$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: le client ne peut pas écrire terms_version', 'authenticated', :A::uuid, 'a@test.dev',
  $q$update public.profiles set terms_version = 'x' where id = auth.uid()$q$, 'permission denied');
insert into auth.users (id, email, raw_user_meta_data) values
  ('dddddddd-0000-0000-0000-00000000000d', 'd@test.dev', '{"accepted_terms":"true","terms_version":"2026-10"}'),
  ('eeeeeeee-0000-0000-0000-00000000000e', 'e@test.dev', '{}');
select tests.expect_val('CGU acceptées: horodatage posé par le serveur', 'postgres', null, null,
  $q$select (terms_accepted_at is not null)::text || terms_version from public.profiles where id = 'dddddddd-0000-0000-0000-00000000000d'$q$, 'true2026-10');
select tests.expect_val('sans acceptation: aucun horodatage', 'postgres', null, null,
  $q$select (terms_accepted_at is null)::text from public.profiles where id = 'eeeeeeee-0000-0000-0000-00000000000e'$q$, 'true');
select tests.expect_fail('handle_new_user non appelable par un client', 'authenticated', :A::uuid, 'a@test.dev',
  $q$select public.handle_new_user()$q$, 'permission denied');

-- ===== Métadonnées de dataset : écriture réservée au serveur =====
select tests.expect_fail('ATTAQUE: le client insère un dataset avec row_count', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.datasets (project_id, name, row_count) values ('aaaaaaaa-1111-0000-0000-000000000001','x', 1)$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: le client insère un dataset avec profiling', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.datasets (project_id, name, profiling) values ('aaaaaaaa-1111-0000-0000-000000000001','x', '{}')$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: le client insère un dataset avec status', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.datasets (project_id, name, status) values ('aaaaaaaa-1111-0000-0000-000000000001','x', 'profiled')$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: le client réécrit row_count', 'authenticated', :A::uuid, 'a@test.dev',
  $q$update public.datasets set row_count = 1 where id = 'aaaaaaaa-2222-0000-0000-000000000001'$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: le client réécrit status', 'authenticated', :A::uuid, 'a@test.dev',
  $q$update public.datasets set status = 'profiled' where id = 'aaaaaaaa-2222-0000-0000-000000000001'$q$, 'permission denied');
select tests.expect_ok('légitime: le client renomme son dataset', 'authenticated', :A::uuid, 'a@test.dev',
  $q$update public.datasets set name = 'renommé' where id = 'aaaaaaaa-2222-0000-0000-000000000001'$q$);

-- ===== Bilan =====
select n, case when ok then 'PASS' else 'FAIL' end as resultat, label, case when ok then '' else detail end as detail
  from tests.results order by n;

do $$
declare v_fail int; v_total int;
begin
  select count(*) filter (where not ok), count(*) into v_fail, v_total from tests.results;
  raise notice '=== % tests, % échec(s) ===', v_total, v_fail;
  if v_fail > 0 then raise exception '% test(s) de sécurité en échec', v_fail; end if;
end $$;

rollback;
