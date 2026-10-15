# Maintenance et dette technique connue

## Dépendances
Mises à jour compatibles appliquées (`npm update`). **Montées de version majeures volontairement non incluses** : chacune doit être une PR séparée, testée seule (la CI et les 68+ tests servent de filet) :

| Paquet | Actuel → dernier | Remarque |
|---|---|---|
| vite / @vitejs/plugin-react / vitest | 5 → 8 / 4 → 6 / 3 → 5 | à faire ensemble |
| react / react-dom / @types | 18 → 19 | vérifier recharts et lucide |
| tailwindcss | 3 → 4 | migration de configuration |
| eslint / @eslint/js / typescript | 9 → 10 / 5.6 → 7 | |
| lucide-react | 0.446 → 1.x | icônes renommées possibles |

`npm audit` signale 3 vulnérabilités « high » **uniquement via `kkiapay` → `rollup-plugin-terser` → `serialize-javascript`** : ce sont des outils de *build* embarqués comme dépendances du SDK KKiaPay, absents du bundle navigateur. Le correctif proposé (`kkiapay@1.0.8`) est un changement cassant à tester avec le widget réel. À surveiller, non exploitable à l'exécution d'après l'analyse du chemin de dépendances (non vérifiée par un test d'exploitation).

## Code
- `SettingsPage.tsx` (~560 lignes) reste à découper en un composant par onglet.
- Les fonctionnalités de démonstration (assistant, AutoML, rapports) écrivent encore des lignes simulées en base ; elles sont signalées « Démonstration » mais restent à implémenter ou retirer (décision produit).
- Excel (.xlsx) non pris en charge à l'import (CSV/JSON uniquement).
- Le traitement serveur des fichiers n'a pas été éprouvé sur de gros fichiers avec les limites réelles d'une edge function Supabase.
