import { describe, expect, it } from 'vitest';
import { fitSize, LOGO_MAX_H, LOGO_MAX_W, logoPath, toJpegLogo } from './brandLogo';

describe('fitSize', () => {
  it('réduit en gardant les proportions, sans jamais agrandir', () => {
    expect(fitSize(960, 320)).toEqual({ width: 480, height: 160 });
    expect(fitSize(100, 40)).toEqual({ width: 100, height: 40 });
    const tall = fitSize(200, 1000);
    expect(tall.height).toBe(LOGO_MAX_H);
    expect(tall.width).toBe(32);
    const wide = fitSize(4800, 100);
    expect(wide.width).toBe(LOGO_MAX_W);
  });
  it('ne renvoie jamais une dimension nulle', () => {
    expect(fitSize(10000, 1).height).toBeGreaterThanOrEqual(1);
  });
});

describe('logoPath', () => {
  it('est dans le dossier du propriétaire, sous « brand/ »', () => {
    expect(logoPath('u1')).toBe('u1/brand/logo.jpg');
  });
});

describe('toJpegLogo', () => {
  it('refuse un type de fichier non image', async () => {
    expect(await toJpegLogo(new File(['x'], 'a.pdf', { type: 'application/pdf' }))).toEqual({ error: 'type' });
    expect(await toJpegLogo(new File(['x'], 'a.svg', { type: 'image/svg+xml' }))).toEqual({ error: 'type' });
  });
  it('refuse un fichier trop lourd', async () => {
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'a.png', { type: 'image/png' });
    expect(await toJpegLogo(big)).toEqual({ error: 'size' });
  });
});
