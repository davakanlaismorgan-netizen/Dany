# Danysia

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-sphkvpa6)

Plateforme de data science (projets, jeux de données, pipelines, modèles, visualisations, rapports).
Front : Vite + React 18 + TypeScript + Tailwind. Backend : Supabase (Postgres + RLS, Storage, Edge Functions). Paiement : KKiaPay.

## Démarrage

```bash
cp .env.example .env   # puis renseigner les valeurs
npm ci
npm run dev
```

| Commande | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement |
| `npm run build` | build de production |
| `npm run lint` | ESLint |
| `npm run typecheck` | vérification TypeScript |

## Variables d'environnement

Front (fichier `.env`, voir `.env.example`) : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_KKIAPAY_PUBLIC_KEY`, `VITE_KKIAPAY_SANDBOX`.

Edge Functions (secrets Supabase, jamais dans le dépôt) :

- `KKIAPAY_PRIVATE_KEY`, `KKIAPAY_PUBLIC_KEY`, `KKIAPAY_SECRET_KEY`
- `KKIAPAY_SANDBOX` : **doit valoir `false` en production**. Toute autre valeur (ou l'absence de la variable) fait vérifier les paiements sur l'environnement de test.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` sont fournis automatiquement par Supabase.

## Base de données

Les migrations sont dans `supabase/migrations/` et s'appliquent dans l'ordre des noms de fichiers.
Toute évolution de schéma passe par une nouvelle migration, jamais par une modification manuelle de la production.

## Intégration continue

Chaque pull request exécute lint, typecheck et build (`.github/workflows/ci.yml`).
