import { FileText, Table, AlertTriangle } from 'lucide-react';
import { formatBytes, formatNumber } from '@/lib/utils';
import type { Dataset } from '@/types';

export function DataPreview({ dataset, onClose, t, lang }: { dataset: Dataset; onClose: () => void; t: (key: string) => string; lang: string }) {
  const profiling = dataset.profiling as {
    headers?: string[]; preview?: string[][]; bad_rows?: number;
    columns?: { name: string; type: 'number' | 'text'; missing: number; distinct: number }[];
  };
  const columnsProfile = profiling?.columns ?? [];
  const badRows = profiling?.bad_rows ?? 0;
  const headers = profiling?.headers || [];
  const previewRows = profiling?.preview || [];

  const hasRealData = headers.length > 0;

  const profilingStats = [
    { label: t('data.rows'), value: formatNumber(dataset.row_count), status: 'neutral' },
    { label: t('data.columns'), value: dataset.column_count.toString(), status: 'neutral' },
    { label: t('data.size'), value: formatBytes(dataset.size_bytes), status: 'neutral' },
  ];

  return (
    <div className="card p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Table className="w-5 h-5 text-savanna-600" />
          <div>
            <h3 className="font-semibold text-neutral-900">{dataset.name} — {t('data.preview')}</h3>
            <p className="text-sm text-neutral-500">{formatNumber(dataset.row_count)} {t('data.rows').toLowerCase()} · {dataset.column_count} {t('data.columns').toLowerCase()}</p>
          </div>
        </div>
        <button onClick={onClose} className="btn-ghost p-2" aria-label="Close">✕</button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {profilingStats.map((s) => (
          <div key={s.label} className="p-3 rounded-xl bg-neutral-50 border border-neutral-100">
            <div className="text-sm font-semibold text-neutral-900">{s.value}</div>
            <div className="text-xs text-neutral-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {columnsProfile.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-neutral-900 mb-2">{t('data.profile.title')}</h4>
          <div className="overflow-x-auto border border-neutral-200 rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-left text-neutral-600">
                  <th className="px-4 py-2 font-medium">{t('data.profile.column')}</th>
                  <th className="px-4 py-2 font-medium">{t('data.profile.type')}</th>
                  <th className="px-4 py-2 font-medium">{t('data.missing')}</th>
                  <th className="px-4 py-2 font-medium">{t('data.profile.distinct')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {columnsProfile.map((c) => (
                  <tr key={c.name}>
                    <td className="px-4 py-2 text-neutral-800 whitespace-nowrap">{c.name}</td>
                    <td className="px-4 py-2 text-neutral-600">{c.type === 'number' ? t('data.numeric') : t('data.categorical')}</td>
                    <td className="px-4 py-2 text-neutral-600">{formatNumber(c.missing)}{dataset.row_count > 0 ? ` (${Math.round((c.missing / dataset.row_count) * 100)} %)` : ''}</td>
                    <td className="px-4 py-2 text-neutral-600">{c.distinct >= 1000 ? '1 000+' : formatNumber(c.distinct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {badRows > 0 && (
            <p className="mt-2 text-xs text-gold-700 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {badRows} {t('data.profile.badrows')}</p>
          )}
        </div>
      )}

      {hasRealData ? (
        <div className="overflow-x-auto scrollbar-thin border border-neutral-200 rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200">
                {headers.map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-neutral-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {previewRows.map((row, i) => (
                <tr key={i} className="hover:bg-neutral-50/50 transition-colors">
                  {headers.map((h, j) => (
                    <td key={h} className="px-4 py-2.5 text-neutral-700 whitespace-nowrap">{row[j]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-neutral-400">
          <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{lang === 'fr' ? 'Aperçu non disponible pour ce format de fichier' : 'Preview not available for this file format'}</p>
        </div>
      )}
      {hasRealData && previewRows.length > 0 && (
        <p className="text-xs text-neutral-400 mt-3 text-center">{t('data.showing')} {previewRows.length} / {formatNumber(dataset.row_count)} {t('data.rows').toLowerCase()}</p>
      )}
    </div>
  );
}
