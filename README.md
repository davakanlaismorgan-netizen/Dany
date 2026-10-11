# DAS

Plateforme de data science : projets, jeux de données, pipelines, modèles, visualisations, rapports.
Front : Vite + React 18 + TypeScript + Tailwind. Backend : Supabase (Postgres + RLS, Auth, Storage, Edge Functions).
Paiement : KKiaPay (mobile money et carte, en FCFA). Hébergement : Vercel.

**Mise en service complète : [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md).**

## Démarrage local

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

## Organisation

- `src/` : application React (pages, composants, hooks, contextes)
- `supabase/migrations/` : schéma de la base, à appliquer avec `supabase db push`
- `supabase/functions/` : fonctions serveur (`verify-kkiapay`, `kkiapay-webhook`, `delete-account`)
- `supabase/tests/` : tests de sécurité de la base ; `supabase/functions/**/*.test.ts` : tests des fonctions
- `docs/DEPLOIEMENT.md` : guide Supabase, KKiaPay, Vercel

## Principes de sécurité

- Un utilisateur ne peut jamais écrire son propre abonnement ni ses paiements : seules les fonctions serveur
  (clé `service_role`) activent un plan, à partir du montant réellement payé chez KKiaPay.
- Une transaction KKiaPay ne peut servir qu'une seule fois (contrainte d'unicité en base).
- Aucune clé secrète dans le dépôt ni dans les variables `VITE_` : celles-ci sont publiques.

## Intégration continue

Chaque pull request exécute lint, typecheck, build, les tests des fonctions (Deno) et les tests de sécurité
de la base (PostgreSQL 16) : `.github/workflows/ci.yml`.
