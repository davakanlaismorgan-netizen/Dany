-- Les modèles (algorithme, métriques, importance des variables, statut) sont calculés par le SERVEUR
-- (edge function run-automl, rôle service_role) à partir du fichier réellement stocké.
-- Le client ne peut plus les écrire : les métriques affichées ne peuvent pas être falsifiées.
-- Le client garde la lecture (RLS inchangée), la suppression et le renommage.
-- Même principe que 20261007090000_dataset_processing.sql pour les jeux de données.

revoke insert, update on public.models from authenticated;
grant update (name) on public.models to authenticated;

grant select, insert, update, delete on public.models to service_role;
