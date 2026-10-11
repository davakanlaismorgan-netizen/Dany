// Messages d'erreur lisibles. Les refus de limite du plan gratuit (levés par des triggers
// SQL sous la forme « plan_limit:projects ») sont traduits ; les autres erreurs de base de
// données ne sont pas exposées telles quelles à l'utilisateur.
export function friendlyError(err: unknown, fallback: string, t: (key: string) => string): string {
  const message =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : '';
  const limit = /plan_limit:(projects|rows|visualizations)/.exec(message);
  if (limit) return t(`plan.limit.${limit[1]}`);
  return err instanceof Error && message ? message : fallback;
}
