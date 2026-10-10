import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files: string[] = [];
(function walk(d: string) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|css)$/.test(n) && !/\.test\./.test(n)) files.push(p);
  }
})('src');
const src = files.map((f) => [f, readFileSync(f, 'utf8')] as const);

describe('garde-fous statiques du code livré', () => {
  it('aucun lien mort href="#"', () => {
    expect(src.filter(([, c]) => /href=["']#["']/.test(c)).map(([f]) => f)).toEqual([]);
  });
  it('aucune trace de prestataires abandonnés', () => {
    expect(src.filter(([, c]) => /Danysia|Flutterwave|Stripe|bolt\.new/i.test(c)).map(([f]) => f)).toEqual([]);
  });
  it('target="_blank" toujours avec noopener', () => {
    const bad = src.filter(([, c]) => (c.match(/target=["']_blank["'][^>]*/g) ?? []).some((m) => !m.includes('noopener') && !/rel=.*noopener/.test(c)));
    expect(bad.map(([f]) => f)).toEqual([]);
  });
  it('seules les variables VITE_ publiques sont lues, aucun secret', () => {
    const vars = src.flatMap(([, c]) => [...c.matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]));
    expect(vars.filter((v) => !v.startsWith('VITE_') && !['DEV', 'PROD', 'MODE', 'BASE_URL'].includes(v))).toEqual([]);
    expect(src.filter(([, c]) => /service_role|X-PRIVATE-KEY|sk_live/i.test(c)).map(([f]) => f)).toEqual([]);
  });
});
