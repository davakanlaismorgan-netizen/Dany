// Prix du plan Premium en FCFA (XOF), paiement mensuel via KKiaPay.
// À garder identique à PLAN_PRICES_XOF dans supabase/functions/_shared/kkiapay.ts :
// c'est le serveur qui fait foi (le plan est déduit du montant réellement payé).
export const PREMIUM_PRICE_XOF = 17900;

export function formatXof(amount: number, lang: 'fr' | 'en'): string {
  return `${new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US').format(amount)} FCFA`;
}

// Limites du plan gratuit. À garder identiques à enforce_plan_limits() dans la migration SQL
// (c'est la base qui fait foi ; un test vérifie la cohérence).
export const FREE_LIMITS = { projects: 3, visualizations: 5, rows: 10000 } as const;
