import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
  ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  BarChart3, TrendingUp, PieChart as PieIcon, ScatterChart as ScatterIcon,
  AreaChart as AreaIcon, Save, Trash2, Loader2, AlertTriangle,
} from 'lucide-react';
import { friendlyError } from '@/lib/errors';
import { reportError } from '@/lib/report';
import { logActivity } from '@/lib/activity';
import { supabase } from '@/lib/supabase';
import { EmptyState } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';
import { buildChartData, isCompatible, type ChartConfig, type ChartType, type Profiling } from '@/lib/chartData';
import { useI18n } from '@/context/I18nContext';
import type { Dataset, Visualization } from '@/types';

const chartTypes: { type: ChartType; labelKey: string; icon: typeof BarChart3 }[] = [
  { type: 'bar', labelKey: 'viz.bar', icon: BarChart3 },
  { type: 'line', labelKey: 'viz.line', icon: TrendingUp },
  { type: 'area', labelKey: 'viz.area', icon: AreaIcon },
  { type: 'pie', labelKey: 'viz.pie', icon: PieIcon },
  { type: 'scatter', labelKey: 'viz.scatter', icon: ScatterIcon },
];

const pieColors = ['#df8429', '#eab308', '#22c55e', '#e45a2b', '#0ea5e9', '#64748b'];
const tooltipStyle = { borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px' };

interface SavedViz { id: string; name: string; type: string; config: ChartConfig }

export function VisualizationsTab({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [saved, setSaved] = useState<SavedViz[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [type, setType] = useState<ChartType | null>(null);
  const [datasetId, setDatasetId] = useState('');
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [ds, vz] = await Promise.all([
        supabase.from('datasets').select('*').eq('project_id', projectId).eq('status', 'profiled').order('created_at', { ascending: false }),
        supabase.from('visualizations').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      ]);
      if (ds.error || vz.error) {
        reportError(ds.error ?? vz.error, { where: 'VisualizationsTab.load' });
        setLoadError(true);
        return;
      }
      const list = (ds.data ?? []) as Dataset[];
      setDatasets(list);
      setDatasetId((cur) => cur || list[0]?.id || '');
      setSaved((vz.data ?? []).map((v: Visualization) => ({ id: v.id, name: v.name, type: v.chart_type, config: v.config as ChartConfig })));
    }
    load();
  }, [projectId]);

  const dataset = datasets.find((d) => d.id === datasetId) ?? null;
  const profiling = useMemo(() => (dataset?.profiling ?? {}) as Profiling, [dataset]);
  const columns = profiling.columns ?? [];
  const config: ChartConfig = useMemo(() => ({ dataset_id: datasetId, x, y: y || undefined }), [datasetId, x, y]);
  const compatible = type ? isCompatible(type, config, profiling) : false;
  const data = useMemo(() => (type && compatible ? buildChartData(type, config, profiling) : []), [type, compatible, config, profiling]);

  const handleSave = useCallback(async () => {
    if (!type || !compatible) return;
    setSaving(true);
    setError(null);
    try {
      const name = `${t(chartTypes.find((c) => c.type === type)!.labelKey)} — ${dataset?.name ?? ''}`.slice(0, 120);
      const { data: row, error: err } = await supabase.from('visualizations')
        .insert({ project_id: projectId, name, chart_type: type, config }).select().single();
      if (err) throw err;
      void logActivity('visualization.saved', 'visualization', row.id, { name });
      setSaved((prev) => [{ id: row.id, name, type, config }, ...prev]);
      setType(null);
    } catch (err) {
      reportError(err, { where: 'VisualizationsTab.save' });
      setError(friendlyError(err, t('viz.save.error'), t));
    } finally {
      setSaving(false);
    }
  }, [type, compatible, dataset, projectId, config, t]);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      const { error: err } = await supabase.from('visualizations').delete().eq('id', id);
      if (err) throw err;
      setSaved((prev) => prev.filter((v) => v.id !== id));
    } catch (err) {
      reportError(err, { where: 'VisualizationsTab.delete' });
      setError(friendlyError(err, t('viz.delete.error'), t));
    } finally {
      setDeletingId(null);
    }
  }, [t]);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">{t('viz.title')}</h2>
        <p className="text-sm text-neutral-500 mt-1">{saved.length} {t('viz.subtitle')}</p>
      </div>

      {loadError && <div role="alert" className="p-3 rounded-xl bg-clay-50 border border-clay-200 text-sm text-clay-700">{t('common.error')}</div>}

      {datasets.length === 0 && !loadError ? (
        <div className="card"><EmptyState icon={<BarChart3 className="w-8 h-8" />} title={t('viz.nodata.title')} description={t('viz.nodata.desc')} /></div>
      ) : (
        <>
          <div>
            <h3 className="text-sm font-semibold text-neutral-700 mb-3">{t('viz.new')}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {chartTypes.map((ct) => {
                const Icon = ct.icon;
                const active = type === ct.type;
                return (
                  <button key={ct.type} type="button" aria-pressed={active} onClick={() => setType(active ? null : ct.type)}
                    className={cn('flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                      active ? 'border-savanna-400 bg-savanna-50' : 'border-neutral-200 hover:border-neutral-300')}>
                    <Icon className={cn('w-6 h-6', active ? 'text-savanna-600' : 'text-neutral-500')} />
                    <span className="text-xs font-medium text-neutral-700 text-center">{t(ct.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {type && (
            <div className="card p-6 animate-slide-up space-y-4">
              <div className="grid sm:grid-cols-3 gap-3">
                <Select label={t('viz.dataset')} value={datasetId} onChange={(v) => { setDatasetId(v); setX(''); setY(''); }}
                  options={datasets.map((d) => ({ value: d.id, label: d.name }))} />
                <Select label={t('viz.x')} value={x} onChange={setX} placeholder="—" options={columns.map((c) => ({ value: c.name, label: c.name }))} />
                <Select label={t('viz.y')} value={y} onChange={setY} placeholder={type === 'bar' || type === 'pie' ? t('viz.y.count') : '—'}
                  options={columns.filter((c) => c.type === 'number').map((c) => ({ value: c.name, label: c.name }))} />
              </div>
              <p className="text-xs text-neutral-500">{t('viz.preview.note')}</p>
              {error && <div role="alert" className="p-3 rounded-xl bg-clay-50 border border-clay-200 text-sm text-clay-700">{error}</div>}
              {compatible && data.length > 0 ? (
                <>
                  <div className="h-[350px]"><ChartRenderer type={type} data={data} xLabel={x} yLabel={y} /></div>
                  <button type="button" onClick={handleSave} disabled={saving} className="btn-secondary text-sm py-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {t('viz.save')}
                  </button>
                </>
              ) : (
                <p className="text-sm text-neutral-500 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {t('viz.incompatible')}</p>
              )}
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-neutral-700 mb-3">{t('viz.saved')}</h3>
            {saved.length === 0 ? (
              <div className="card"><EmptyState icon={<BarChart3 className="w-8 h-8" />} title={t('viz.empty.title')} description={t('viz.empty.desc')} /></div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {saved.map((v) => {
                  const ct = chartTypes.find((c) => c.type === v.type);
                  const Icon = ct?.icon ?? BarChart3;
                  const ds = datasets.find((d) => d.id === v.config?.dataset_id);
                  const p = (ds?.profiling ?? {}) as Profiling;
                  const pts = ct && ds ? buildChartData(ct.type, v.config, p) : [];
                  return (
                    <div key={v.id} className="card p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-savanna-50 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-savanna-600" /></div>
                          <h4 className="font-semibold text-neutral-900 text-sm truncate">{v.name}</h4>
                        </div>
                        <button type="button" aria-label={t('common.delete')} onClick={() => handleDelete(v.id)} disabled={deletingId === v.id} className="btn-ghost p-2 text-xs text-clay-600 disabled:opacity-50">
                          {deletingId === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                      <div className="h-[200px]">
                        {ct && pts.length > 0
                          ? <ChartRenderer type={ct.type} data={pts} xLabel={v.config.x} yLabel={v.config.y} compact />
                          : <p className="text-sm text-neutral-500 h-full flex items-center justify-center text-center">{t('viz.source.missing')}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Select({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="block mb-1 font-medium text-neutral-700">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm">
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function ChartRenderer({ type, data, xLabel, yLabel, compact = false }: {
  type: ChartType; data: { name: string; value: number; x?: number }[]; xLabel?: string; yLabel?: string; compact?: boolean;
}) {
  const fs = compact ? 10 : 12;
  const common = { stroke: '#94a3b8', fontSize: fs };
  const legend = !compact && <Legend wrapperStyle={{ fontSize: '13px' }} />;
  const serie = yLabel || 'count';

  if (type === 'bar') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="name" {...common} /><YAxis {...common} />
          <Tooltip contentStyle={tooltipStyle} />{legend}
          <Bar dataKey="value" name={serie} fill="#df8429" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }
  if (type === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="name" {...common} /><YAxis {...common} />
          <Tooltip contentStyle={tooltipStyle} />{legend}
          <Line type="monotone" dataKey="value" name={serie} stroke="#df8429" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }
  if (type === 'area') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="name" {...common} /><YAxis {...common} />
          <Tooltip contentStyle={tooltipStyle} />{legend}
          <Area type="monotone" dataKey="value" name={serie} stroke="#df8429" fill="#df8429" fillOpacity={0.2} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }
  if (type === 'pie') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={compact ? 40 : 60} outerRadius={compact ? 65 : 90} paddingAngle={3}>
            {data.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />{legend}
        </PieChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="x" name={xLabel} type="number" {...common} /><YAxis dataKey="value" name={yLabel} type="number" {...common} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: '3 3' }} />
        <Scatter data={data} fill="#df8429" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
