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

-- Attend qu'une écriture (insert/update/delete) touche exactement `p_expected` lignes
-- (la RLS filtre silencieusement les lignes interdites : 0 ligne = refus).
create function tests.expect_rows(p_label text, p_role text, p_uid uuid, p_email text, p_stmt text, p_expected int)
returns void language plpgsql as $$
declare v int;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'email', p_email, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
  begin
    execute p_stmt;
    get diagnostics v = row_count;
    reset role;
    insert into tests.results (label, ok, detail) values (p_label, v = p_expected, 'lignes=' || v || ' attendu=' || p_expected);
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
  $q$insert into public.models (project_id, dataset_id, name, model_type, task_type) values ('aaaaaaaa-1111-0000-0000-000000000001','bbbbbbbb-2222-0000-0000-000000000001','m','x','classification')$q$, 'permission denied');
-- Les modèles sont écrits par le serveur (run-automl) : le client ne peut ni en créer ni fixer des métriques.
select tests.expect_fail('ATTAQUE: A écrit lui-même un modèle avec de fausses métriques', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.models (project_id, name, model_type, task_type, status, metrics) values ('aaaaaaaa-1111-0000-0000-000000000001','faux','automl','classification','completed','{"accuracy":0.99}')$q$, 'permission denied');
insert into public.models (id, project_id, dataset_id, name, model_type, task_type, algorithm, status, metrics, user_id) values
  ('aaaaaaaa-4444-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001',
   'Modèle A', 'automl', 'classification', 'forest', 'completed', '{"accuracy":0.8}', 'aaaaaaaa-0000-0000-0000-00000000000a');
select tests.expect_fail('ATTAQUE: A modifie les métriques de son modèle', 'authenticated', :A::uuid, 'a@test.dev',
  $q$update public.models set metrics = '{"accuracy":0.99}' where id = 'aaaaaaaa-4444-0000-0000-000000000001'$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: A modifie le statut / l''importance de son modèle', 'authenticated', :A::uuid, 'a@test.dev',
  $q$update public.models set feature_importance = '{"x":1}', status = 'completed' where id = 'aaaaaaaa-4444-0000-0000-000000000001'$q$, 'permission denied');
select tests.expect_rows('légitime: A renomme son modèle', 'authenticated', :A::uuid, 'a@test.dev',
  $q$update public.models set name = 'Modèle A renommé' where id = 'aaaaaaaa-4444-0000-0000-000000000001'$q$, 1);
select tests.expect_rows('ATTAQUE: B renomme le modèle de A (0 ligne)', 'authenticated', :B::uuid, 'b@test.dev',
  $q$update public.models set name = 'piraté' where id = 'aaaaaaaa-4444-0000-0000-000000000001'$q$, 0);
select tests.expect_val('métriques du modèle de A intactes', 'postgres', null, null,
  $q$select metrics->>'accuracy' from public.models where id = 'aaaaaaaa-4444-0000-0000-000000000001'$q$, '0.8');
select tests.expect_ok('légitime: le serveur (service_role) enregistre un modèle calculé', 'service_role', null, null,
  $q$insert into public.models (project_id, dataset_id, name, model_type, task_type, algorithm, status, metrics, user_id, created_by) values ('aaaaaaaa-1111-0000-0000-000000000001','aaaaaaaa-2222-0000-0000-000000000001','calculé','automl','classification','forest','completed','{"accuracy":0.9}','aaaaaaaa-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-00000000000a')$q$);
select tests.expect_val('service_role : lit le plan effectif du propriétaire', 'service_role', null, null,
  $q$select public.effective_plan('aaaaaaaa-0000-0000-0000-00000000000a')$q$, 'free');
