import { defineConfig } from 'vitest/config';
import { loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const PUBLIC_PATHS = ['/', '/pricing', '/legal/terms', '/legal/privacy', '/legal/notice'];
const PRIVATE_PATHS = ['/dashboard', '/projects', '/assistant', '/marketplace', '/settings', '/auth/'];

// SEO : robots.txt toujours généré ; sitemap.xml et balises de partage (og:image, canonical)
// uniquement si VITE_SITE_URL est défini (ces balises exigent une URL absolue).
function seo(siteUrl: string | undefined): Plugin {
  let origin: string | null = null;
  if (siteUrl) {
    try {
      origin = new URL(siteUrl).origin;
    } catch {
      throw new Error(`VITE_SITE_URL invalide : « ${siteUrl} » (attendu : https://votre-domaine.com)`);
    }
  }
  return {
    name: 'das-seo',
    transformIndexHtml(html) {
      if (!origin) return html;
      const tags = [
        `<link rel="canonical" href="${origin}/" />`,
        `<meta property="og:url" content="${origin}/" />`,
        `<meta property="og:image" content="${origin}/og-image.png" />`,
        `<meta property="og:image:width" content="1200" />`,
        `<meta property="og:image:height" content="630" />`,
        `<meta name="twitter:image" content="${origin}/og-image.png" />`,
      ].join('\n    ');
      return html
        .replace('content="summary"', 'content="summary_large_image"')
        .replace('</head>', `    ${tags}\n  </head>`);
    },
    generateBundle() {
      const robots = ['User-agent: *', 'Allow: /', ...PRIVATE_PATHS.map((p) => `Disallow: ${p}`)];
      if (origin) robots.push('', `Sitemap: ${origin}/sitemap.xml`);
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots.join('\n') + '\n' });
      if (origin) {
        const urls = PUBLIC_PATHS.map((p) => `  <url><loc>${origin}${p}</loc></url>`).join('\n');
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
        });
      }
    },
  };
}

// Refuse de publier des pages légales déclarées « relues » alors que l'identité de l'éditeur manque.
function legalGuard(env: Record<string, string>): Plugin {
  return {
    name: 'das-legal-guard',
    apply: 'build',
    buildStart() {
      if (env.VITE_LEGAL_REVIEWED !== 'true') return;
      const missing = ['VITE_COMPANY_NAME', 'VITE_COMPANY_ADDRESS', 'VITE_CONTACT_EMAIL'].filter((k) => !env[k]?.trim());
      if (missing.length) {
        throw new Error(`VITE_LEGAL_REVIEWED=true mais il manque : ${missing.join(', ')} (mentions légales incomplètes)`);
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), seo(env.VITE_SITE_URL), legalGuard(env)],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
