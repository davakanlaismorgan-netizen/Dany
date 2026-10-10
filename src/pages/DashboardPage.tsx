import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { FolderKanban, Database, Rows3, BarChart3, ArrowRight, Activity, Plus, Clock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/report';
import { countByDay } from '@/lib/activity';
import type { Project, Dataset } from '@/types';
import { sectorConfig } from '@/lib/sectors';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/Loading';
import { timeAgo, formatNumber, cn } from '@/lib/utils';

const sectorColors: Record<string, string> = {
  finance: '#df8429', commerce: '#eab308', agriculture: '#22c55e',
  healthcare: '#e45a2b', logistics: '#0ea5e9', general: '#64748b',
};
const tooltipStyle = { borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px' };

interface ActivityRow { id: string; action: string; created_at: string; metadata: { name?: string } | null }

export function DashboardPage() {
  const { profile } = useAuth();
  const { t, lang } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [counts, setCounts] = useState({ projects: 0, datasets: 0, rows: 0, viz: 0 });
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [weekly, setWeekly] = useState<{ day: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  async function loadData() {
    setLoading(true);
    setFailed(false);
    try {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const [proj, projCount, ds, dsCount, viz, act, week] = await Promise.all([
        supabase.from('projects').select('*').order('updated_at', { ascending: false }).limit(5),
        supabase.from('projects').select('id', { count: 'exact', head: true }),
        supabase.from('datasets').select('*').eq('status', 'profiled').order('row_count', { ascending: false }).limit(8),
        supabase.from('datasets').select('row_count').eq('status', 'profiled').limit(1000),
        supabase.from('visualizations').select('id', { count: 'exact', head: true }),
        supabase.from('activity_log').select('id, action, created_at, metadata').order('created_at', { ascending: false }).limit(10),
        supabase.from('activity_log').select('created_at').gte('created_at', since).limit(1000),
      ]);
      const err = [proj, projCount, ds, dsCount, viz, act, week].find((r) => r.error)?.error;
      if (err) throw err;
      setProjects((proj.data as Project[]) ?? []);
      setDatasets((ds.data as Dataset[]) ?? []);
      setCounts({
        projects: projCount.count ?? 0,
        datasets: (dsCount.data ?? []).length,
        rows: (dsCount.data ?? []).reduce((sum, d) => sum + (d.row_count ?? 0), 0),
        viz: viz.count ?? 0,
      });
      setActivity((act.data as ActivityRow[]) ?? []);
      setWeekly(countByDay((week.data ?? []).map((r) => r.created_at as string), 7));
    } catch (err) {
      reportError(err, { where: 'DashboardPage.load' });
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const kpis = [
    { label: t('dashboard.kpi.projects'), value: counts.projects, icon: FolderKanban, color: 'savanna' },
    { label: t('dashboard.kpi.datasets'), value: counts.datasets, icon: Database, color: 'ocean' },
    { label: t('dashboard.kpi.rows'), value: counts.rows, icon: Rows3, color: 'forest' },
    { label: t('dashboard.kpi.viz'), value: counts.viz, icon: BarChart3, color: 'gold' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-neutral-900">
            {t('dashboard.welcome')} {profile?.full_name?.split(' ')[0] || ''}
          </h1>
          <p className="text-neutral-500 mt-1">{t('dashboard.welcome.subtitle')}</p>
        </div>
        <Link to="/projects/new" className="btn-primary">
          <Plus className="w-4 h-4" /> {t('app.newproject')}
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
          : kpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div key={kpi.label} className="card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center',
                      kpi.color === 'savanna' && 'bg-savanna-50 text-savanna-600',
                      kpi.color === 'ocean' && 'bg-ocean-50 text-ocean-600',
                      kpi.color === 'forest' && 'bg-forest-50 text-forest-600',
                      kpi.color === 'gold' && 'bg-gold-50 text-gold-600',
                    )}>
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="text-2xl font-display font-bold text-neutral-900">{formatNumber(kpi.value)}</div>
                  <div className="text-sm text-neutral-500">{kpi.label}</div>
                </div>
              );
            })}
      </div>

      {failed && <ErrorState message={t('common.error')} onRetry={loadData} />}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="card p-6 lg:col-span-2">
          <h3 className="font-semibold text-neutral-900">{t('dashboard.chart.rows')}</h3>
          <p className="text-sm text-neutral-500 mb-4">{t('dashboard.chart.rows.subtitle')}</p>
          {datasets.length === 0 ? (
            <p className="text-sm text-neutral-500 py-16 text-center">{t('dashboard.chart.empty')}</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={datasets.map((d) => ({ name: d.name, rows: d.row_count }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} interval={0} tickFormatter={(v: string) => (v.length > 12 ? `${v.slice(0, 11)}…` : v)} />
                <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => formatNumber(v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatNumber(Number(v))} />
                <Bar dataKey="rows" name={t('data.rows')} fill="#0ea5e9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-savanna-600" />
            <h3 className="font-semibold text-neutral-900">{t('dashboard.activity')}</h3>
          </div>
          {activity.length === 0 ? (
            <p className="text-sm text-neutral-500">{t('dashboard.activity.empty')}</p>
          ) : (
            <div className="space-y-3 max-h-[240px] overflow-y-auto scrollbar-thin">
              {activity.map((a) => (
                <div key={a.id} className="flex items-start gap-3 pb-3 border-b border-neutral-100 last:border-0 last:pb-0">
                  <div className="w-2 h-2 rounded-full bg-savanna-400 mt-1.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-neutral-700 truncate">{t(`activity.${a.action}`)}{a.metadata?.name ? ` — ${a.metadata.name}` : ''}</p>
                    <p className="text-xs text-neutral-400 mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3" /> {timeAgo(a.created_at, lang)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent projects */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-neutral-900">{t('dashboard.recent.projects')}</h2>
          <Link to="/projects" className="text-sm text-savanna-600 hover:text-savanna-700 font-medium flex items-center gap-1">
            {t('dashboard.recent.viewall')} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : projects.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<FolderKanban className="w-8 h-8" />}
              title={t('dashboard.noprojects')}
              description={t('dashboard.noprojects.desc')}
              action={<Link to="/projects/new" className="btn-primary"><Plus className="w-4 h-4" /> {t('dashboard.noprojects.button')}</Link>}
            />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => {
              const sector = sectorConfig[project.sector] || sectorConfig.general;
              return (
                <Link
                  key={project.id}
                  to={`/projects/${project.id}`}
                  className="card card-hover p-5 block"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-semibold"
                      style={{ backgroundColor: sectorColors[project.sector] || '#64748b' }}
                    >
                      {sector.label[0]}
                    </div>
                    <span className={cn(
                      'badge',
                      project.status === 'active' ? 'badge-forest' : 'badge-neutral'
                    )}>
                      {project.status}
                    </span>
                  </div>
                  <h3 className="font-semibold text-neutral-900 mb-1 truncate">{project.name}</h3>
                  <p className="text-sm text-neutral-500 line-clamp-2">{project.description}</p>
                  <p className="text-xs text-neutral-400 mt-3">{timeAgo(project.updated_at, lang)}</p>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="card p-6">
        <h3 className="font-semibold text-neutral-900">{t('dashboard.weekly')}</h3>
        <p className="text-sm text-neutral-500 mb-4">{t('dashboard.weekly.subtitle')}</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={weekly}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" name={t('dashboard.activity')} fill="#df8429" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
