import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Legend,
} from 'recharts';
import {
  FolderKanban,
  Database,
  Sparkles,
  FileText,
  TrendingUp,
  ArrowRight,
  Activity,
  Plus,
  Clock,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { supabase } from '@/lib/supabase';
import type { Project, Dataset, Model, Report } from '@/types';
import { recentActivity, dashboardChartData, sectorConfig } from '@/lib/mockData';
import { CardSkeleton, EmptyState } from '@/components/ui/Loading';
import { timeAgo, formatNumber, cn } from '@/lib/utils';

const sectorColors: Record<string, string> = {
  finance: '#df8429',
  commerce: '#eab308',
  agriculture: '#22c55e',
  healthcare: '#e45a2b',
  logistics: '#0ea5e9',
  general: '#64748b',
};

export function DashboardPage() {
  const { profile } = useAuth();
  const { t, lang } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [projRes, dsRes, mdlRes, rptRes] = await Promise.all([
          supabase.from('projects').select('*').order('updated_at', { ascending: false }).limit(5),
          supabase.from('datasets').select('*').order('created_at', { ascending: false }).limit(10),
          supabase.from('models').select('*').order('created_at', { ascending: false }).limit(10),
          supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(10),
        ]);

        if (projRes.error) throw projRes.error;
        if (dsRes.error) throw dsRes.error;
        if (mdlRes.error) throw mdlRes.error;
        if (rptRes.error) throw rptRes.error;

        setProjects((projRes.data as Project[]) ?? []);
        setDatasets((dsRes.data as Dataset[]) ?? []);
        setModels((mdlRes.data as Model[]) ?? []);
        setReports((rptRes.data as Report[]) ?? []);
      } catch {
        setProjects([]);
        setDatasets([]);
        setModels([]);
        setReports([]);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const kpis = [
    { label: t('dashboard.kpi.projects'), value: projects.filter(p => p.status === 'active').length, total: projects.length, icon: FolderKanban, color: 'savanna' },
    { label: t('dashboard.kpi.datasets'), value: datasets.length, total: datasets.length, icon: Database, color: 'ocean' },
    { label: t('dashboard.kpi.models'), value: models.filter(m => m.status === 'completed').length, total: models.length, icon: Sparkles, color: 'forest' },
    { label: t('dashboard.kpi.reports'), value: reports.length, total: reports.length, icon: FileText, color: 'gold' },
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
                    <TrendingUp className="w-4 h-4 text-neutral-300" />
                  </div>
                  <div className="text-2xl font-display font-bold text-neutral-900">{kpi.value}</div>
                  <div className="text-sm text-neutral-500">{kpi.label}</div>
                </div>
              );
            })}
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Mobile money chart */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-neutral-900">{t('dashboard.chart.momo')}</h3>
              <p className="text-sm text-neutral-500">{t('dashboard.chart.momo.subtitle')}</p>
            </div>
            <span className="badge-savanna">{t('sector.finance')}</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={dashboardChartData.momoTransactions}>
              <defs>
                <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#df8429" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#df8429" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorReceived" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => formatNumber(v)} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px' }}
                formatter={(v) => formatNumber(Number(v))}
              />
              <Legend wrapperStyle={{ fontSize: '13px' }} />
              <Area type="monotone" dataKey="sent" name="Sent" stroke="#df8429" fillOpacity={1} fill="url(#colorSent)" strokeWidth={2} />
              <Area type="monotone" dataKey="received" name="Received" stroke="#22c55e" fillOpacity={1} fill="url(#colorReceived)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Customer segments pie */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-neutral-900">{t('dashboard.chart.segments')}</h3>
              <p className="text-sm text-neutral-500">{t('dashboard.chart.segments.subtitle')}</p>
            </div>
            <span className="badge-gold">{t('sector.commerce')}</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={dashboardChartData.customerSegments}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={3}
              >
                {dashboardChartData.customerSegments.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px' }} formatter={(v) => `${v}%`} />
              <Legend wrapperStyle={{ fontSize: '13px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Second row */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Model comparison */}
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-neutral-900">{t('dashboard.chart.models')}</h3>
              <p className="text-sm text-neutral-500">{t('dashboard.chart.models.subtitle')}</p>
            </div>
            <span className="badge-forest">AutoML</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dashboardChartData.modelComparison}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="model" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} domain={[0, 100]} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
              <Legend wrapperStyle={{ fontSize: '13px' }} />
              <Bar dataKey="accuracy" name="Accuracy %" fill="#df8429" radius={[6, 6, 0, 0]} />
              <Bar dataKey="precision" name="Precision %" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Activity feed */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-savanna-600" />
            <h3 className="font-semibold text-neutral-900">{t('dashboard.activity')}</h3>
          </div>
          <div className="space-y-3 max-h-[240px] overflow-y-auto scrollbar-thin">
            {recentActivity.map((a) => (
              <div key={a.id} className="flex items-start gap-3 pb-3 border-b border-neutral-100 last:border-0 last:pb-0">
                <div className="w-2 h-2 rounded-full bg-savanna-400 mt-1.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-neutral-700">{a.action}</p>
                  <p className="text-xs text-neutral-400 mt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {timeAgo(a.time, lang)}
                  </p>
                </div>
              </div>
            ))}
          </div>
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

      {/* Weekly activity chart */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-neutral-900">{t('dashboard.weekly')}</h3>
            <p className="text-sm text-neutral-500">{t('dashboard.weekly.subtitle')}</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={dashboardChartData.weeklyActivity}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} />
            <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
            <Legend wrapperStyle={{ fontSize: '13px' }} />
            <Bar dataKey="datasets" name="Datasets" fill="#0ea5e9" radius={[4, 4, 0, 0]} stackId="a" />
            <Bar dataKey="models" name="Models" fill="#df8429" radius={[4, 4, 0, 0]} stackId="a" />
            <Bar dataKey="reports" name="Reports" fill="#eab308" radius={[4, 4, 0, 0]} stackId="a" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
