import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { useI18n } from '@/context/I18nContext';

export default function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <h1 className="text-7xl font-display font-bold text-savanna-600 mb-3">404</h1>
        <h2 className="text-xl font-semibold text-neutral-900 mb-2">{t('notfound.title')}</h2>
        <p className="text-sm text-neutral-500 mb-8">
          {t('notfound.desc')}
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/" className="btn-primary">
            <Home className="w-4 h-4" /> {t('common.back')}
          </Link>
          <Link to="/dashboard" className="btn-secondary">
            <ArrowLeft className="w-4 h-4" /> {t('notfound.dashboard')}
          </Link>
        </div>
      </div>
    </div>
  );
}
