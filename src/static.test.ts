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
  it('plus de données fictives dans le bundle (mockData supprimé, aucune valeur aléatoire affichée comme résultat)', () => {
    expect(src.filter(([f]) => /mockData/.test(f)).map(([f]) => f)).toEqual([]);
    expect(src.filter(([, c]) => /from '@\/lib\/mockData'/.test(c)).map(([f]) => f)).toEqual([]);
  });
  it("l'assistant IA est réel : plus de réponses préenregistrées ni de bandeau Démo, appels délégués au serveur", () => {
    const page = readFileSync('src/pages/AssistantPage.tsx', 'utf8');
    expect(page).not.toMatch(/DemoBanner|mockResponses|setTimeout|Math\.random/);
    expect(page).toContain('sendAssistantMessage(');
    const lib = readFileSync('src/lib/assistant.ts', 'utf8');
    expect(lib).toContain("functions.invoke('ai-assistant'");
    // le navigateur ne parle jamais directement à un fournisseur LLM
    expect(src.filter(([, c]) => /api\.(anthropic|openai)\.com/.test(c)).map(([f]) => f)).toEqual([]);
  });
  it('les rapports sont réels : plus de bandeau Démo ni de génération simulée, fichier produit par le serveur', () => {
    const tab = readFileSync('src/pages/workspace/tabs/ReportsTab.tsx', 'utf8');
    expect(tab).not.toContain('DemoBanner');
    expect(tab).not.toMatch(/setTimeout|demo: true|Math\.random/);
    expect(tab).toContain('generateReport(');
    // aucune option de livraison factice (e-mail / WhatsApp) tant qu'elle n'existe pas
    expect(tab).not.toMatch(/whatsapp|reports\.email/i);
  });
  it('les pipelines sont réels : plus de bandeau Démo, exécution déléguée au serveur', () => {
    const tab = readFileSync('src/pages/workspace/tabs/PipelineTab.tsx', 'utf8');
    expect(tab).not.toContain('DemoBanner');
    expect(tab).not.toMatch(/setTimeout\([^)]*setRunning/);
    expect(tab).toContain('runPipeline(');
  });
  it("l'AutoML est réel : plus de bandeau Démo ni de métriques tirées au hasard", () => {
    const tab = readFileSync('src/pages/workspace/tabs/ModelsTab.tsx', 'utf8');
    expect(tab).not.toContain('DemoBanner');
    expect(tab).not.toMatch(/Math\.random|mockMetrics/);
    expect(tab).toContain('runAutoMl(');
  });
  it('seules les variables VITE_ publiques sont lues, aucun secret', () => {
    const vars = src.flatMap(([, c]) => [...c.matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]));
    expect(vars.filter((v) => !v.startsWith('VITE_') && !['DEV', 'PROD', 'MODE', 'BASE_URL'].includes(v))).toEqual([]);
    expect(src.filter(([, c]) => /service_role|X-PRIVATE-KEY|sk_live/i.test(c)).map(([f]) => f)).toEqual([]);
  });
});
