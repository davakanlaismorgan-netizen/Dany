# Équipe : collaboration entre comptes

Fonction du plan **Premium** (jusqu'à 10 membres) et **Entreprise** (illimité). Le propriétaire invite des collègues
par e-mail ; chacun reçoit un rôle.

| | `viewer` | `editor` | propriétaire |
|---|---|---|---|
| Voir projets, jeux de données, pipelines, modèles, visualisations, rapports et fichiers | oui | oui | oui |
| Ajouter / modifier du contenu dans un projet **existant** (import, visualisation…) | non | oui | oui |
| Créer, renommer, supprimer un projet | non | non | oui |
| Gérer les membres, la facturation, supprimer le compte | non | non | oui |
| Voir profil, paiements, abonnement, notifications, conversations du propriétaire | non | non | oui |

Règles imposées **par la base** (RLS, fonctions SQL, triggers) ; l'interface ne fait qu'adapter l'affichage :
- Le propriétaire n'écrit que l'e-mail et le rôle. `status`, `member_id` et `accepted_at` ne changent que par les
  fonctions `accept_team_invitation`, `decline_team_invitation` (et la suppression de la ligne pour quitter / retirer).
- L'acceptation exige un **e-mail confirmé** correspondant à l'invitation (sinon on pourrait créer un compte avec
  l'adresse d'un invité et prendre sa place).
- Si le plan du propriétaire expire, les membres perdent l'accès immédiatement (données conservées) ; il revient au
  renouvellement.
- Les lignes créées par un éditeur appartiennent au propriétaire (`user_id`), l'auteur réel est dans `created_by`.
- Compteurs et limites du plan gratuit, export des données personnelles : calculés sur **ses propres** lignes uniquement.

## Mise en service

1. Relire la PR, puis appliquer la migration : `npx supabase db push` (fichier `20261013090000_team_collaboration.sql`,
   non destructif, rejouable).
2. Redéployer la fonction qui accepte maintenant les éditeurs : `npx supabase functions deploy process-dataset`.
3. Redéployer le site (Vercel le fait à la fusion).

## Recette à faire sur le vrai projet (2 comptes, A en Premium, B quelconque, e-mails confirmés)

1. A (Paramètres > Équipe) invite l'e-mail de B en `viewer`. Un compte gratuit voit la proposition de passer à Premium.
2. B se connecte : « Invitations reçues » apparaît ; B accepte. Le projet de A apparaît dans « Partagés avec moi ».
3. B (viewer) ouvre le projet : tout est lisible, aucun bouton d'import / suppression, pas de réglages du projet.
4. A passe B en `editor` : B importe un CSV dans le projet de A. Le jeu de données apparaît chez A, `created_by` = B.
5. B ne voit ni les paiements, ni l'abonnement, ni les notifications de A. Le tableau de bord de B ne compte que ses projets.
6. A retire B : B perd l'accès immédiatement (recharger la page).
7. Invitez 10 personnes : la 11e est refusée avec un message clair (Premium).

## Retour arrière

`supabase/rollback/20261013090000_team_collaboration.down.sql` (à exécuter à la main dans le SQL Editor ; ce dossier n'est
pas lu par `db push`) : supprime déclencheurs et fonctions d'équipe et remet les politiques d'origine. Vérifié : après
retour arrière, politiques, droits, fonctions et déclencheurs sont identiques à une base sans la migration d'équipe ;
seules restent les colonnes ajoutées (`member_id`, `accepted_at`, `created_by`), sans effet. Les membres perdent l'accès.

## Limites connues

- **Aucun e-mail d'invitation** n'est envoyé (il faut un SMTP configuré) : le propriétaire prévient son collègue, qui voit
  l'invitation dans Paramètres > Équipe après s'être connecté avec l'adresse invitée.
- Un éditeur ne peut pas créer de projet dans l'espace du propriétaire (il faudrait un sélecteur d'espace de travail).
- Le journal d'activité reste individuel : les actions d'un éditeur sont tracées sous son propre compte.
- Les tests de sécurité tournent sur un PostgreSQL local qui simule Supabase (voir `supabase/tests/`) ; ils n'ont pas été
  exécutés sur un vrai projet Supabase.
