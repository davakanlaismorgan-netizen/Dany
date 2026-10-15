# AutoML (réel, version « échantillon »)

Le bouton « Entraîner un nouveau modèle » (onglet Modèles) appelle la fonction `run-automl`, qui lit le fichier **stocké**,
entraîne plusieurs algorithmes **écrits en TypeScript** (aucun service externe) et enregistre le modèle avec ses vraies mesures.

## Ce qui est calculé

- **Préparation** : cible renseignée uniquement ; colonnes numériques (valeurs vides remplacées par la médiane de l'entraînement) ;
  colonnes texte encodées (8 catégories les plus fréquentes) ; colonnes ignorées et signalées : trop vides (> 60 %), constantes,
  ressemblant à un identifiant, au-delà de 60 variables.
- **Algorithmes** : régression linéaire / logistique, arbre de décision, forêt aléatoire.
- **Évaluation honnête** : validation croisée (3 ou 5 plis, stratifiée en classification). Toutes les mesures portent sur des lignes
  **écartées de l'entraînement**. Une **référence** (toujours la classe la plus fréquente / la moyenne) est affichée à côté : si aucun
  modèle ne la bat, le résultat est « baseline » et l'écran le dit.
- **Mesures** : classification → exactitude, F1/précision/rappel (macro) ; régression → RMSE, MAE, R².
- **Importance des variables** : calculée sur le modèle final, agrégée par colonne d'origine, somme = 100 %.
- Graine fixe (42) : relancer donne le même résultat.

## Plans

| | Gratuit | Premium |
|---|---|---|
| Modèles évalués | 3 types, réglages par défaut | 3 types puis réglages supplémentaires (pénalités, profondeurs, tailles de forêt) tant que le budget de temps le permet |

Le plan est lu **côté serveur** (abonnement actif et non expiré du propriétaire de l'espace de travail) : le navigateur ne peut pas le choisir.

## Limites (volontaires, à connaître)

- Une fonction Supabase est interrompue après **2 s de CPU** (tous plans). L'entraînement porte donc sur un **échantillon aléatoire de
  1 000 lignes maximum** (reproductible ; « entraîné sur un échantillon de N lignes sur M » est affiché) avec un budget de temps :
  les réglages non testés faute de temps sont signalés. Sur un serveur plus lent, Premium se rapproche du plan gratuit.
- Fichier source ≤ 5 Mo et 100 000 lignes ; au-delà, réduire d'abord avec un pipeline (filtre, choix de colonnes).
- Classification : 20 classes maximum. Régression : cible entièrement numérique. Au moins 30 lignes renseignées.
- Cette version **évalue et explique** : le modèle entraîné n'est pas conservé, il n'y a pas encore de prédiction sur de nouvelles données.
- Pas de séries temporelles, NLP, clustering ni détection d'anomalies (retirés du formulaire).
- Pour un « AutoML complet » sur de gros volumes, les options sont : calcul en plusieurs requêtes (migration de suivi de tâches) ou
  service Python séparé. Décision à prendre si les limites ci-dessus deviennent gênantes.

## Sécurité

- Droits : propriétaire ou éditeur actif (même réponse « introuvable » sinon) ; le jeu de données doit être analysé.
- Migration `20261015120000_models_server_written.sql` : le client ne peut plus insérer ni modifier les métriques, l'importance, le statut
  ni l'algorithme (seulement renommer / supprimer) ; seul `service_role` écrit un modèle. Retour arrière manuel :
  `supabase/rollback/20261015120000_models_server_written.down.sql`.
- Les anciens modèles de démonstration éventuels restent affichés (leurs données n'ont pas été modifiées).

## Déploiement

```bash
npx supabase db push
npx supabase functions deploy run-automl --use-api
```
