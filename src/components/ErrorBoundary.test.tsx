import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/context/I18nContext';
import { ErrorBoundary } from './ErrorBoundary';
import { setErrorSink } from '@/lib/report';

function Boom(): never { throw new Error('rendu cassé'); }

describe('ErrorBoundary', () => {
  afterEach(() => { cleanup(); setErrorSink(null); vi.restoreAllMocks(); });

  it('affiche un message et un bouton de rechargement au lieu d\'un écran blanc', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<I18nProvider><ErrorBoundary><Boom /></ErrorBoundary></I18nProvider>);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: /recharger|reload/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /accueil|home/i }).getAttribute('href')).toBe('/');
  });

  it('remonte l\'erreur au service de suivi', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sink = vi.fn();
    setErrorSink(sink);
    render(<I18nProvider><ErrorBoundary><Boom /></ErrorBoundary></I18nProvider>);
    expect(sink).toHaveBeenCalledTimes(1);
    expect((sink.mock.calls[0][0] as Error).message).toBe('rendu cassé');
  });

  it('laisse passer les enfants sans erreur', () => {
    render(<I18nProvider><ErrorBoundary><p>contenu</p></ErrorBoundary></I18nProvider>);
    expect(screen.getByText('contenu')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
