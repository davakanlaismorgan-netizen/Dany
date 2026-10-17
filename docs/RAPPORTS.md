# Rapports, exports et marque blanche (réels)

L'onglet **Rapports** appelle la fonction `generate-report`. Le fichier est produit **par le serveur**, à partir des données
réellement enregistrées pour le projet (jeux de données profilés, modèles évalués, pipelines, visualisations), puis stocké dans le
bucket privé `reports` sous `<propriétaire>/<id>.pdf|csv`. Le navigateur ne reçoit qu'un **lien signé de 5 minutes**.

## Modèles

| Modèle | Format | Contenu |
|---|---|---|
| Synthèse exécutive | PDF | chiffres clés, meilleur modèle (mesures + référence naïve + 5 variables principales), constats automatiques |
| Analyse détaillée | PDF | idem + colonnes de chaque jeu de données (type, manquants, valeurs distinctes), modèles comparés, pipelines, visualisations |
| Synthèse des modèles | CSV | une ligne par modèle et toutes ses mesures ; UTF-8 avec BOM, `;` en français / `,` en anglais (Excel), formules neutralisées |

Les **constats automatiques** sont des règles fixes appliquées aux chiffres : colonne avec plus de 20 % de valeurs manquantes, lignes
mal formées, modèle qui ne bat pas nettement la référence, R² < 0,3, variable la plus influente. Rien n'est rédigé par un modèle de langage.

## Marque : DAS ou la vôtre

| Plan du propriétaire | En-tête / pied de page |
|---|---|
| Gratuit | marque **DAS** |
| Premium | **nom de l'organisation** (champ « Organisation » de Paramètres) et **logo** facultatif ; aucune mention de DAS (métadonnées du PDF comprises) |

- La marque est décidée **par le serveur** d'après le plan *effectif* du propriétaire (abonnement actif et non expiré). Le navigateur
  n'envoie ni marque ni plan ; en cas d'erreur de lecture du plan, la génération échoue plutôt que d'appliquer la marque Premium.
- Premium **sans nom d'organisation** : le rapport garde la marque DAS et l'écran invite à renseigner le nom.
- Quand un abonnement Premium expire, les **nouveaux** rapports repassent en marque DAS ; les rapports déjà générés ne changent pas.
- Équipe : un éditeur peut générer un rapport dans l'espace du propriétaire ; il porte la marque du **propriétaire**. Seul le propriétaire
  règle le logo (politique de stockage `reports_brand_owner_only`).
- Logo : PNG, JPEG ou WebP (2 Mo max) converti dans le navigateur en JPEG sur fond blanc, 480 × 160 px max, ≤ 300 Ko, stocké dans
  `<propriétaire>/brand/logo.jpg`. Le serveur n'accepte que du JPEG valide (gris ou RVB, 8 bits) et ignore tout autre fichier.

## Limites (volontaires, à connaître)

- 20 rapports par heure et par propriétaire (protection du stockage).
- Polices PDF standard (Helvetica) : les caractères hors Latin-1 / cp1252 (alphabets non latins, emojis) sont remplacés par « ? ».
- Pas de graphiques sur les données brutes dans le PDF (seulement des barres d'importance des variables) ; pas de format PowerPoint ni Word.
- Pas de livraison par e-mail ni WhatsApp, pas de rapports planifiés : retirés de l'écran tant qu'ils n'existent pas (voir « notifications e-mail »
  dans la feuille de route).
- Les anciens rapports « de démonstration » éventuels (sans fichier) sont signalés « Fichier indisponible » et peuvent être supprimés.
- Temps de génération mesuré en local : environ 1,5 ms par rapport détaillé (limite Supabase : 2 s de CPU) ; non mesuré sur un vrai projet Supabase.

## Sécurité

- Migration `20261017090000_reports_server_written.sql` : le client ne peut plus insérer ni modifier `file_url`, `status`, `config`
  (seulement renommer / supprimer) ; seul `service_role` écrit un rapport. Retour arrière manuel :
  `supabase/rollback/20261017090000_reports_server_written.down.sql`.
- Même réponse « introuvable » pour un projet inexistant ou inaccessible. Autorisé : propriétaire ou éditeur actif.
- Le bucket `reports` reste privé ; la lecture passe par les politiques de dossier existantes (propriétaire et équipe).

## Déploiement

```bash
npx supabase db push
npx supabase functions deploy generate-report --use-api
```

Aucun nouveau secret : la fonction utilise `ALLOWED_ORIGINS` et les clés Supabase déjà présentes.

## Recette à faire sur le vrai projet

1. Compte **gratuit** : onglet Rapports → générer un PDF détaillé → ouvrir : bandeau et pied de page « DAS ».
2. Compte **Premium** : renseigner « Organisation » dans Paramètres, ajouter un logo, régénérer : votre nom et votre logo, plus de « DAS ».
3. Générer le CSV et l'ouvrir dans Excel (accents corrects, une ligne par modèle).
4. Avec un éditeur invité : il génère un rapport ; vérifier la marque du propriétaire et qu'il ne peut pas changer le logo.
5. Supprimer un rapport : la ligne et le fichier disparaissent.
