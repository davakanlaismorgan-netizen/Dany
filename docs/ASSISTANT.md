# Assistant IA (DAS IA)

L'assistant répond avec **la clé API de l'utilisateur** (Anthropic ou OpenAI) : le coût des réponses est facturé par son
fournisseur, pas par DAS. Le navigateur ne parle jamais à un fournisseur : tout passe par deux fonctions serveur.

## Ce qui est réel, ce qui ne l'est pas

- Les **chiffres sont calculés par notre code** (`_shared/facts.ts`) sur le fichier réellement stocké : lignes, valeurs
  manquantes, moyenne, écart-type, min, médiane, max, valeurs les plus fréquentes, résultats des modèles AutoML, nombre de
  pipelines et de visualisations. Le LLM reçoit ces faits avec la consigne de ne rien recalculer ni inventer ; il les commente.
- Le LLM **ne reçoit jamais les lignes brutes**. Les colonnes de texte à forte diversité (plus de 20 valeurs distinctes :
  noms, téléphones, identifiants) ne transmettent que le nombre de valeurs distinctes, pas les valeurs.
- Limites : fichier jusqu'à 5 Mo et 50 000 lignes pour le calcul des statistiques (au-delà, l'assistant le dit et se limite
  au profil du jeu de données) ; 30 premières colonnes. Une réponse de LLM peut rester fausse : l'écran le rappelle.
- L'historique envoyé au LLM vient de la base (jamais du navigateur) : on ne peut pas le falsifier.

## Clé de l'utilisateur

- `ai-key` vérifie la clé auprès du fournisseur (appel de liste des modèles, sans jetons consommés), puis la **chiffre**
  (AES-256-GCM, secret `AI_KEY_ENCRYPTION_SECRET`, liée à l'identifiant de l'utilisateur) dans `ai_provider_keys`.
- Le navigateur ne lit que le fournisseur et les 4 derniers caractères ; jamais le texte chiffré (droit de colonne SQL, testé).
- 10 essais de clé par jour et par utilisateur (pour ne pas servir à tester des clés volées).
- La clé n'est jamais journalisée ; un message d'erreur qui la contiendrait est masqué.
- Supprimer son compte supprime sa clé (cascade).

## Quotas (messages par jour et par utilisateur, jour UTC)

| Plan | Messages / jour |
|---|---|
| Gratuit | 10 |
| Premium | 200 |
| Entreprise | 1 000 |

Réservation atomique en base (`claim_ai_usage`) ; un message est **rendu** (`release_ai_usage`) si le fournisseur échoue.
Le plan lu est le plan effectif de l'appelant (`effective_plan`) ; en cas de doute, aucun message n'est traité.
Les chiffres sont dans `DAILY_LIMITS` (`supabase/functions/ai-assistant/handler.ts`).

## Mise en service (vous lancez ces commandes)

1. Créez le secret de chiffrement, **une seule fois** (le perdre rend toutes les clés enregistrées illisibles : les
   utilisateurs devront les ressaisir) :
   `npx supabase secrets set AI_KEY_ENCRYPTION_SECRET=$(openssl rand -base64 32)`
2. `npx supabase db push` (migration `20261019090000_ai_assistant.sql`, non destructive).
3. `npx supabase functions deploy ai-key --use-api` puis `npx supabase functions deploy ai-assistant --use-api`.
4. Facultatif : `AI_ANTHROPIC_MODEL` / `AI_OPENAI_MODEL` pour changer de modèle sans redéployer
   (défauts : `claude-sonnet-5-5`, `gpt-4.1-mini`).

## Recette (compte Premium avec un projet analysé)

1. DAS IA sans clé : l'écran demande la clé et ne répond rien.
2. Une clé fausse est refusée avec un message clair. Une vraie est acceptée ; seuls les 4 derniers caractères sont affichés.
3. « Résume mon jeu de données » : la réponse cite les vraies colonnes et statistiques du fichier.
4. Comparer 2-3 chiffres cités avec le fichier (Excel). Poser une question sans rapport avec les données : l'assistant ne doit pas inventer de chiffres.
5. Le compteur « messages restants » baisse ; à la limite, un message clair apparaît. Couper la clé chez le fournisseur : « clé refusée », sans message décompté.
6. Un compte sans accès au projet ne peut pas l'interroger (404).

## Retour arrière

`supabase/rollback/20261019090000_ai_assistant.down.sql` (à exécuter à la main) : supprime tables de clés et compteurs, et
rend aux conversations leur écriture côté client. Les conversations existantes sont conservées.

## Limites connues

- Pas de réponse en continu (flux) : la réponse s'affiche d'un bloc.
- L'assistant ne lance pas d'AutoML ni de pipeline : il commente les résultats déjà calculés.
- Les anciennes conversations de démonstration (réponses préenregistrées) peuvent encore apparaître dans l'historique.
- Testé avec des fournisseurs simulés ; non éprouvé en réel avec les deux fournisseurs avant votre recette.
