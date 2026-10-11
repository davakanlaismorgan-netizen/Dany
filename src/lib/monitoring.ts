import { setErrorSink } from '@/lib/report';

export interface MonitoringOptions {
  endpoint: string | undefined;
  send?: (url: string, body: string) => boolean;
  now?: () => number;
  maxPerMinute?: number;
}

export function isSafeEndpoint(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === 'localhost');
  } catch {
    return false;
  }
}

// Construit le message envoyé : jamais de données personnelles (pas d'email, pas de query string,
// pas de contenu de fichier), pile tronquée.
export function buildPayload(error: unknown, context: Record<string, unknown> | undefined, href: string, now: number) {
  const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'non-error thrown');
  let path = href;
  try {
    path = new URL(href).pathname;
  } catch { /* href relatif : conservé tel quel */ }
  return {
    message: e.message.slice(0, 500),
    name: e.name,
    stack: (e.stack ?? '').slice(0, 2000),
    where: typeof context?.where === 'string' ? context.where : undefined,
    path,
    at: new Date(now).toISOString(),
  };
}

// Branche la remontée des erreurs vers un point de collecte HTTPS (VITE_ERROR_ENDPOINT : Sentry-tunnel,
// fonction maison, n'importe quel collecteur JSON). Sans endpoint : rien n'est envoyé (console seulement).
// Anti-déluge : au plus `maxPerMinute` envois par minute et déduplication par message+lieu.
export function initMonitoring(opts: MonitoringOptions): () => void {
  if (!isSafeEndpoint(opts.endpoint)) return () => {};
  const endpoint = opts.endpoint;
  const now = opts.now ?? Date.now;
  const send = opts.send ?? ((url, body) => navigator.sendBeacon(url, new Blob([body], { type: 'application/json' })));
  const max = opts.maxPerMinute ?? 5;
  const recent: number[] = [];
  const seen = new Set<string>();

  setErrorSink((error, context) => {
    const t = now();
    while (recent.length && t - recent[0] > 60_000) recent.shift();
    const payload = buildPayload(error, context, typeof location === 'undefined' ? '' : location.href, t);
    const key = `${payload.message}|${payload.where ?? ''}`;
    if (seen.has(key) || recent.length >= max) return;
    seen.add(key);
    if (seen.size > 100) seen.clear();
    recent.push(t);
    send(endpoint, JSON.stringify(payload));
  });
  return () => setErrorSink(null);
}

// Erreurs non interceptées (hors React) : elles passent aussi par reportError.
export function installGlobalHandlers(report: (e: unknown, c?: Record<string, unknown>) => void): () => void {
  const onError = (ev: ErrorEvent) => report(ev.error ?? ev.message, { where: 'window.onerror' });
  const onRejection = (ev: PromiseRejectionEvent) => report(ev.reason, { where: 'unhandledrejection' });
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
