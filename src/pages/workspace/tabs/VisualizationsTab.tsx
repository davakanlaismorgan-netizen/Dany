import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
  ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  BarChart3, TrendingUp, PieChart as PieIcon, ScatterChart as ScatterIcon,
  AreaChart as AreaIcon, Map, Save, Trash2, Loader2,
} from 'lucide-react';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { EmptyState } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';
import { dashboardChartData } from '@/lib/mockData';
import { useI18n } from '@/context/I18nContext';
import type { Visualization } from '@/types';

const chartTypes = [
  { type: 'bar', labelKey: 'viz.bar', icon: BarChart3 },
  { type: 'line', labelKey: 'viz.line', icon: TrendingUp },
  { type: 'area', labelKey: 'viz.area', icon: AreaIcon },
  { type: 'pie', labelKey: 'viz.pie', icon: PieIcon },
  { type: 'scatter', labelKey: 'viz.scatter', icon: ScatterIcon },
  { type: 'geo', labelKey: 'viz.geo', icon: Map },
];

const pieColors = ['#df8429', '#eab308', '#22c55e', '#e45a2b', '#0ea5e9', '#64748b'];

// African countries data for geo map
const africanCountryData = [
  { country: 'Senegal', code: 'SN', value: 42000, region: 'West' },
  { country: 'Nigeria', code: 'NG', value: 125000, region: 'West' },
  { country: 'Kenya', code: 'KE', value: 88000, region: 'East' },
  { country: 'Ghana', code: 'GH', value: 35000, region: 'West' },
  { country: 'Ivory Coast', code: 'CI', value: 28000, region: 'West' },
  { country: 'South Africa', code: 'ZA', value: 95000, region: 'Southern' },
  { country: 'Ethiopia', code: 'ET', value: 62000, region: 'East' },
  { country: 'Egypt', code: 'EG', value: 78000, region: 'North' },
  { country: 'Morocco', code: 'MA', value: 45000, region: 'North' },
  { country: 'Tanzania', code: 'TZ', value: 38000, region: 'East' },
];

