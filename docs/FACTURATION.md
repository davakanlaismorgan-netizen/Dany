# Facturation : exploitation

Paiement **ponctuel d'un mois** (17 900 FCFA), sans renouvellement automatique. L'accès Premium est accordé uniquement par `activate_plan`, appelée par les fonctions `verify-kkiapay` (retour navigateur) et `kkiapay-webhook` (serveur à serveur) après vérification auprès de KKiaPay.

## Tester en sandbox (avant la production)
1. Secrets de la fonction : `KKIAPAY_SANDBOX=true` + clés **sandbox** ; front : `VITE_KKIAPAY_SANDBOX=true` + clé publique sandbox.
2. Payer avec un numéro de test fourni par KKiaPay (voir leur documentation sandbox).
3. Vérifier : bandeau « Premium activé » ; ligne dans Paramètres > Facturation (référence suffixée « (test) ») ; `select * from payments;` avec `provider = 'kkiapay-sandbox'`.
4. Rejouer la même référence depuis un autre compte : doit afficher « déjà utilisée ».
5. Repasser en production : `KKIAPAY_SANDBOX` absent ou `false`, clés live, `VITE_KKIAPAY_SANDBOX=false`, puis redéployer fonctions **et** front.

## Rembourser un client
1. Rembourser dans le tableau de bord KKiaPay.
2. Dans le SQL Editor Supabase : `select public.revoke_payment('kkiapay', '<ID_TRANSACTION>');`
   - retire un mois d'accès ; si l'échéance est dépassée, le compte repasse immédiatement en gratuit ;
   - idempotent (un second appel ne retire rien de plus) ; les données de l'utilisateur sont conservées ;
   - la ligne de paiement reste (comptabilité) avec `refunded_at` renseigné et apparaît « Remboursé » chez le client.
3. Prévenir le client par email.

## Limitation de débit
`verify-kkiapay` accepte 10 tentatives par utilisateur et par 10 minutes (HTTP 429 ensuite). Si la base est indisponible, la fonction refuse (échec fermé).

## Non couvert
Pas de reçus automatiques, ni de rappel d'expiration par email (nécessite un fournisseur d'emails/SMTP : décision à prendre). La politique de remboursement des CGU est un texte de travail à valider.
