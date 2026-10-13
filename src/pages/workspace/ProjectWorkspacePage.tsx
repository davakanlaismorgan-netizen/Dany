import { useEffect, useState } from 'react';
import { useParams, Routes, Route, NavLink, Link, Navigate } from 'react-router-dom';
import {
  Database, Workflow, Sparkles, BarChart3, FileText,
  ChevronRight, Landmark, ShoppingBag, Sprout, HeartPulse, Truck, Settings,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/report';
import type { Project } from '@/types';
import { sectorConfig } from '@/lib/sectors';
import { FullPageLoader, ErrorState } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { listWorkspaces } from '@/lib/team';
import { WorkspaceContext, accessFor, type WorkspaceAccess } from '@/lib/workspace';
import { DataTab } from './tabs/DataTab';
import { PipelineTab } from './tabs/PipelineTab';
import { ModelsTab } from './tabs/ModelsTab';
import { VisualizationsTab } from './tabs/VisualizationsTab';
import { ReportsTab } from './tabs/ReportsTab';
import { ProjectSettingsTab } from './tabs/ProjectSettingsTab';

const sectorIcons: Record<string, typeof Landmark> = {
  finance: Landmark,
  commerce: ShoppingBag,
  agriculture: Sprout,
  healthcare: HeartPulse,
  logistics: Truck,
};

const tabs = [
  { path: 'data', labelKey: 'workspace.tab.data', icon: Database },
  { path: 'pipeline', labelKey: 'workspace.tab.pipeline', icon: Workflow },
  { path: 'models', labelKey: 'workspace.tab.models', icon: Sparkles },
  { path: 'visualizations', labelKey: 'workspace.tab.viz', icon: BarChart3 },
  { path: 'reports', labelKey: 'workspace.tab.reports', icon: FileText },
];

export function ProjectWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const { user } = useAuth();
  const userId = user?.id;
  const [project, setProject] = useState<Project | null>(null);
  const [access, setAccess] = useState<WorkspaceAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function loadProject() {
      if (!id) {
        setLoading(false);
        setError(true);
        return;
      }
      try {
        const { data, error } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        if (data && userId) {
          const p = data as Project;
          // Mon projet : propriétaire. Sinon : mon rôle dans l'équipe du propriétaire (lecture seule par défaut :
          // l'interface ne fait qu'adapter l'affichage, la base impose les vrais droits).
          let role: 'editor' | 'viewer' | null = null;
          if (p.user_id !== userId) {
            try {
              role = (await listWorkspaces()).find((w) => w.owner_id === p.user_id)?.role ?? null;
            } catch (e) {
              reportError(e, { where: 'ProjectWorkspacePage.role' });
            }
          }
          setAccess(accessFor(p.user_id, userId, role));
          setProject(p);
        } else {
          setError(true);
        }
      } catch (err) {
        reportError(err, { where: 'ProjectWorkspacePage.load#1' });
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    loadProject();
  }, [id, userId]);

  if (loading) return <FullPageLoader />;
  if (error || !project || !access) return <ErrorState message={t('common.error')} onRetry={() => window.location.reload()} />;

  const SectorIcon = sectorIcons[project.sector] || Database;
  const sector = sectorConfig[project.sector] || sectorConfig.general;

  return (
    <WorkspaceContext.Provider value={access}>
    <div className="min-h-full">
      {/* Project header */}
      <div className="bg-white border-b border-neutral-200 px-6 lg:px-8 pt-6">
        <div className="max-w-7xl mx-auto">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-neutral-400 mb-4">
            <Link to="/projects" className="hover:text-neutral-600">{t('app.projects')}</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-neutral-700">{project.name}</span>
          </div>

          {/* Title row */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-savanna-500 to-clay-500 flex items-center justify-center text-white shrink-0">
                <SectorIcon className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl lg:text-2xl font-display font-bold text-neutral-900">{project.name}</h1>
                {project.description && (
                  <p className="text-sm text-neutral-500 mt-1 max-w-2xl">{project.description}</p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <span className="badge-savanna">{sector.label}</span>
                  <span className={cn('badge', project.status === 'active' ? 'badge-forest' : 'badge-neutral')}>
                    {project.status}
                  </span>
                </div>
              </div>
            </div>
            {access.isOwner && (
              <Link to={`/projects/${project.id}/settings`} className="btn-ghost text-sm hidden sm:flex">
                <Settings className="w-4 h-4" /> {t('settings.title')}
              </Link>
            )}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin -mb-px">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <NavLink
                  key={tab.path}
                  to={`/projects/${id}/${tab.path}`}
                  className={({ isActive }) => cn(
                    'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap',
                    isActive
                      ? 'border-savanna-500 text-savanna-600'
                      : 'border-transparent text-neutral-500 hover:text-neutral-800 hover:border-neutral-300'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {t(tab.labelKey)}
                </NavLink>
              );
            })}
          </div>
        </div>
      </div>

      {!access.isOwner && (
        <div role="note" className="max-w-7xl mx-auto px-6 lg:px-8 pt-4">
          <div className="p-3 rounded-xl bg-ocean-50 border border-ocean-200 text-sm text-ocean-800">
            {t(access.canWrite ? 'workspace.shared.editor' : 'workspace.shared.viewer')}
          </div>
        </div>
      )}

      {/* Tab content */}
      <div className="max-w-7xl mx-auto">
        <Routes>
          <Route index element={<DataTab projectId={project.id} />} />
          <Route path="data" element={<DataTab projectId={project.id} />} />
          <Route path="pipeline" element={<PipelineTab projectId={project.id} />} />
          <Route path="models" element={<ModelsTab projectId={project.id} />} />
          <Route path="visualizations" element={<VisualizationsTab projectId={project.id} />} />
          <Route path="reports" element={<ReportsTab projectId={project.id} />} />
          <Route
            path="settings"
            element={access.isOwner ? <ProjectSettingsTab projectId={project.id} project={project} /> : <Navigate to={`/projects/${project.id}/data`} replace />}
          />
        </Routes>
      </div>
    </div>
    </WorkspaceContext.Provider>
  );
}
