import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPayload, initMonitoring, installGlobalHandlers, isSafeEndpoint } from '@/lib/monitoring';
import { reportError } from '@/lib/report';

let stop: () => void = () => {};
afterEach(() => { stop(); vi.restoreAllMocks(); });
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('isSafeEndpoint', () => {
  it('HTTPS (ou localhost) uniquement', () => {
    expect(isSafeEndpoint('https://logs.example.com/e')).toBe(true);
    expect(isSafeEndpoint('http://localhost:9000/e')).toBe(true);
    for (const bad of ['http://logs.example.com', 'javascript:alert(1)', 'nope', '', undefined]) expect(isSafeEndpoint(bad)).toBe(false);
  });
});

describe('buildPayload', () => {
  it('ne contient ni query string ni email, et tronque la pile', () => {
    const err = new Error('boom user@secret.com'.padEnd(900, 'x'));
    err.stack = 'S'.repeat(5000);
    const p = buildPayload(err, { where: 'X', email: 'a@b.c' }, 'https://das.app/projects/1?token=abc#h', 0);
    expect(p.path).toBe('/projects/1');
    expect(p.message.length).toBe(500);
    expect(p.stack.length).toBe(2000);
    expect(JSON.stringify(p)).not.toContain('token=abc');
    expect(JSON.stringify(p)).not.toContain('a@b.c');
    expect(buildPayload('texte', undefined, '/x', 0).name).toBe('Error');
  });
});

describe('initMonitoring', () => {
  it('sans endpoint valide : rien n\'est envoyé', () => {
    quiet();
    const send = vi.fn(() => true);
    stop = initMonitoring({ endpoint: 'http://evil.example.com', send });
    reportError(new Error('a'));
    expect(send).not.toHaveBeenCalled();
  });

  it('envoie, dédoublonne et limite le débit', () => {
    quiet();
    let t = 0;
    const send = vi.fn(() => true);
    stop = initMonitoring({ endpoint: 'https://logs.example.com/e', send, now: () => t, maxPerMinute: 2 });
    reportError(new Error('a'), { where: 'w' });
    reportError(new Error('a'), { where: 'w' }); // doublon
    reportError(new Error('b'));
    reportError(new Error('c')); // au-delà de 2/min
    expect(send).toHaveBeenCalledTimes(2);
    t = 61_000;
    reportError(new Error('d'));
    expect(send).toHaveBeenCalledTimes(3);
    const body = JSON.parse((send.mock.calls[0] as unknown as [string, string])[1]);
    expect(body.where).toBe('w');
  });

  it('une panne du collecteur ne casse pas l\'application', () => {
    quiet();
    stop = initMonitoring({ endpoint: 'https://logs.example.com/e', send: () => { throw new Error('réseau'); } });
    expect(() => reportError(new Error('x'))).not.toThrow();
  });
});

describe('installGlobalHandlers', () => {
  it('remonte les erreurs non interceptées et les promesses rejetées', () => {
    const report = vi.fn();
    const off = installGlobalHandlers(report);
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('x'), message: 'x' }));
    const ev = new Event('unhandledrejection') as Event & { reason?: unknown };
    ev.reason = new Error('r');
    window.dispatchEvent(ev);
    expect(report).toHaveBeenCalledTimes(2);
    const spy = vi.spyOn(window, 'removeEventListener');
    off();
    expect(spy.mock.calls.map((c) => c[0]).sort()).toEqual(['error', 'unhandledrejection']);
  });
});