export function VisualizationsTab({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const [viz, setViz] = useState<typeof chartTypes[0] | null>(null);
  const [savedVizList, setSavedVizList] = useState<{ id: string; name: string; type: string; config: Record<string, unknown> }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function loadViz() {
      const { data, error } = await supabase
        .from('visualizations')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) {
        setSavedVizList([]);
        return;
      }
      setSavedVizList((data ?? []).map((v: Visualization) => ({
        id: v.id, name: v.name, type: v.chart_type, config: v.config,
      })));
    }
    loadViz();
  }, [projectId]);

  const handleSaveViz = useCallback(async () => {
    if (!viz) return;
    setSaving(true);
    setSaveError(null);
    try {
      const name = `${t(viz.labelKey)} — ${new Date().toLocaleDateString()}`;
      const { data, error } = await supabase.from('visualizations').insert({
        project_id: projectId,
        name,
        chart_type: viz.type,
        config: {},
      }).select().single();
      if (error) throw error;
      if (data) {
        setSavedVizList(prev => [{ id: data.id, name, type: viz.type, config: {} }, ...prev]);
        setViz(null);
      }
    } catch (err) {
      setSaveError(friendlyError(err, t('viz.save.error'), t));
    } finally {
      setSaving(false);
    }
  }, [viz, projectId, t]);

  const handleDeleteViz = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await supabase.from('visualizations').delete().eq('id', id);
      setSavedVizList(prev => prev.filter(v => v.id !== id));
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  }, []);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">{t('viz.title')}</h2>
          <p className="text-sm text-neutral-500 mt-1">{savedVizList.length} {t('viz.subtitle')}</p>
        </div>
      </div>

      {/* Chart type selector */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-700 mb-3">{t('viz.new')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {chartTypes.map((ct) => {
            const Icon = ct.icon;
            return (
              <button
                key={ct.type}
                onClick={() => setViz(viz?.type === ct.type ? null : ct)}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                  viz?.type === ct.type
                    ? 'border-savanna-400 bg-savanna-50'
                    : 'border-neutral-200 hover:border-neutral-300'
                )}
              >
                <Icon className={cn('w-6 h-6', viz?.type === ct.type ? 'text-savanna-600' : 'text-neutral-500')} />
                <span className="text-xs font-medium text-neutral-700 text-center">{t(ct.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart preview */}
      {saveError && (
        <div role="alert" className="p-3 rounded-xl bg-clay-50 border border-clay-200 text-sm text-clay-700">{saveError}</div>
      )}
      {viz && <ChartPreview type={viz.type} t={t} onSave={handleSaveViz} saving={saving} />}

      {/* Saved visualizations */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-700 mb-3">{t('viz.saved')}</h3>
        {savedVizList.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<BarChart3 className="w-8 h-8" />}
              title={t('viz.empty.title')}
              description={t('viz.empty.desc')}
            />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {savedVizList.map((v) => {
              const config = chartTypes.find(c => c.type === v.type);
              const Icon = config?.icon || BarChart3;
              return (
                <div key={v.id} className="card p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-savanna-50 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-savanna-600" />
                      </div>
                      <h4 className="font-semibold text-neutral-900 text-sm">{v.name}</h4>
                    </div>
                    <div className="flex items-center gap-1">
                      <button className="btn-ghost p-2 text-xs"><Save className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteViz(v.id)} disabled={deletingId === v.id} className="btn-ghost p-2 text-xs text-clay-600 disabled:opacity-50">
                        {deletingId === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="h-[200px]">
                    <ChartRenderer type={v.type} compact />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ChartPreview({ type, t, onSave, saving }: { type: string; t: (key: string) => string; onSave: () => void; saving: boolean }) {
  return (
    <div className="card p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-neutral-900">{t('viz.preview')}</h3>
        <div className="flex items-center gap-2">
          <button onClick={onSave} disabled={saving} className="btn-secondary text-sm py-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {t('viz.save')}
          </button>
        </div>
      </div>
      <div className="h-[350px]">
        <ChartRenderer type={type} />
      </div>
    </div>
  );
}

function ChartRenderer({ type, compact = false }: { type: string; compact?: boolean }) {
  const height = '100%';

  if (type === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={dashboardChartData.modelComparison}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="model" stroke="#94a3b8" fontSize={compact ? 10 : 12} />
          <YAxis stroke="#94a3b8" fontSize={compact ? 10 : 12} domain={[0, 100]} />
          <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
          {!compact && <Legend wrapperStyle={{ fontSize: '13px' }} />}
          <Bar dataKey="accuracy" name="Accuracy" fill="#df8429" radius={[6, 6, 0, 0]} />
          <Bar dataKey="precision" name="Precision" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'line') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={dashboardChartData.cocoaPrices}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="date" stroke="#94a3b8" fontSize={compact ? 10 : 12} />
          <YAxis stroke="#94a3b8" fontSize={compact ? 10 : 12} />
          <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
          {!compact && <Legend wrapperStyle={{ fontSize: '13px' }} />}
          <Line type="monotone" dataKey="price" name="Cocoa Price (XOF)" stroke="#df8429" strokeWidth={2} dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'area') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={dashboardChartData.momoTransactions}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#df8429" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#df8429" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="month" stroke="#94a3b8" fontSize={compact ? 10 : 12} />
          <YAxis stroke="#94a3b8" fontSize={compact ? 10 : 12} />
          <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
          {!compact && <Legend wrapperStyle={{ fontSize: '13px' }} />}
          <Area type="monotone" dataKey="sent" name="Sent" stroke="#df8429" fill="url(#areaGrad)" strokeWidth={2} />
          <Area type="monotone" dataKey="received" name="Received" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={dashboardChartData.customerSegments}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={compact ? 40 : 60}
            outerRadius={compact ? 65 : 90}
            paddingAngle={3}
          >
            {dashboardChartData.customerSegments.map((_, i) => (
              <Cell key={i} fill={pieColors[i % pieColors.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px' }} formatter={(v) => `${v}%`} />
          {!compact && <Legend wrapperStyle={{ fontSize: '13px' }} />}
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'scatter') {
    const scatterData = dashboardChartData.cocoaPrices.map((d, i) => ({
      x: i + 1,
      y: d.price,
    }));
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="x" name="Time" stroke="#94a3b8" fontSize={compact ? 10 : 12} />
          <YAxis dataKey="y" name="Price" stroke="#94a3b8" fontSize={compact ? 10 : 12} />
          <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px' }} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={scatterData} fill="#df8429" />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'geo') {
    const maxVal = Math.max(...africanCountryData.map(d => d.value));
    return (
      <div className="w-full h-full overflow-auto scrollbar-thin">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {africanCountryData
            .slice()
            .sort((a, b) => b.value - a.value)
            .map((country) => {
              const intensity = country.value / maxVal;
              return (
                <div
                  key={country.code}
                  className="rounded-xl p-4 border border-neutral-200 transition-all hover:shadow-md"
                  style={{
                    backgroundColor: `rgba(223, 132, 41, ${intensity * 0.15 + 0.05})`,
                    borderColor: `rgba(223, 132, 41, ${intensity * 0.3})`,
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-neutral-900 text-sm">{country.country}</span>
                    <span className="badge-neutral text-[10px]">{country.region}</span>
                  </div>
                  <div className="text-2xl font-display font-bold text-savanna-700">
                    {(country.value / 1000).toFixed(0)}K
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-neutral-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-savanna-500"
                      style={{ width: `${intensity * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    );
  }

  return null;
}
