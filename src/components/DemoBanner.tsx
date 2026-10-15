import { FlaskConical } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';

// Fonctionnalités de démonstration : les résultats affichés sont simulés, jamais calculés sur les données de l'utilisateur.
export function DemoBanner({ feature }: { feature: 'assistant' | 'models' | 'reports' }) {
  const { t } = useI18n();
  return (
    <div role="note" className="p-3 rounded-xl bg-gold-50 border border-gold-200 text-sm text-gold-800 flex items-start gap-2">
      <FlaskConical className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      <span><strong>{t('demo.badge')}</strong> — {t(`demo.${feature}`)}</span>
    </div>
  );
}
