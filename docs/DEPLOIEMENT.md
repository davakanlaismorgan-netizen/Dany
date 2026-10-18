# DAS — Guide de mise en service

Prérequis : Node.js 22 ou plus (24 recommandé ; Node 20 n'est plus supporté depuis le 30 avril 2026).

Ce guide remplace l'hébergement géré par Bolt : votre propre Supabase (base, auth, fichiers, fonctions),
Vercel pour le site, KKiaPay pour les paiements. Comptez environ une heure la première fois.

Architecture : le navigateur parle à Supabase (RLS) ; les paiements passent par deux fonctions serveur
(`verify-kkiapay`, `kkiapay-webhook`) qui sont les **seules** à pouvoir activer un abonnement.

## 1. Supabase

1. Créez un projet sur supabase.com. Notez l'**URL**, la clé **anon** et la **référence du projet**
   (Project Settings > API / General). La clé `service_role` ne va jamais dans le front ni dans Vercel.
2. Appliquez le schéma (4 commandes, depuis ce dépôt, Node 20+) :
   ```bash
   npx supabase login
   npx supabase link --project-ref <REFERENCE>
   npx supabase db push
   ```
   Vérifiez dans le Table Editor que les tables `profiles`, `subscriptions`, `payments`… existent et que
   les buckets `datasets`, `avatars`, `reports` sont créés (Storage).
3. **Authentication > URL Configuration** :
   - Site URL : `https://<votre-domaine>`
   - Redirect URLs : `https://<votre-domaine>/dashboard`, `https://<votre-domaine>/auth/reset-password`,
     et `http://localhost:5173/**` pour le développement.
4. **Authentication** : conservez la confirmation d'email activée, fixez la longueur minimale du mot de
   passe à 8, et configurez un **SMTP personnalisé** pour la production (le service d'email par défaut de
   Supabase est limité et ne convient pas à de vrais utilisateurs).
5. Secrets des fonctions (valeurs KKiaPay à l'étape 2) :
   ```bash
   npx supabase secrets set \
     KKIAPAY_PUBLIC_KEY=... KKIAPAY_PRIVATE_KEY=... KKIAPAY_SECRET_KEY=... \
     KKIAPAY_WEBHOOK_SECRET=<une longue valeur aléatoire que vous choisissez> \
     KKIAPAY_SANDBOX=true \
     ALLOWED_ORIGINS=https://<votre-domaine>,http://localhost:5173
   npx supabase functions deploy verify-kkiapay
   npx supabase functions deploy kkiapay-webhook --no-verify-jwt
   npx supabase functions deploy delete-account
   npx supabase functions deploy process-dataset
   ```

## 2. KKiaPay

1. Dans le tableau de bord KKiaPay, récupérez les clés **publique, privée et secrète** (celles du mode
   test d'abord).
2. Webhook : URL `https://<REFERENCE>.supabase.co/functions/v1/kkiapay-webhook`, avec comme « secret hash »
   exactement la valeur de `KKIAPAY_WEBHOOK_SECRET`.
3. Testez entièrement en bac à sable avant de passer en production (étape 5).

## 3. Vercel

1. *Add New > Project*, importez le dépôt GitHub. Vercel détecte Vite ; `vercel.json` gère le routage
   (sans lui, rafraîchir `/dashboard` renverrait une erreur 404).
2. Variables d'environnement (voir `.env.example`) : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `VITE_KKIAPAY_PUBLIC_KEY`, `VITE_KKIAPAY_SANDBOX=true`, `VITE_CONTACT_EMAIL`.
3. Déployez. Les variables `VITE_` sont figées à la compilation : toute modification demande un redéploiement.
4. Quand le domaine est connu, mettez à jour `ALLOWED_ORIGINS` (secrets Supabase) et les URL de l'étape 1.3.

## 4. Recette (à faire en bac à sable, dans l'ordre)

- Inscription, clic sur le lien de confirmation reçu par email, connexion.
- « Mot de passe oublié » : email reçu, nouveau mot de passe accepté.
- Plan gratuit : le 4e projet est refusé avec un message clair.
- Paiement Premium (bac à sable) : le plan passe à Premium avec une date de fin ; le 4e projet est accepté.
- Fermez l'onglet juste après avoir payé : le plan doit quand même s'activer (webhook).
- Page Tarifs déconnecté : le bouton de paiement renvoie vers la connexion.
- Suppression du compte : le compte et ses fichiers disparaissent.

## 5. Passage en production

1. Remplacez les clés KKiaPay par celles de production (`supabase secrets set ...`).
2. Retirez `KKIAPAY_SANDBOX` (ou mettez `false`) côté Supabase, et mettez `VITE_KKIAPAY_SANDBOX=false` côté Vercel.
3. Redéployez le site. Les transactions de test et de production sont enregistrées sous des fournisseurs
   distincts (`kkiapay-sandbox` / `kkiapay`) et ne peuvent pas se mélanger.

## 6. Exploitation

Accorder le plan Entreprise à un client (SQL Editor de Supabase) :
```sql
update public.subscriptions
   set plan = 'enterprise', status = 'active', current_period_end = null
 where user_id = (select id from auth.users where email = 'client@exemple.com');
```
Voir les paiements : `select * from public.payments order by created_at desc;`

## 7. Tests

```bash
# Fonctions serveur (Deno 2) : logique de paiement, webhook, suppression de compte
cd supabase/functions && deno test --no-prompt -A

# Sécurité de la base (PostgreSQL 16 local) : tentatives d'attaque qui doivent toutes échouer
psql -d <base_vide> -f supabase/tests/local-stubs.sql
psql -d <base_vide> -f supabase/migrations/20261005090000_das_init.sql
psql -d <base_vide> -v ON_ERROR_STOP=1 -f supabase/tests/security.test.sql
```
`local-stubs.sql` simule Supabase sur un PostgreSQL ordinaire : ne l'exécutez jamais sur un vrai projet.
La CI exécute ces deux suites à chaque pull request.

## Équipe

Collaboration Premium / Entreprise : voir `docs/EQUIPE.md` (droits, mise en service, recette, retour arrière).

## 8. Limites connues

- L'**assistant IA** est réel, avec la clé API de l'utilisateur (`docs/ASSISTANT.md`, secret `AI_KEY_ENCRYPTION_SECRET` à créer).
  Les **pipelines** (`docs/PIPELINES.md`), l'**AutoML** (`docs/AUTOML.md`, entraînement sur un échantillon de 1 000 lignes)
  et les **rapports PDF/CSV à votre marque** (`docs/RAPPORTS.md`) sont réels.
- Les moyens de paiement et les compteurs d'usage affichés dans Paramètres > Facturation sont des valeurs d'exemple.
- La limite de 10 000 lignes du plan gratuit s'appuie sur le nombre de lignes déclaré par le navigateur.
- Pas de politique CSP : à ajouter après un test avec le widget KKiaPay.
- Aucun test automatisé de l'interface.

## Pages légales

Les pages `/legal/terms`, `/legal/privacy` et `/legal/notice` sont des **textes de travail** et affichent un bandeau « version provisoire ». Renseignez `VITE_COMPANY_NAME`, `VITE_COMPANY_ADDRESS`, `VITE_COMPANY_REGISTRATION`, `VITE_CONTACT_EMAIL`, faites relire les textes par un juriste, puis passez `VITE_LEGAL_REVIEWED=true` (le build refuse si l'identité est incomplète). L'acceptation des CGU est horodatée côté base (`profiles.terms_accepted_at`).

## Import de données (fonction `process-dataset`)

Le navigateur envoie le fichier (CSV ou JSON, 50 Mo max) dans Storage puis appelle `process-dataset`, qui lit le fichier **stocké**, compte les lignes et calcule le profil des colonnes. Le client ne peut pas écrire `row_count`, `profiling` ni `status` (droits de colonnes dans la migration `20261007090000`) : la limite de 10 000 lignes du plan gratuit n'est donc pas contournable. Au-delà de 10 000 lignes en plan gratuit, la ligne et le fichier sont supprimés et l'utilisateur voit un message clair. Limite de traitement : 500 000 lignes / 500 colonnes. **Non testé sur un vrai projet Supabase** : surveillez le temps CPU de la fonction avec un gros fichier avant de promettre cette taille. Les fichiers Excel ne sont pas pris en charge (exporter en CSV).

## Sécurité et exploitation (à faire côté Supabase / Vercel / GitHub)

**En-têtes** (`vercel.json`) : HSTS, nosniff, anti-clickjacking, et une **Content-Security-Policy en mode rapport seulement** (`Content-Security-Policy-Report-Only`). Elle n'a pas pu être testée avec le widget KKiaPay réel : déployez, ouvrez la console du navigateur sur Tarifs > Payer, notez les violations signalées (domaines KKiaPay manquants, etc.), ajustez `vercel.json`, puis renommez l'en-tête en `Content-Security-Policy` pour l'appliquer.

**Suivi des erreurs** : renseignez `VITE_ERROR_ENDPOINT` (URL HTTPS d'un collecteur JSON : tunnel Sentry, petite fonction à vous…). Chaque erreur inattendue est envoyée (au plus 5/minute, dédupliquée, sans email ni contenu de fichier). Sans cette variable, les erreurs restent dans la console du navigateur uniquement.

**Environnements** : créez **deux projets Supabase** (staging et production) et deux jeux de variables Vercel (Preview = staging, Production = prod). Ne partagez jamais les clés KKiaPay sandbox/live ni la clé `service_role` entre eux.

**Sauvegardes** : le plan gratuit Supabase n'inclut pas de sauvegardes restaurables ; activez les sauvegardes quotidiennes (plan Pro) avant d'accepter de vrais paiements, et exportez périodiquement avec `pg_dump`. Testez une restauration une fois.

**GitHub** : Settings > Branches > règle sur `main` : PR obligatoire, les 3 jobs de CI (web, edge-functions, database) requis, pas de push direct. Activez Dependabot alerts et secret scanning.

**Auth Supabase** : Authentication > URL Configuration (Site URL = votre domaine, Redirect URLs = `/auth/reset-password`), Providers > Email : confirmation d'email activée, SMTP personnalisé (le SMTP intégré est limité à quelques emails par heure), longueur minimale du mot de passe, protection contre les mots de passe fuités.
