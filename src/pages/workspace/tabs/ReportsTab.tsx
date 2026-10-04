import { useState, useEffect, useCallback } from 'react';
import {
  FileText, FileSpreadsheet, Presentation, Download, CheckCircle2,
  Clock, Mail, MessageCircle, Send, Plus, Trash2, Eye, Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Report } from '@/types';
import { EmptyState, CardSkeleton } from '@/components/ui/Loading';
import { timeAgo, cn } from '@/lib/utils';
import { useI18n } from '@/context/I18nContext';

const reportTemplates = [
  { id: 'exec', nameKey: 'Executive Summary', nameFr: 'Synthèse Exécutive', descEn: 'High-level overview with key metrics and recommendations', descFr: 'Vue d\'ensemble avec métriques clés et recommandations', icon: FileText, format: 'pdf' },
  { id: 'detailed', nameKey: 'Detailed Analysis', nameFr: 'Analyse Détaillée', descEn: 'Comprehensive report with charts, models, and data tables', descFr: 'Rapport complet avec graphiques, modèles et tableaux', icon: FileSpreadsheet, format: 'pdf' },
  { id: 'presentation', nameKey: 'Presentation Deck', nameFr: 'Présentation', descEn: 'Slide deck for stakeholder presentations', descFr: 'Diapositives pour présentations aux parties prenantes', icon: Presentation, format: 'ppt' },
];

const formatIcons: Record<string, typeof FileText> = {
  pdf: FileText,
  ppt: Presentation,
  docx: FileSpreadsheet,
};

const formatColors: Record<string, string> = {
  pdf: 'clay',
  ppt: 'savanna',
  docx: 'ocean',
};

const formatLabels: Record<string, string> = {
  pdf: 'PDF',
  ppt: 'PPT',
  docx: 'DOCX',
};

