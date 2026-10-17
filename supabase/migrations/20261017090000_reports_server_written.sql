-- Les rapports sont produits par le SERVEUR (edge function generate-report, rôle service_role) à partir des données réelles
-- du projet : le fichier, son statut et sa configuration ne peuvent plus être écrits par le client.
-- Le client garde la lecture (RLS inchangée), la suppression et le renommage.
-- Même principe que 20261015120000_models_server_written.sql pour les modèles.

revoke insert, update on public.reports from authenticated;
grant update (name) on public.reports to authenticated;

grant select, insert, update, delete on public.reports to service_role;

-- Marque blanche : le logo du propriétaire est stocké dans « <id du propriétaire>/brand/ » du bucket privé « reports ».
-- Un éditeur de l'équipe peut déposer des rapports dans ce dossier racine, mais pas changer le logo de son propriétaire.
drop policy if exists "reports_brand_owner_only" on storage.objects;
create policy "reports_brand_owner_only" on storage.objects as restrictive for all to authenticated
  using (
    bucket_id <> 'reports'
    or (storage.foldername(name))[2] is distinct from 'brand'
    or (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id <> 'reports'
    or (storage.foldername(name))[2] is distinct from 'brand'
    or (storage.foldername(name))[1] = (select auth.uid())::text
  );
