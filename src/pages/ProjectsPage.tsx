import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, FolderKanban, LayoutGrid, List } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Project, Sector } from '@/types';
import { sectorConfig } from '@/lib/sectors';
import { CardSkeleton, EmptyState } from '@/components/ui/Loading';
import { timeAgo, cn } from '@/lib/utils';
import { useI18n } from '@/context/I18nContext';

const sectorColors: Record<string, string> = {
  finance: '#df8429',
  commerce: '#eab308',
  agriculture: '#22c55e',
  healthcare: '#e45a2b',
  logistics: '#0ea5e9',
  general: '#64748b',
};

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState<Sector | 'all'>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const { t, lang } = useI18n();

  const sectorFilters: { value: Sector | 'all'; label: string }[] = [
    { value: 'all', label: t('projects.allsectors') },
    { value: 'finance', label: t('sector.finance') },
    { value: 'commerce', label: t('sector.commerce') },
    { value: 'agriculture', label: t('sector.agriculture') },
    { value: 'healthcare', label: t('sector.healthcare') },
    { value: 'logistics', label: t('sector.logistics') },
  ];

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase.from('projects').select('*').order('updated_at', { ascending: false });
        if (error) throw error;
        setProjects((data as Project[]) ?? []);
      } catch {
        setProjects([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = projects.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesSector = sectorFilter === 'all' || p.sector === sectorFilter;
    return matchesSearch && matchesSector;
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-neutral-900">{t('projects.title')}</h1>
          <p className="text-neutral-500 mt-1">{filtered.length} {t('projects.title')}</p>
        </div>
        <Link to="/projects/new" className="btn-primary">
          <Plus className="w-4 h-4" /> {t('app.newproject')}
        </Link>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('projects.search')}
            className="input-field pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white border border-neutral-200 rounded-xl p-0.5">
            <button
              onClick={() => setView('grid')}
              className={cn('p-2 rounded-lg transition-all', view === 'grid' ? 'bg-savanna-50 text-savanna-600' : 'text-neutral-400')}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={cn('p-2 rounded-lg transition-all', view === 'list' ? 'bg-savanna-50 text-savanna-600' : 'text-neutral-400')}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Sector filters */}
      <div className="flex flex-wrap gap-2">
        {sectorFilters.map((f) => (
          <button
            key={f.value}
            onClick={() => setSectorFilter(f.value)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
              sectorFilter === f.value
                ? 'bg-savanna-600 text-white'
                : 'bg-white border border-neutral-200 text-neutral-600 hover:border-neutral-300'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Projects */}
      {loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<FolderKanban className="w-8 h-8" />}
            title={t('projects.empty.title')}
            description={search ? (lang === 'fr' ? 'Essayez un autre terme de recherche' : 'Try a different search term') : t('projects.empty.desc')}
            action={<Link to="/projects/new" className="btn-primary"><Plus className="w-4 h-4" /> {t('projects.empty.button')}</Link>}
          />
        </div>
      ) : view === 'grid' ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((project) => {
            const sector = sectorConfig[project.sector] || sectorConfig.general;
            return (
              <Link key={project.id} to={`/projects/${project.id}`} className="card card-hover p-5 block">
                <div className="flex items-center justify-between mb-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-semibold"
                    style={{ backgroundColor: sectorColors[project.sector] || '#64748b' }}
                  >
                    {sector.label[0]}
                  </div>
                  <span className={cn('badge', project.status === 'active' ? 'badge-forest' : 'badge-neutral')}>
                    {project.status}
                  </span>
                </div>
                <h3 className="font-semibold text-neutral-900 mb-1">{project.name}</h3>
                <p className="text-sm text-neutral-500 line-clamp-2">{project.description}</p>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-100">
                  <span className="text-xs text-neutral-400">{sector.label}</span>
                  <span className="text-xs text-neutral-400">{timeAgo(project.updated_at, lang)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="card divide-y divide-neutral-100">
          {filtered.map((project) => {
            const sector = sectorConfig[project.sector] || sectorConfig.general;
            return (
              <Link key={project.id} to={`/projects/${project.id}`} className="flex items-center gap-4 p-4 hover:bg-neutral-50 transition-colors">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-semibold shrink-0"
                  style={{ backgroundColor: sectorColors[project.sector] || '#64748b' }}
                >
                  {sector.label[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-neutral-900 truncate">{project.name}</h3>
                  <p className="text-sm text-neutral-500 truncate">{project.description}</p>
                </div>
                <span className="badge-neutral hidden sm:inline-flex">{sector.label}</span>
                <span className={cn('badge', project.status === 'active' ? 'badge-forest' : 'badge-neutral')}>
                  {project.status}
                </span>
                <span className="text-xs text-neutral-400 hidden md:block w-24 text-right">{timeAgo(project.updated_at, lang)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
