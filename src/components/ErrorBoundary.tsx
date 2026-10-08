import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useI18n } from '@/context/I18nContext';
import { reportError } from '@/lib/report';

function Fallback() {
  const { t } = useI18n();
  return (
    <div role="alert" className="min-h-screen flex items-center justify-center p-6 bg-neutral-50">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-display font-bold text-neutral-900">{t('error.title')}</h1>
        <p className="mt-3 text-neutral-600">{t('error.desc')}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            {t('error.reload')}
          </button>
          <a href="/" className="btn-secondary">{t('error.home')}</a>
        </div>
      </div>
    </div>
  );
}

// Évite l'écran blanc : une erreur d'affichage (ou un fichier de page introuvable après un
// déploiement) montre un message et un bouton de rechargement.
export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    reportError(error, { componentStack: info.componentStack });
  }

  render() {
    return this.state.hasError ? <Fallback /> : this.props.children;
  }
}
