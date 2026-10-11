import { describe, expect, it } from 'vitest';
import { getLegalDoc, isLegalSlug, LEGAL_SLUGS } from '@/lib/legalContent';
import { PREMIUM_PRICE_XOF } from '@/lib/plans';

const ctx = { company: 'ACME SARL', address: '1 rue X, Cotonou', registration: 'RCCM-1', email: 'c@acme.dev' };
const text = (slug: Parameters<typeof getLegalDoc>[0], lang: 'fr' | 'en') =>
  JSON.stringify(getLegalDoc(slug, lang, ctx));

describe('legalContent', () => {
  it('reconnaît uniquement les slugs légaux', () => {
    expect(isLegalSlug('terms')).toBe(true);
    expect(isLegalSlug('admin')).toBe(false);
    expect(isLegalSlug(undefined)).toBe(false);
  });

  it.each(LEGAL_SLUGS.flatMap((s) => (['fr', 'en'] as const).map((l) => [s, l] as const)))('%s/%s est non vide', (s, l) => {
    const d = getLegalDoc(s, l, ctx);
    expect(d.title.length).toBeGreaterThan(3);
    expect(d.sections.length).toBeGreaterThanOrEqual(3);
  });

  it('les CGU citent le prix réel du plan, sans renouvellement automatique', () => {
    for (const l of ['fr', 'en'] as const) {
      expect(text('terms', l).replace(/[\s\u202f\u00a0,.]/g, '')).toContain(String(PREMIUM_PRICE_XOF));
    }
    expect(text('terms', 'fr')).toMatch(/automatique/i);
  });

  it('utilise le contact fourni et ne contient aucun prestataire non utilisé', () => {
    expect(text('privacy', 'fr')).toContain('c@acme.dev');
    for (const bad of ['Flutterwave', 'Stripe', 'Danysia', 'bolt.new']) {
      for (const s of LEGAL_SLUGS) expect(text(s, 'fr') + text(s, 'en')).not.toContain(bad);
    }
    expect(text('privacy', 'en')).toMatch(/Supabase/);
    expect(text('privacy', 'en')).toMatch(/KKiaPay/i);
  });
});
