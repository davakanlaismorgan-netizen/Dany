-- Les métadonnées d'un dataset (nombre de lignes/colonnes, profil, statut) sont calculées par le
-- SERVEUR (edge function process-dataset, rôle service_role) à partir du fichier réellement stocké.
-- Le client ne peut plus les écrire : la limite de 10 000 lignes du plan gratuit n'est plus
-- contournable en mentant sur row_count.

revoke insert, update on public.datasets from authenticated;
grant insert (project_id, name, source_type, source_config, size_bytes) on public.datasets to authenticated;
grant update (name) on public.datasets to authenticated;

grant select, insert, update, delete on public.datasets to service_role;
