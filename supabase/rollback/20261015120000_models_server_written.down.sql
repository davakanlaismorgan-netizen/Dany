-- RETOUR ARRIÈRE de 20261015120000_models_server_written.sql.
-- À exécuter à la main (SQL Editor de Supabase, ou psql) : ce dossier n'est PAS lu par « supabase db push ».
-- Effet : le client peut de nouveau insérer et modifier tous les champs de `models`
-- (les métriques redeviennent falsifiables). Aucune donnée n'est touchée.

grant insert, update on public.models to authenticated;
