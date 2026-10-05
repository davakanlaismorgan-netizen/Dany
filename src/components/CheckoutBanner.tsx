import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import type { CheckoutStatus } from '@/hooks/useCheckout';

export function CheckoutBanner({
  status, reference, onRetry,
}: { status: CheckoutStatus; reference: string | null; onRetry: () => void }) {
  const { t } = useI18n();

  if (status === 'success') {
    return (
      <div role="status" className="p-4 rounded-xl bg-forest-50 border border-forest-200 flex items-center gap-3 animate-fade-in">
        <CheckCircle2 className="w-5 h-5 text-forest-600 shrink-0" />
        <p className="text-sm text-forest-800">{t('pricing.pay.success')}</p>
      </div>
    );
  }
  if (status === 'failed' || status === 'already_used') {
    return (
      <div role="alert" className="p-4 rounded-xl bg-clay-50 border border-clay-200 flex items-center gap-3 animate-fade-in">
        <AlertCircle className="w-5 h-5 text-clay-600 shrink-0" />
        <p className="text-sm text-clay-700">
          {status === 'already_used' ? t('pricing.pay.already_used') : t('pricing.pay.failed')}
        </p>
      </div>
    );
  }
  if (status === 'unverified') {
    return (
      <div role="alert" className="p-4 rounded-xl bg-gold-50 border border-gold-200 animate-fade-in">
        <div className="flex items-start gap-3">
          <Loader2 className="w-5 h-5 text-gold-700 shrink-0 mt-0.5" />
          <div className="text-sm text-gold-800 space-y-2">
            <p>{t('pricing.pay.unverified')}</p>
            {reference && <p className="font-mono text-xs">{t('pricing.pay.reference')} : {reference}</p>}
            <button type="button" onClick={onRetry} className="btn-secondary text-sm">
              {t('pricing.pay.retry')}
            </button>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
