# Pipelines no-code (réels)

Chaque bloc applique une vraie opération sur le fichier stocké ; le résultat devient un **nouveau jeu de données**
du projet (onglet Données). Le calcul se fait côté serveur, dans la fonction `run-pipeline`.

| Bloc | Réglages | Effet |
|---|---|---|
| Source de données | jeu de données du projet (analysé) | lit le fichier CSV/JSON stocké |
| Filtrer les lignes | colonne, condition (`=`, `≠`, `>`, `≥`, `<`, `≤`, contient, vide, non vide), valeur | garde les lignes qui correspondent (nombres comparés comme nombres) |
| Choisir des colonnes | colonnes à garder (l'ordre est conservé) | supprime les autres |
| Supprimer les doublons | colonnes de comparaison (aucune = toutes) | garde la première ligne de chaque groupe |
| Remplir les valeurs vides | colonne, remplacement (moyenne, médiane, valeur fréquente, valeur fixe, supprimer la ligne) | moyenne et médiane exigent une colonne 100 % numérique |
| Agréger | regrouper par, calculs (nombre, somme, moyenne, min, max) | une ligne par groupe ; les cellules vides sont ignorées |
| Joindre | entrée gauche/droite, clés, interne ou gauche | colonnes de gauche puis de droite (sans la clé de droite) |
| Jeu de données résultat | nom | exactement un par pipeline ; crée le jeu de données |

## Règles

- Le serveur exécute le pipeline **enregistré en base**, jamais un graphe envoyé par le navigateur (le bouton « Exécuter » enregistre d'abord).
- Droits : propriétaire ou éditeur actif de l'équipe ; un lecteur voit le pipeline mais ne peut ni le modifier ni l'exécuter (même réponse `not_found` pour un inconnu).
- Une source doit appartenir au **même propriétaire et au même projet** que le pipeline et être déjà analysée.
- Limites : 30 blocs, 500 000 lignes, 500 colonnes. Plan gratuit : le résultat est soumis à la limite de 10 000 lignes (refus clair, rien n'est conservé).
- Un résultat sans ligne est refusé (`empty_result`). Chaque erreur désigne le bloc fautif (surligné dans l'écran).
- Le résultat est un fichier CSV (UTF-8) déposé dans `<propriétaire>/<projet>/…` ; son profil est recalculé par le même code que l'import.
- Pas de migration SQL : la fonction utilise les tables `pipelines` / `datasets` existantes (`pipelines.status` : `draft`, `completed`, `failed`).

## Déploiement

```bash
npx supabase functions deploy run-pipeline --use-api
```

(les secrets existants suffisent : `ALLOWED_ORIGINS`, clés Supabase injectées automatiquement). Les anciens pipelines de démonstration
(types `csv_import`, `clean`, `automl`…) sont ignorés au chargement : recréez-les avec les nouveaux blocs.

## Hors périmètre (volontairement)

Pas de bloc de modélisation ici : l'entraînement de modèles est la PR « AutoML réel ». Pas d'exécution planifiée ni de blocs Excel / API / base de données.