export function ReportsTab({ projectId }: { projectId: string }) {
  const { t, lang } = useI18n();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerator, setShowGenerator] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function loadReports() {
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) {
        setReports([]);
      } else {
        setReports((data as Report[]) ?? []);
      }
      setLoading(false);
    }
    loadReports();
  }, [projectId]);

  const handleGenerate = useCallback(async () => {
    if (!selectedTemplate) return;
    const tpl = reportTemplates.find(rt => rt.id === selectedTemplate);
    if (!tpl) return;
    setGenerating(true);
    try {
      const name = `${lang === 'fr' ? tpl.nameFr : tpl.nameKey} — ${new Date().toLocaleDateString()}`;
      const { data, error } = await supabase
        .from('reports')
        .insert({
          project_id: projectId,
          name,
          format: tpl.format,
          status: 'generating',
          config: { template: tpl.id },
        })
        .select()
        .single();
      if (error) throw error;
      if (data) {
        setReports(prev => [data as Report, ...prev]);
        // Simulate generation completion
        const reportId = data.id;
        setTimeout(async () => {
          await supabase.from('reports').update({
            status: 'completed',
            file_url: `reports/${projectId}/${reportId}.${tpl.format}`,
          }).eq('id', reportId);
          setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: 'completed', file_url: `reports/${projectId}/${reportId}.${tpl.format}` } : r));
        }, 2500);
      }
      setShowGenerator(false);
      setSelectedTemplate(null);
    } catch {
      // stay on form so user can retry
    } finally {
      setGenerating(false);
    }
  }, [selectedTemplate, projectId, lang]);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    const { error } = await supabase.from('reports').delete().eq('id', id);
    if (!error) {
      setReports(prev => prev.filter(r => r.id !== id));
    }
    setDeletingId(null);
  }, []);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">{t('reports.title')}</h2>
          <p className="text-sm text-neutral-500 mt-1">{reports.length} {t('reports.subtitle')}</p>
        </div>
        <button onClick={() => setShowGenerator(!showGenerator)} className="btn-primary">
          <Plus className="w-4 h-4" /> {t('reports.generate')}
        </button>
      </div>

      {/* Report generator */}
      {showGenerator && (
        <div className="card p-6 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-neutral-900">{t('reports.template')}</h3>
            <button onClick={() => setShowGenerator(false)} className="btn-ghost p-2">✕</button>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            {reportTemplates.map((tpl) => {
              const Icon = tpl.icon;
              return (
                <button
                  key={tpl.id}
                  onClick={() => setSelectedTemplate(tpl.id)}
                  className={cn(
                    'flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all',
                    selectedTemplate === tpl.id ? 'border-savanna-400 bg-savanna-50' : 'border-neutral-200 hover:border-neutral-300'
                  )}
                >
                  <Icon className="w-6 h-6 text-savanna-600" />
                  <div className="font-semibold text-neutral-900 text-sm">{lang === 'fr' ? tpl.nameFr : tpl.nameKey}</div>
                  <div className="text-xs text-neutral-500">{lang === 'fr' ? tpl.descFr : tpl.descEn}</div>
                  <span className="badge-neutral mt-1">{formatLabels[tpl.format]}</span>
                </button>
              );
            })}
          </div>

          {/* Delivery options */}
          <div className="border-t border-neutral-100 pt-4">
            <h4 className="text-sm font-semibold text-neutral-700 mb-3">{t('reports.delivery')}</h4>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 cursor-pointer hover:bg-neutral-50">
                <input type="checkbox" className="rounded text-savanna-600" defaultChecked />
                <Download className="w-4 h-4 text-neutral-500" />
                <span className="text-sm">{t('reports.download')}</span>
              </label>
              <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 cursor-pointer hover:bg-neutral-50">
                <input type="checkbox" className="rounded text-savanna-600" />
                <Mail className="w-4 h-4 text-neutral-500" />
                <span className="text-sm">{t('reports.email')}</span>
              </label>
              <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 cursor-pointer hover:bg-neutral-50">
                <input type="checkbox" className="rounded text-savanna-600" />
                <MessageCircle className="w-4 h-4 text-forest-600" />
                <span className="text-sm">{t('reports.whatsapp')}</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowGenerator(false)} className="btn-secondary">{t('reports.cancel')}</button>
            <button onClick={handleGenerate} disabled={!selectedTemplate || generating} className="btn-primary">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {t('reports.gen.btn')}
            </button>
          </div>
        </div>
      )}

      {/* Reports list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : reports.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<FileText className="w-8 h-8" />}
            title={t('reports.empty.title')}
            description={t('reports.empty.desc')}
            action={<button onClick={() => setShowGenerator(true)} className="btn-primary"><Plus className="w-4 h-4" /> {t('reports.generate')}</button>}
          />
        </div>
      ) : (
        <div className="card divide-y divide-neutral-100">
          {reports.map((report) => {
            const FormatIcon = formatIcons[report.format] || FileText;
            const colorClass = formatColors[report.format] || 'neutral';
            return (
              <div key={report.id} className="flex items-center gap-4 p-4 hover:bg-neutral-50/50 transition-colors">
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                  colorClass === 'clay' && 'bg-clay-50 text-clay-600',
                  colorClass === 'savanna' && 'bg-savanna-50 text-savanna-600',
                  colorClass === 'ocean' && 'bg-ocean-50 text-ocean-600',
                )}>
                  <FormatIcon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-neutral-900 text-sm truncate">{report.name}</h3>
                  <div className="flex items-center gap-3 text-xs text-neutral-400 mt-0.5">
                    <span>{formatLabels[report.format] || report.format}</span>
                    <span>· {timeAgo(report.created_at, lang)}</span>
                  </div>
                </div>
                {report.status === 'completed' ? (
                  <>
                    <span className="badge-forest hidden sm:inline-flex">
                      <CheckCircle2 className="w-3 h-3" /> {t('reports.ready')}
                    </span>
                    <button className="btn-ghost p-2" aria-label="View report"><Eye className="w-4 h-4" /></button>
                    <button
                      onClick={() => {
                        if (report.file_url) {
                          supabase.storage.from('reports').createSignedUrl(report.file_url, 3600).then(({ data }) => {
                            if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                          });
                        }
                      }}
                      className="btn-ghost p-2 text-savanna-600" aria-label="Download report"
                    ><Download className="w-4 h-4" /></button>
                  </>
                ) : (
                  <span className="badge-gold">
                    <Clock className="w-3 h-3 animate-pulse" /> {t('reports.generating')}
                  </span>
                )}
                <button
                  onClick={() => handleDelete(report.id)}
                  disabled={deletingId === report.id}
                  className="btn-ghost p-2 text-clay-600 disabled:opacity-50"
                >
                  {deletingId === report.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Scheduled reports info */}
      <div className="card p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-ocean-50 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-ocean-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-neutral-900">{t('reports.scheduled')}</h3>
            <p className="text-sm text-neutral-500 mt-1">
              {t('reports.scheduled.desc')}
            </p>
            <button className="btn-secondary text-sm mt-3">
              <Plus className="w-4 h-4" /> {t('reports.schedule.new')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
