-- RETOUR ARRIÈRE de 20261017090000_reports_server_written.sql.
-- À exécuter à la main (SQL Editor de Supabase, ou psql) : ce dossier n'est PAS lu par « supabase db push ».
-- Effet : le client peut de nouveau écrire tous les champs de `reports` ; un éditeur peut de nouveau remplacer
-- le logo de son propriétaire. Aucune donnée n'est touchée.

grant insert, update on public.reports to authenticated;
drop policy if exists "reports_brand_owner_only" on storage.objects;
