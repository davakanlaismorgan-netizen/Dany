import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { formatXof, PREMIUM_PRICE_XOF } from './plans';

describe('prix Premium', () => {
  it('est identique côté interface et côté serveur (le serveur fait foi pour le montant encaissé)', () => {
    const server = readFileSync('supabase/functions/_shared/kkiapay.ts', 'utf8');
    const match = /PLAN_PRICES_XOF\s*=\s*\{\s*premium:\s*(\d+)/.exec(server);
    expect(match, 'PLAN_PRICES_XOF introuvable dans _shared/kkiapay.ts').not.toBeNull();
    expect(Number(match![1])).toBe(PREMIUM_PRICE_XOF);
  });

  it('formate le montant en FCFA selon la langue', () => {
    expect(formatXof(17900, 'en')).toBe('17,900 FCFA');
    expect(formatXof(17900, 'fr').replace(/\s/g, ' ')).toBe('17 900 FCFA');
    expect(formatXof(0, 'fr')).toBe('0 FCFA');
  });
});