select tests.expect_fail('ATTAQUE: un utilisateur lit le plan effectif d''un autre', 'authenticated', :A::uuid, 'a@test.dev',
  $q$select public.effective_plan('bbbbbbbb-0000-0000-0000-00000000000b')$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: usurper user_id à l''insertion', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.projects (name, user_id) values ('vol','bbbbbbbb-0000-0000-0000-00000000000b')$q$, 'row-level security');

-- ===== Journal d'audit =====
select tests.expect_ok('légitime: écrire dans activity_log', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.activity_log (action) values ('test')$q$);
select tests.expect_fail('ATTAQUE: modifier activity_log', 'authenticated', :A::uuid, 'a@test.dev',
  $q$update public.activity_log set action = 'x'$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: supprimer activity_log', 'authenticated', :A::uuid, 'a@test.dev',
  $q$delete from public.activity_log$q$, 'permission denied');

-- ===== Équipe (plan gratuit) =====
select tests.expect_fail('ATTAQUE: un propriétaire gratuit ne peut pas inviter', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.team_members (member_email, role) values ('b@test.dev','viewer')$q$, 'row-level security');

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

-- ===== Remboursement et limitation de débit =====
select tests.expect_ok('activate R1', 'service_role', null, null,
  $q$select public.activate_plan('dddddddd-0000-0000-0000-00000000000d','premium','kkiapay','R1',17900,'XOF','momo',1)$q$);
select tests.expect_val('avant remboursement: premium', 'authenticated', 'dddddddd-0000-0000-0000-00000000000d'::uuid, 'd@test.dev',
  $q$select public.current_plan()$q$, 'premium');
select tests.expect_ok('revoke_payment R1', 'service_role', null, null, $q$select public.revoke_payment('kkiapay','R1')$q$);
select tests.expect_val('après remboursement du seul mois: free', 'authenticated', 'dddddddd-0000-0000-0000-00000000000d'::uuid, 'd@test.dev',
  $q$select public.current_plan()$q$, 'free');
select tests.expect_ok('activate R2', 'service_role', null, null,
  $q$select public.activate_plan('dddddddd-0000-0000-0000-00000000000d','premium','kkiapay','R2',17900,'XOF','momo',1)$q$);
select tests.expect_ok('activate R3', 'service_role', null, null,
  $q$select public.activate_plan('dddddddd-0000-0000-0000-00000000000d','premium','kkiapay','R3',17900,'XOF','momo',1)$q$);
select tests.expect_ok('revoke_payment R2', 'service_role', null, null, $q$select public.revoke_payment('kkiapay','R2')$q$);
select tests.expect_ok('revoke_payment R2 rejoué (idempotent)', 'service_role', null, null, $q$select public.revoke_payment('kkiapay','R2')$q$);
select tests.expect_val('R2 rejoué: un seul mois retiré (reste ~1 mois)', 'service_role', null, null,
  $q$select current_period_end between now() + interval '27 days' and now() + interval '32 days' from public.subscriptions where user_id = 'dddddddd-0000-0000-0000-00000000000d'$q$, 'true');
select tests.expect_val('encore premium avec le mois restant', 'authenticated', 'dddddddd-0000-0000-0000-00000000000d'::uuid, 'd@test.dev',
  $q$select public.current_plan()$q$, 'premium');
select tests.expect_ok('revoke_payment R3', 'service_role', null, null, $q$select public.revoke_payment('kkiapay','R3')$q$);
select tests.expect_val('tout remboursé: free', 'authenticated', 'dddddddd-0000-0000-0000-00000000000d'::uuid, 'd@test.dev',
  $q$select public.current_plan()$q$, 'free');
select tests.expect_fail('revoke_payment: transaction inconnue', 'service_role', null, null,
  $q$select public.revoke_payment('kkiapay','NOPE')$q$, 'unknown_payment');
select tests.expect_fail('ATTAQUE: un client ne peut pas appeler revoke_payment', 'authenticated', 'dddddddd-0000-0000-0000-00000000000d'::uuid, 'd@test.dev',
  $q$select public.revoke_payment('kkiapay','R1')$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: un client ne peut pas écrire refunded_at', 'authenticated', 'dddddddd-0000-0000-0000-00000000000d'::uuid, 'd@test.dev',
  $q$update public.payments set refunded_at = null$q$, 'permission denied');
select tests.expect_val('limite de débit: 3 tentatives autorisées', 'service_role', null, null,
  $q$select (public.register_verify_attempt('dddddddd-0000-0000-0000-00000000000d', 3)::int + public.register_verify_attempt('dddddddd-0000-0000-0000-00000000000d', 3)::int + public.register_verify_attempt('dddddddd-0000-0000-0000-00000000000d', 3)::int)$q$, '3');
select tests.expect_val('limite de débit: la 4e est refusée', 'service_role', null, null,
  $q$select public.register_verify_attempt('dddddddd-0000-0000-0000-00000000000d', 3)$q$, 'false');
select tests.expect_val('limite de débit: un autre utilisateur n''est pas affecté', 'service_role', null, null,
  $q$select public.register_verify_attempt('eeeeeeee-0000-0000-0000-00000000000e', 3)$q$, 'true');
select tests.expect_fail('ATTAQUE: un client ne peut pas appeler register_verify_attempt', 'authenticated', 'dddddddd-0000-0000-0000-00000000000d'::uuid, 'd@test.dev',
  $q$select public.register_verify_attempt('dddddddd-0000-0000-0000-00000000000d', 1000)$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: un client ne peut pas lire verify_attempts', 'authenticated', 'dddddddd-0000-0000-0000-00000000000d'::uuid, 'd@test.dev',
  $q$select count(*) from public.verify_attempts$q$, 'permission denied');

-- ===== Collaboration d'équipe =====
-- A = propriétaire (redevient Premium), B = membre viewer, C = membre editor,
-- F = invité dont l'e-mail n'est PAS confirmé, E = étranger (aucun lien avec A).
\set C '''cccccccc-0000-0000-0000-00000000000c'''
\set F '''ffffffff-0000-0000-0000-00000000000f'''
\set E '''eeeeeeee-0000-0000-0000-00000000000e'''

insert into auth.users (id, email, email_confirmed_at) values
  ('cccccccc-0000-0000-0000-00000000000c', 'c@test.dev', now()),
  ('ffffffff-0000-0000-0000-00000000000f', 'f@test.dev', null);
insert into public.projects (id, name, user_id) values
  ('cccccccc-1111-0000-0000-000000000001', 'Projet C', 'cccccccc-0000-0000-0000-00000000000c');
insert into public.pipelines (id, project_id, name, user_id) values
  ('aaaaaaaa-3333-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'Pipeline A1', 'aaaaaaaa-0000-0000-0000-00000000000a');
insert into public.ai_conversations (title, user_id) values ('conv A', 'aaaaaaaa-0000-0000-0000-00000000000a');
insert into storage.objects (bucket_id, name) values
  ('datasets', 'aaaaaaaa-0000-0000-0000-00000000000a/team/partage.csv');

-- Propriétaire dont l'abonnement a expiré : plus d'invitation possible
select tests.expect_fail('ATTAQUE: propriétaire au plan expiré ne peut pas inviter', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.team_members (member_email, role) values ('b@test.dev','viewer')$q$, 'row-level security');

select tests.expect_ok('A redevient premium (TX-T1)', 'service_role', null, null,
  $q$select public.activate_plan('aaaaaaaa-0000-0000-0000-00000000000a','premium','kkiapay','TX-T1',17900,'XOF','momo',1)$q$);

-- ----- Invitations : ce que le client peut / ne peut pas écrire -----
select tests.expect_ok('légitime: A invite B (viewer)', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.team_members (member_email, role) values ('B@test.dev','viewer')$q$);
select tests.expect_ok('légitime: A invite C (editor)', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.team_members (member_email, role) values ('c@test.dev','editor')$q$);
select tests.expect_ok('légitime: A invite F (e-mail non confirmé)', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.team_members (member_email, role) values ('f@test.dev','viewer')$q$);
select tests.expect_fail('ATTAQUE: s''inviter soi-même', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.team_members (member_email, role) values ('A@test.dev','editor')$q$, 'row-level security');
select tests.expect_fail('ATTAQUE: invitation en double (casse différente)', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.team_members (member_email, role) values ('b@TEST.dev','viewer')$q$, 'duplicate key');
select tests.expect_fail('ATTAQUE: rôle inventé', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.team_members (member_email, role) values ('x@test.dev','admin')$q$, 'role_check');
select tests.expect_fail('ATTAQUE: e-mail invalide', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.team_members (member_email, role) values ('pas-un-email','viewer')$q$, 'email_check');
select tests.expect_fail('ATTAQUE: écrire status à l''insertion', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.team_members (member_email, status) values ('x@test.dev','accepted')$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: écrire member_id à l''insertion', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.team_members (member_email, member_id) values ('x@test.dev','eeeeeeee-0000-0000-0000-00000000000e')$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: choisir owner_id à l''insertion', 'authenticated', :B::uuid, 'b@test.dev',
  $q$insert into public.team_members (owner_id, member_email) values ('aaaaaaaa-0000-0000-0000-00000000000a','b@test.dev')$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: A s''accorde lui-même status=accepted', 'authenticated', :A::uuid, 'a@test.dev',
  $q$update public.team_members set status = 'accepted' where lower(member_email) = 'b@test.dev'$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: A écrit member_id', 'authenticated', :A::uuid, 'a@test.dev',
  $q$update public.team_members set member_id = 'eeeeeeee-0000-0000-0000-00000000000e' where lower(member_email) = 'b@test.dev'$q$, 'permission denied');
select tests.expect_fail('ATTAQUE: A change l''e-mail d''une invitation', 'authenticated', :A::uuid, 'a@test.dev',
  $q$update public.team_members set member_email = 'e@test.dev' where lower(member_email) = 'b@test.dev'$q$, 'permission denied');
select tests.expect_rows('légitime: A change le rôle d''une invitation', 'authenticated', :A::uuid, 'a@test.dev',
  $q$update public.team_members set role = 'viewer' where lower(member_email) = 'b@test.dev'$q$, 1);
select tests.expect_val('E ne voit aucune ligne d''équipe', 'authenticated', :E::uuid, 'e@test.dev',
  $q$select count(*) from public.team_members$q$, '0');

-- ----- Avant acceptation : aucun accès -----
select tests.expect_val('invitation en attente: B ne voit pas le projet de A', 'authenticated', :B::uuid, 'b@test.dev',
  $q$select count(*) from public.projects where id = 'aaaaaaaa-1111-0000-0000-000000000001'$q$, '0');
select tests.expect_val('B voit son invitation via my_invitations()', 'authenticated', :B::uuid, 'b@test.dev',
  $q$select count(*) from public.my_invitations()$q$, '1');
select tests.expect_val('F (e-mail non confirmé) ne voit aucune invitation', 'authenticated', :F::uuid, 'f@test.dev',
  $q$select count(*) from public.my_invitations()$q$, '0');
select tests.expect_fail('ATTAQUE: accepter avec un e-mail non confirmé', 'authenticated', :F::uuid, 'f@test.dev',
  format($q$select public.accept_team_invitation(%L)$q$, (select id from public.team_members where lower(member_email) = 'f@test.dev')),
  'email_not_confirmed');
select tests.expect_fail('ATTAQUE: E accepte l''invitation de B', 'authenticated', :E::uuid, 'e@test.dev',
  format($q$select public.accept_team_invitation(%L)$q$, (select id from public.team_members where lower(member_email) = 'b@test.dev')),
  'invitation_not_found');
select tests.expect_fail('ATTAQUE: E refuse l''invitation de B', 'authenticated', :E::uuid, 'e@test.dev',
  format($q$select public.decline_team_invitation(%L)$q$, (select id from public.team_members where lower(member_email) = 'b@test.dev')),
  'invitation_not_found');
select tests.expect_fail('ATTAQUE: accepter (anon)', 'anon', null, null,
  format($q$select public.accept_team_invitation(%L)$q$, (select id from public.team_members where lower(member_email) = 'b@test.dev')),
  'permission denied');
select tests.expect_fail('ATTAQUE: lire my_invitations (anon)', 'anon', null, null,
  $q$select count(*) from public.my_invitations()$q$, 'permission denied');

-- ----- Acceptation -----
select tests.expect_ok('légitime: B accepte', 'authenticated', :B::uuid, 'b@test.dev',
  format($q$select public.accept_team_invitation(%L)$q$, (select id from public.team_members where lower(member_email) = 'b@test.dev')));
select tests.expect_ok('légitime: C accepte', 'authenticated', :C::uuid, 'c@test.dev',
  format($q$select public.accept_team_invitation(%L)$q$, (select id from public.team_members where lower(member_email) = 'c@test.dev')));
select tests.expect_fail('ATTAQUE: rejouer l''acceptation', 'authenticated', :B::uuid, 'b@test.dev',
  format($q$select public.accept_team_invitation(%L)$q$, (select id from public.team_members where lower(member_email) = 'b@test.dev')),
  'invitation_not_found');
select tests.expect_val('statut accepté et lié au compte de B', 'postgres', null, null,
  $q$select (status = 'accepted' and member_id = 'bbbbbbbb-0000-0000-0000-00000000000b')::text from public.team_members where lower(member_email) = 'b@test.dev'$q$, 'true');
select tests.expect_val('B: my_workspaces() = A en viewer', 'authenticated', :B::uuid, 'b@test.dev',
  $q$select owner_id::text || ':' || role from public.my_workspaces()$q$, 'aaaaaaaa-0000-0000-0000-00000000000a:viewer');

-- ----- Viewer (B) : lecture seule -----
select tests.expect_val('viewer: voit le projet de A', 'authenticated', :B::uuid, 'b@test.dev',
  $q$select count(*) from public.projects where id = 'aaaaaaaa-1111-0000-0000-000000000001'$q$, '1');
select tests.expect_val('viewer: voit le dataset de A', 'authenticated', :B::uuid, 'b@test.dev',
  $q$select count(*) from public.datasets where id = 'aaaaaaaa-2222-0000-0000-000000000001'$q$, '1');
select tests.expect_fail('ATTAQUE viewer: ajouter un dataset chez A', 'authenticated', :B::uuid, 'b@test.dev',
  $q$insert into public.datasets (project_id, name) values ('aaaaaaaa-1111-0000-0000-000000000001','intrus')$q$, 'row-level security');
select tests.expect_fail('ATTAQUE viewer: ajouter un pipeline chez A', 'authenticated', :B::uuid, 'b@test.dev',
  $q$insert into public.pipelines (project_id, name) values ('aaaaaaaa-1111-0000-0000-000000000001','intrus')$q$, 'row-level security');
select tests.expect_rows('ATTAQUE viewer: renommer un dataset de A', 'authenticated', :B::uuid, 'b@test.dev',
  $q$update public.datasets set name = 'piraté' where id = 'aaaaaaaa-2222-0000-0000-000000000001'$q$, 0);
select tests.expect_rows('ATTAQUE viewer: modifier un pipeline de A', 'authenticated', :B::uuid, 'b@test.dev',
  $q$update public.pipelines set name = 'piraté' where id = 'aaaaaaaa-3333-0000-0000-000000000001'$q$, 0);
select tests.expect_rows('ATTAQUE viewer: supprimer un dataset de A', 'authenticated', :B::uuid, 'b@test.dev',
  $q$delete from public.datasets where id = 'aaaaaaaa-2222-0000-0000-000000000001'$q$, 0);
select tests.expect_rows('ATTAQUE viewer: supprimer le projet de A', 'authenticated', :B::uuid, 'b@test.dev',
  $q$delete from public.projects where id = 'aaaaaaaa-1111-0000-0000-000000000001'$q$, 0);
select tests.expect_fail('ATTAQUE viewer: créer un projet chez A', 'authenticated', :B::uuid, 'b@test.dev',
  $q$insert into public.projects (name, user_id) values ('intrus','aaaaaaaa-0000-0000-0000-00000000000a')$q$, 'row-level security');

-- ----- Ce qu'un membre ne voit jamais -----
select tests.expect_val('membre: pas le profil du propriétaire', 'authenticated', :B::uuid, 'b@test.dev',
  $q$select count(*) from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$, '0');
select tests.expect_val('membre: pas l''abonnement du propriétaire', 'authenticated', :B::uuid, 'b@test.dev',
  $q$select count(*) from public.subscriptions where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$, '0');
select tests.expect_val('membre: pas les paiements du propriétaire', 'authenticated', :C::uuid, 'c@test.dev',
  $q$select count(*) from public.payments$q$, '0');
select tests.expect_val('membre: pas les conversations du propriétaire', 'authenticated', :C::uuid, 'c@test.dev',
  $q$select count(*) from public.ai_conversations$q$, '0');
select tests.expect_val('membre: pas les préférences du propriétaire', 'authenticated', :C::uuid, 'c@test.dev',
  $q$select count(*) from public.notification_preferences where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$, '0');
select tests.expect_val('membre: pas le journal d''activité du propriétaire', 'authenticated', :C::uuid, 'c@test.dev',
  $q$select count(*) from public.activity_log where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$, '0');
select tests.expect_val('B ne voit que sa propre ligne d''équipe', 'authenticated', :B::uuid, 'b@test.dev',
  $q$select count(*) from public.team_members$q$, '1');

-- ----- Gestion de l'équipe : réservée au propriétaire -----
select tests.expect_rows('ATTAQUE membre: supprimer la ligne d''un autre membre', 'authenticated', :C::uuid, 'c@test.dev',
  $q$delete from public.team_members where lower(member_email) = 'b@test.dev'$q$, 0);
select tests.expect_rows('ATTAQUE editor: passer B en editor', 'authenticated', :C::uuid, 'c@test.dev',
  $q$update public.team_members set role = 'editor' where lower(member_email) = 'b@test.dev'$q$, 0);
select tests.expect_rows('ATTAQUE viewer: se promouvoir editor', 'authenticated', :B::uuid, 'b@test.dev',
  $q$update public.team_members set role = 'editor' where lower(member_email) = 'b@test.dev'$q$, 0);
select tests.expect_fail('ATTAQUE membre: inviter chez A', 'authenticated', :C::uuid, 'c@test.dev',
  $q$insert into public.team_members (member_email, role) values ('x@test.dev','viewer')$q$, 'row-level security');

-- ----- Editor (C) -----
select tests.expect_ok('editor: ajoute un dataset dans le projet de A', 'authenticated', :C::uuid, 'c@test.dev',
  $q$insert into public.datasets (project_id, name) values ('aaaaaaaa-1111-0000-0000-000000000001','ds par C')$q$);
select tests.expect_val('la ligne appartient à A, l''auteur est C', 'postgres', null, null,
  $q$select (user_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and created_by = 'cccccccc-0000-0000-0000-00000000000c')::text from public.datasets where name = 'ds par C'$q$, 'true');
select tests.expect_val('A voit le dataset ajouté par C', 'authenticated', :A::uuid, 'a@test.dev',
  $q$select count(*) from public.datasets where name = 'ds par C'$q$, '1');
select tests.expect_ok('editor: ajoute un pipeline en usurpant user_id et created_by', 'authenticated', :C::uuid, 'c@test.dev',
  $q$insert into public.pipelines (project_id, name, user_id, created_by) values ('aaaaaaaa-1111-0000-0000-000000000001','pipe C','cccccccc-0000-0000-0000-00000000000c','bbbbbbbb-0000-0000-0000-00000000000b')$q$);
select tests.expect_val('usurpation écrasée: user_id = A, created_by = C', 'postgres', null, null,
  $q$select (user_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and created_by = 'cccccccc-0000-0000-0000-00000000000c')::text from public.pipelines where name = 'pipe C'$q$, 'true');
select tests.expect_fail('ATTAQUE editor: effacer l''auteur d''une ligne', 'authenticated', :C::uuid, 'c@test.dev',
  $q$update public.pipelines set created_by = null where name = 'pipe C'$q$, 'owner_immutable');
select tests.expect_fail('ATTAQUE editor: s''attribuer la paternité d''une ligne', 'authenticated', :C::uuid, 'c@test.dev',
  $q$update public.pipelines set created_by = 'bbbbbbbb-0000-0000-0000-00000000000b' where name = 'pipe C'$q$, 'owner_immutable');
select tests.expect_rows('editor: renomme un dataset de A', 'authenticated', :C::uuid, 'c@test.dev',
  $q$update public.datasets set name = 'renommé par C' where id = 'aaaaaaaa-2222-0000-0000-000000000001'$q$, 1);
select tests.expect_rows('editor: modifie un pipeline de A', 'authenticated', :C::uuid, 'c@test.dev',
  $q$update public.pipelines set name = 'modifié par C' where id = 'aaaaaaaa-3333-0000-0000-000000000001'$q$, 1);
select tests.expect_rows('editor: supprime un pipeline de A', 'authenticated', :C::uuid, 'c@test.dev',
  $q$delete from public.pipelines where name = 'pipe C'$q$, 1);
select tests.expect_fail('ATTAQUE editor: écrire directement un modèle (réservé au serveur)', 'authenticated', :C::uuid, 'c@test.dev',
  $q$insert into public.models (project_id, dataset_id, name, model_type, task_type) values ('aaaaaaaa-1111-0000-0000-000000000001','aaaaaaaa-2222-0000-0000-000000000001','m C','x','classification')$q$, 'permission denied');
select tests.expect_rows('editor: renomme un modèle de A', 'authenticated', :C::uuid, 'c@test.dev',
  $q$update public.models set name = 'renommé par C' where id = 'aaaaaaaa-4444-0000-0000-000000000001'$q$, 1);
select tests.expect_fail('ATTAQUE editor: visualisation de A sur un dataset d''un autre espace', 'authenticated', :C::uuid, 'c@test.dev',
  $q$insert into public.visualizations (project_id, dataset_id, name, chart_type) values ('aaaaaaaa-1111-0000-0000-000000000001','bbbbbbbb-2222-0000-0000-000000000001','v','bar')$q$, 'row-level security');
select tests.expect_fail('ATTAQUE editor: ajouter dans le projet de B (sans être son membre)', 'authenticated', :C::uuid, 'c@test.dev',
  $q$insert into public.pipelines (project_id, name) values ('bbbbbbbb-1111-0000-0000-000000000001','intrus')$q$, 'row-level security');
select tests.expect_val('editor: ne voit pas le projet de B', 'authenticated', :C::uuid, 'c@test.dev',
  $q$select count(*) from public.projects where id = 'bbbbbbbb-1111-0000-0000-000000000001'$q$, '0');
select tests.expect_fail('ATTAQUE editor: déplacer un pipeline de A vers son propre projet', 'authenticated', :C::uuid, 'c@test.dev',
  $q$update public.pipelines set project_id = 'cccccccc-1111-0000-0000-000000000001' where id = 'aaaaaaaa-3333-0000-0000-000000000001'$q$, 'row-level security');
select tests.expect_fail('ATTAQUE editor: s''approprier un pipeline de A (user_id)', 'authenticated', :C::uuid, 'c@test.dev',
  $q$update public.pipelines set user_id = 'cccccccc-0000-0000-0000-00000000000c' where id = 'aaaaaaaa-3333-0000-0000-000000000001'$q$, 'owner_immutable');
select tests.expect_fail('ATTAQUE editor: créer un projet chez A', 'authenticated', :C::uuid, 'c@test.dev',
  $q$insert into public.projects (name, user_id) values ('intrus','aaaaaaaa-0000-0000-0000-00000000000a')$q$, 'row-level security');
select tests.expect_rows('ATTAQUE editor: renommer le projet de A', 'authenticated', :C::uuid, 'c@test.dev',
  $q$update public.projects set name = 'piraté' where id = 'aaaaaaaa-1111-0000-0000-000000000001'$q$, 0);
select tests.expect_rows('ATTAQUE editor: supprimer le projet de A', 'authenticated', :C::uuid, 'c@test.dev',
  $q$delete from public.projects where id = 'aaaaaaaa-1111-0000-0000-000000000001'$q$, 0);

-- ----- Fichiers -----
select tests.expect_val('viewer: lit les fichiers de A', 'authenticated', :B::uuid, 'b@test.dev',
  $q$select count(*) from storage.objects where name = 'aaaaaaaa-0000-0000-0000-00000000000a/team/partage.csv'$q$, '1');
select tests.expect_val('étranger: ne lit pas les fichiers de A', 'authenticated', :E::uuid, 'e@test.dev',
  $q$select count(*) from storage.objects where name = 'aaaaaaaa-0000-0000-0000-00000000000a/team/partage.csv'$q$, '0');
select tests.expect_fail('ATTAQUE viewer: écrire un fichier chez A', 'authenticated', :B::uuid, 'b@test.dev',
  $q$insert into storage.objects (bucket_id, name) values ('datasets','aaaaaaaa-0000-0000-0000-00000000000a/team/intrus.csv')$q$, 'row-level security');
select tests.expect_ok('editor: écrit un fichier chez A', 'authenticated', :C::uuid, 'c@test.dev',
  $q$insert into storage.objects (bucket_id, name) values ('datasets','aaaaaaaa-0000-0000-0000-00000000000a/team/par-c.csv')$q$);
select tests.expect_ok('editor: écrit un rapport chez A', 'authenticated', :C::uuid, 'c@test.dev',
  $q$insert into storage.objects (bucket_id, name) values ('reports','aaaaaaaa-0000-0000-0000-00000000000a/team/rapport.pdf')$q$);
select tests.expect_fail('ATTAQUE editor: écrire dans les avatars de A', 'authenticated', :C::uuid, 'c@test.dev',
  $q$insert into storage.objects (bucket_id, name) values ('avatars','aaaaaaaa-0000-0000-0000-00000000000a/avatar.png')$q$, 'row-level security');
select tests.expect_fail('ATTAQUE editor: écrire chez B (non membre)', 'authenticated', :C::uuid, 'c@test.dev',
  $q$insert into storage.objects (bucket_id, name) values ('datasets','bbbbbbbb-0000-0000-0000-00000000000b/x.csv')$q$, 'row-level security');
select tests.expect_fail('ATTAQUE editor: dossier qui n''est pas un UUID', 'authenticated', :C::uuid, 'c@test.dev',
  $q$insert into storage.objects (bucket_id, name) values ('datasets','pas-un-uuid/x.csv')$q$, 'row-level security');
select tests.expect_rows('editor: supprime un fichier chez A', 'authenticated', :C::uuid, 'c@test.dev',
  $q$delete from storage.objects where name = 'aaaaaaaa-0000-0000-0000-00000000000a/team/par-c.csv'$q$, 1);
select tests.expect_rows('ATTAQUE viewer: supprime un fichier chez A', 'authenticated', :B::uuid, 'b@test.dev',
  $q$delete from storage.objects where name = 'aaaaaaaa-0000-0000-0000-00000000000a/team/partage.csv'$q$, 0);

-- ----- Changement de rôle par le propriétaire -----
select tests.expect_rows('légitime: A passe B en editor', 'authenticated', :A::uuid, 'a@test.dev',
  $q$update public.team_members set role = 'editor' where lower(member_email) = 'b@test.dev'$q$, 1);
select tests.expect_ok('B (devenu editor) ajoute un dataset chez A', 'authenticated', :B::uuid, 'b@test.dev',
  $q$insert into public.datasets (project_id, name) values ('aaaaaaaa-1111-0000-0000-000000000001','ds par B')$q$);
select tests.expect_rows('légitime: A repasse B en viewer', 'authenticated', :A::uuid, 'a@test.dev',
  $q$update public.team_members set role = 'viewer' where lower(member_email) = 'b@test.dev'$q$, 1);
select tests.expect_fail('B (redevenu viewer) ne peut plus ajouter', 'authenticated', :B::uuid, 'b@test.dev',
  $q$insert into public.datasets (project_id, name) values ('aaaaaaaa-1111-0000-0000-000000000001','ds par B 2')$q$, 'row-level security');

-- ----- Limite : 10 invitations en Premium, illimité en Entreprise -----
select tests.expect_rows('A invite 7 personnes de plus (10 au total)', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.team_members (member_email) select 'u' || g || '@test.dev' from generate_series(1, 7) g$q$, 7);
select tests.expect_fail('LIMITE: 11e invitation refusée (Premium)', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.team_members (member_email) values ('de-trop@test.dev')$q$, 'team_limit');
update public.subscriptions set plan = 'enterprise' where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
select tests.expect_ok('Entreprise: 11e invitation acceptée', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.team_members (member_email) values ('de-trop@test.dev')$q$);
update public.subscriptions set plan = 'premium' where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
select tests.expect_rows('A retire les 8 invitations supplémentaires', 'authenticated', :A::uuid, 'a@test.dev',
  $q$delete from public.team_members where member_email like 'u%@test.dev' or member_email = 'de-trop@test.dev'$q$, 8);

-- ----- Plan du propriétaire expiré : accès coupé, puis rétabli -----
update public.subscriptions set current_period_end = now() - interval '1 day'
 where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
select tests.expect_val('plan expiré: B ne voit plus le projet de A', 'authenticated', :B::uuid, 'b@test.dev',
  $q$select count(*) from public.projects where id = 'aaaaaaaa-1111-0000-0000-000000000001'$q$, '0');
select tests.expect_val('plan expiré: my_workspaces() vide', 'authenticated', :B::uuid, 'b@test.dev',
  $q$select count(*) from public.my_workspaces()$q$, '0');
select tests.expect_fail('plan expiré: C n''ajoute plus rien chez A', 'authenticated', :C::uuid, 'c@test.dev',
  $q$insert into public.datasets (project_id, name) values ('aaaaaaaa-1111-0000-0000-000000000001','trop tard')$q$, 'row-level security');
select tests.expect_val('plan expiré: B ne lit plus les fichiers de A', 'authenticated', :B::uuid, 'b@test.dev',
  $q$select count(*) from storage.objects where name = 'aaaaaaaa-0000-0000-0000-00000000000a/team/partage.csv'$q$, '0');
select tests.expect_val('plan expiré: les données de A restent intactes', 'authenticated', :A::uuid, 'a@test.dev',
  $q$select count(*) from public.datasets where id = 'aaaaaaaa-2222-0000-0000-000000000001'$q$, '1');
update public.subscriptions set current_period_end = now() + interval '20 days'
 where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
select tests.expect_val('renouvellement: B revoit le projet de A', 'authenticated', :B::uuid, 'b@test.dev',
  $q$select count(*) from public.projects where id = 'aaaaaaaa-1111-0000-0000-000000000001'$q$, '1');

-- ----- Retrait, départ, refus -----
select tests.expect_rows('légitime: A retire B', 'authenticated', :A::uuid, 'a@test.dev',
  $q$delete from public.team_members where lower(member_email) = 'b@test.dev'$q$, 1);
select tests.expect_val('B retiré: plus d''accès immédiatement', 'authenticated', :B::uuid, 'b@test.dev',
  $q$select count(*) from public.projects where id = 'aaaaaaaa-1111-0000-0000-000000000001'$q$, '0');
select tests.expect_rows('légitime: C quitte l''équipe', 'authenticated', :C::uuid, 'c@test.dev',
  $q$delete from public.team_members where member_id = 'cccccccc-0000-0000-0000-00000000000c'$q$, 1);
select tests.expect_val('C parti: plus d''accès', 'authenticated', :C::uuid, 'c@test.dev',
  $q$select count(*) from public.datasets where id = 'aaaaaaaa-2222-0000-0000-000000000001'$q$, '0');
select tests.expect_ok('A réinvite B', 'authenticated', :A::uuid, 'a@test.dev',
  $q$insert into public.team_members (member_email, role) values ('b@test.dev','viewer')$q$);
select tests.expect_ok('B refuse l''invitation', 'authenticated', :B::uuid, 'b@test.dev',
  format($q$select public.decline_team_invitation(%L)$q$, (select id from public.team_members where lower(member_email) = 'b@test.dev')));
select tests.expect_val('invitation refusée: ligne supprimée', 'postgres', null, null,
  $q$select count(*) from public.team_members where lower(member_email) = 'b@test.dev'$q$, '0');

-- ----- Suppression de compte : l'équipe suit -----
delete from auth.users where id = 'cccccccc-0000-0000-0000-00000000000c';
select tests.expect_val('compte d''un membre supprimé: aucune ligne orpheline', 'postgres', null, null,
  $q$select count(*) from public.team_members where member_id = 'cccccccc-0000-0000-0000-00000000000c'$q$, '0');
select tests.expect_val('compte supprimé: ses créations chez A restent (created_by vidé)', 'postgres', null, null,
  $q$select (count(*) = 1 and bool_and(created_by is null))::text from public.datasets where name = 'ds par C'$q$, 'true');

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
