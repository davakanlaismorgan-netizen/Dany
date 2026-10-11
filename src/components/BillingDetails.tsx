import { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/report';
import { FREE_LIMITS, formatXof } from '@/lib/plans';
import { ErrorState } from '@/components/ui/Loading';

interface PaymentRow {
  id: string; transaction_id: string; plan: string; amount: number;
  method: string | null; provider: string; created_at: string; refunded_at: string | null;
}
interface Usage { projects: number; visualizations: number; maxRows: number }

export function BillingDetails({ isFree }: { isFree: boolean }) {
  const { t, lang } = useI18n();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setFailed(false);
    try {
      const [pay, proj, viz, ds] = await Promise.all([
        supabase.from('payments').select('id, transaction_id, plan, amount, method, provider, created_at, refunded_at').order('created_at', { ascending: false }).limit(50),
        supabase.from('projects').select('id', { count: 'exact', head: true }),
        supabase.from('visualizations').select('id', { count: 'exact', head: true }),
        supabase.from('datasets').select('row_count').order('row_count', { ascending: false }).limit(1),
      ]);
      const err = [pay, proj, viz, ds].find((r) => r.error)?.error;
      if (err) throw err;
      setPayments((pay.data ?? []) as PaymentRow[]);
      setUsage({ projects: proj.count ?? 0, visualizations: viz.count ?? 0, maxRows: ds.data?.[0]?.row_count ?? 0 });
    } catch (err) {
      reportError(err, { where: 'BillingDetails.load' });
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (failed) return <ErrorState message={t('common.error')} onRetry={load} />;
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';

  const rows: { label: string; value: number; limit: number }[] = usage ? [
    { label: t('billing.usage.projects'), value: usage.projects, limit: FREE_LIMITS.projects },
    { label: t('billing.usage.viz'), value: usage.visualizations, limit: FREE_LIMITS.visualizations },
    { label: t('billing.usage.rows'), value: usage.maxRows, limit: FREE_LIMITS.rows },
  ] : [];

  return (
    <>
      <div className="card p-6">
        <h2 className="font-semibold text-neutral-900">{t('billing.usage.title')}</h2>
        <p className="text-sm text-neutral-500 mt-1 mb-4">{isFree ? t('billing.usage.free') : t('billing.usage.premium')}</p>
        {loading ? <p className="text-sm text-neutral-400">{t('common.loading')}</p> : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const pct = Math.min(100, Math.round((r.value / r.limit) * 100));
              return (
                <li key={r.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-neutral-700">{r.label}</span>
                    <span className="text-neutral-500">{new Intl.NumberFormat(locale).format(r.value)}{isFree ? ` / ${new Intl.NumberFormat(locale).format(r.limit)}` : ''}</span>
                  </div>
                  {isFree && (
                    <div role="progressbar" aria-label={r.label} aria-valuemin={0} aria-valuemax={r.limit} aria-valuenow={Math.min(r.value, r.limit)} className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                      <div className={pct >= 100 ? 'h-full bg-clay-500' : 'h-full bg-savanna-500'} style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="card p-6">
        <h2 className="font-semibold text-neutral-900 flex items-center gap-2"><Receipt className="w-4 h-4" /> {t('billing.history.title')}</h2>
        {loading ? <p className="text-sm text-neutral-400 mt-3">{t('common.loading')}</p> : payments.length === 0 ? (
          <p className="text-sm text-neutral-500 mt-3">{t('billing.history.empty')}</p>
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500 border-b border-neutral-200">
                  <th className="py-2 pr-4 font-medium">{t('billing.history.date')}</th>
                  <th className="py-2 pr-4 font-medium">{t('billing.history.amount')}</th>
                  <th className="py-2 pr-4 font-medium">{t('billing.history.ref')}</th>
                  <th className="py-2 font-medium">{t('billing.history.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 pr-4 whitespace-nowrap">{new Date(p.created_at).toLocaleDateString(locale)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{formatXof(p.amount, lang)}</td>
                    <td className="py-2 pr-4 font-mono text-xs break-all">{p.transaction_id}{p.provider.endsWith('sandbox') ? ' (test)' : ''}</td>
                    <td className="py-2">{p.refunded_at ? t('billing.history.refunded') : t('billing.history.paid')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
