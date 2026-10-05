// Prix du plan Premium en FCFA (XOF), paiement mensuel via KKiaPay.
// À garder identique à PLAN_PRICES_XOF dans supabase/functions/_shared/kkiapay.ts :
// c'est le serveur qui fait foi (le plan est déduit du montant réellement payé).
export const PREMIUM_PRICE_XOF = 17900;

export function formatXof(amount: number, lang: 'fr' | 'en'): string {
  return `${new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US').format(amount)} FCFA`;
}
