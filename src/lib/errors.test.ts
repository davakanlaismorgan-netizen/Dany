import { describe, expect, it } from 'vitest';
import { friendlyError } from './errors';

const t = (k: string) => `T(${k})`;

describe('friendlyError', () => {
  it('traduit les refus de limite du plan gratuit', () => {
    for (const kind of ['projects', 'rows', 'visualizations']) {
      expect(friendlyError({ message: `plan_limit:${kind}` }, 'fb', t)).toBe(`T(plan.limit.${kind})`);
    }
  });
  it("masque les erreurs de base de données (objets simples, non Error)", () => {
    expect(friendlyError({ message: 'duplicate key value violates unique constraint "x"' }, 'fb', t)).toBe('fb');
  });
  it('conserve le message des vraies Error (ex. Storage) et gère les valeurs vides', () => {
    expect(friendlyError(new Error('The object exceeded the maximum allowed size'), 'fb', t)).toBe('The object exceeded the maximum allowed size');
    expect(friendlyError(null, 'fb', t)).toBe('fb');
    expect(friendlyError(undefined, 'fb', t)).toBe('fb');
  });
});
