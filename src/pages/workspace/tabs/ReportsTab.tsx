import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText, FileSpreadsheet, Download, Plus, Trash2, Eye, Loader2, AlertTriangle, ImagePlus, Info,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/report';
import { generateReport, reportErrorCode, type ReportTemplate } from '@/lib/generateReport';
import { logoPath, toJpegLogo } from '@/lib/brandLogo';
import type { Report } from '@/types';
import { EmptyState, CardSkeleton } from '@/components/ui/Loading';
import { timeAgo, cn } from '@/lib/utils';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/lib/workspace';

const templates: { id: ReportTemplate; icon: typeof FileText; format: 'pdf' | 'csv' }[] = [
  { id: 'exec', icon: FileText, format: 'pdf' },
  { id: 'detailed', icon: FileText, format: 'pdf' },
  { id: 'data', icon: FileSpreadsheet, format: 'csv' },
];

const SIGNED_URL_SECONDS = 300;

export function ReportsTab({ projectId }: { projectId: string }) {
  const { t, lang } = useI18n();
  const { canWrite, isOwner } = useWorkspace();
  const { user, profile } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerator, setShowGenerator] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const premium = profile?.plan === 'premium' || profile?.plan === 'enterprise';
  const company = (profile?.company ?? '').trim();
  const showBrandPanel = isOwner && !!user;

  const loadReports = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('reports')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (err) reportError(err, { where: 'ReportsTab.load' });
    setReports(err ? [] : ((data as Report[]) ?? []));
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const refreshLogo = useCallback(async () => {
    if (!user || !isOwner || !premium) { setLogoUrl(null); return; }
    const { data } = await supabase.storage.from('reports').createSignedUrl(logoPath(user.id), SIGNED_URL_SECONDS);
    setLogoUrl(data?.signedUrl ?? null);
  }, [user, isOwner, premium]);

  useEffect(() => { refreshLogo(); }, [refreshLogo]);

  const handleGenerate = useCallback(async () => {
    if (!selectedTemplate) return;
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await generateReport(projectId, selectedTemplate, lang);
      if (!res.ok) {
        setError(t(`reports.err.${reportErrorCode(res.code)}`));
        return;
      }
      if (res.brandNameMissing) setNotice(t('reports.brand.missingName'));
      setShowGenerator(false);
      setSelectedTemplate(null);
      await loadReports();
    } catch (err) {
      reportError(err, { where: 'ReportsTab.generate' });
      setError(t('reports.err.unknown'));
    } finally {
      setGenerating(false);
    }
  }, [selectedTemplate, projectId, lang, loadReports, t]);

  const open = useCallback(async (report: Report, download: boolean) => {
    if (!report.file_url) return;
    setError(null);
    const { data, error: err } = await supabase.storage.from('reports').createSignedUrl(
      report.file_url, SIGNED_URL_SECONDS, download ? { download: `${report.name}.${report.format}` } : undefined,
    );
    if (err || !data?.signedUrl) {
      if (err) reportError(err, { where: 'ReportsTab.signedUrl' });
      setError(t('reports.err.download'));
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  }, [t]);

  const handleDelete = useCallback(async (report: Report) => {
    setDeletingId(report.id);
    setError(null);
    const { error: err } = await supabase.from('reports').delete().eq('id', report.id);
    if (err) {
      reportError(err, { where: 'ReportsTab.delete' });
      setError(t('reports.err.delete'));
    } else {
      setReports(prev => prev.filter(r => r.id !== report.id));
      if (report.file_url) {
        const { error: rmErr } = await supabase.storage.from('reports').remove([report.file_url]);
        if (rmErr) reportError(rmErr, { where: 'ReportsTab.removeFile' });
      }
    }
    setDeletingId(null);
  }, [t]);

  const handleLogo = useCallback(async (file: File | undefined) => {
    if (!file || !user) return;
    setLogoBusy(true);
    setLogoError(null);
    try {
      const out = await toJpegLogo(file);
      if ('error' in out) { setLogoError(t(`reports.logo.err.${out.error}`)); return; }
      const { error: err } = await supabase.storage.from('reports').upload(logoPath(user.id), out.blob, {
        upsert: true, contentType: 'image/jpeg',
      });
      if (err) { reportError(err, { where: 'ReportsTab.logoUpload' }); setLogoError(t('reports.logo.err.upload')); return; }
      await refreshLogo();
    } finally {
      setLogoBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }, [user, refreshLogo, t]);

  const removeLogo = useCallback(async () => {
    if (!user) return;
    setLogoBusy(true);
    setLogoError(null);
    const { error: err } = await supabase.storage.from('reports').remove([logoPath(user.id)]);
    if (err) { reportError(err, { where: 'ReportsTab.logoRemove' }); setLogoError(t('reports.logo.err.upload')); } else setLogoUrl(null);
    setLogoBusy(false);
  }, [user, t]);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">{t('reports.title')}</h2>
          <p className="text-sm text-neutral-500 mt-1">{reports.length} {t('reports.subtitle')}</p>
        </div>
        {canWrite && (
          <button onClick={() => setShowGenerator(!showGenerator)} className="btn-primary">
            <Plus className="w-4 h-4" /> {t('reports.generate')}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="p-3 rounded-xl bg-clay-50 border border-clay-200 text-sm text-clay-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}
      {notice && (
        <p role="status" className="p-3 rounded-xl bg-gold-50 border border-gold-200 text-sm text-gold-800 flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> {notice}{' '}
          <Link to="/settings" className="underline">{t('reports.brand.openSettings')}</Link>
        </p>
      )}

      {/* Report generator */}
      {showGenerator && canWrite && (
        <div className="card p-6 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-neutral-900">{t('reports.template')}</h3>
            <button onClick={() => setShowGenerator(false)} className="btn-ghost p-2" aria-label={t('reports.cancel')}>✕</button>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 mb-4" role="radiogroup" aria-label={t('reports.template')}>
            {templates.map((tpl) => {
              const Icon = tpl.icon;
              return (
                <button
                  key={tpl.id}
                  role="radio"
                  aria-checked={selectedTemplate === tpl.id}
                  onClick={() => setSelectedTemplate(tpl.id)}
                  className={cn(
                    'flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all',
                    selectedTemplate === tpl.id ? 'border-savanna-400 bg-savanna-50' : 'border-neutral-200 hover:border-neutral-300'
                  )}
                >
                  <Icon className="w-6 h-6 text-savanna-600" />
                  <div className="font-semibold text-neutral-900 text-sm">{t(`reports.tpl.${tpl.id}`)}</div>
                  <div className="text-xs text-neutral-500">{t(`reports.tpl.${tpl.id}.desc`)}</div>
                  <span className="badge-neutral mt-1">{tpl.format.toUpperCase()}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-neutral-500">{t('reports.truth')}</p>

          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowGenerator(false)} className="btn-secondary">{t('reports.cancel')}</button>
            <button onClick={handleGenerate} disabled={!selectedTemplate || generating} className="btn-primary">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} {t('reports.gen.btn')}
            </button>
          </div>
        </div>
      )}

      {/* Marque : DAS en gratuit, nom + logo du client en Premium (décidé par le serveur) */}
      {showBrandPanel && (
        <div className="card p-6">
          <h3 className="font-semibold text-neutral-900">{t('reports.brand.title')}</h3>
          {!premium ? (
            <p className="text-sm text-neutral-500 mt-1">
              {t('reports.brand.free')}{' '}
              <Link to="/pricing" className="text-savanna-700 underline">{t('reports.brand.upgrade')}</Link>
            </p>
          ) : (
            <div className="mt-2 space-y-3">
              <p className="text-sm text-neutral-600">
                {company
                  ? <>{t('reports.brand.name')} <strong>{company}</strong> · <Link to="/settings" className="text-savanna-700 underline">{t('reports.brand.change')}</Link></>
                  : <>{t('reports.brand.missingName')} <Link to="/settings" className="text-savanna-700 underline">{t('reports.brand.openSettings')}</Link></>}
              </p>
              <div className="flex items-center gap-4 flex-wrap">
                {logoUrl ? (
                  <img src={logoUrl} alt={t('reports.logo.alt')} className="h-12 max-w-[200px] object-contain rounded border border-neutral-200 bg-white p-1" />
                ) : (
                  <span className="text-sm text-neutral-400">{t('reports.logo.none')}</span>
                )}
                <input
                  ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" id="brand-logo"
                  aria-label={t('reports.logo.upload')} onChange={(e) => handleLogo(e.target.files?.[0])}
                />
                <button type="button" className="btn-secondary text-sm" disabled={logoBusy} onClick={() => fileInput.current?.click()}>
                  {logoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />} {t('reports.logo.upload')}
                </button>
                {logoUrl && (
                  <button type="button" className="btn-ghost text-sm text-clay-600" disabled={logoBusy} onClick={removeLogo}>
                    {t('reports.logo.remove')}
                  </button>
                )}
              </div>
              {logoError && <p role="alert" className="text-sm text-clay-700">{logoError}</p>}
              <p className="text-xs text-neutral-400">{t('reports.logo.hint')}</p>
            </div>
          )}
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
            action={canWrite ? <button onClick={() => setShowGenerator(true)} className="btn-primary"><Plus className="w-4 h-4" /> {t('reports.generate')}</button> : undefined}
          />
        </div>
      ) : (
        <div className="card divide-y divide-neutral-100">
          {reports.map((report) => {
            const isCsv = report.format === 'csv';
            const branding = report.config?.branding === 'custom' ? 'custom' : 'das';
            return (
              <div key={report.id} className="flex items-center gap-4 p-4 hover:bg-neutral-50/50 transition-colors">
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', isCsv ? 'bg-ocean-50 text-ocean-600' : 'bg-clay-50 text-clay-600')}>
                  {isCsv ? <FileSpreadsheet className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-neutral-900 text-sm truncate">{report.name}</h3>
                  <div className="flex items-center gap-3 text-xs text-neutral-400 mt-0.5">
                    <span>{report.format.toUpperCase()}</span>
                    <span>· {timeAgo(report.created_at, lang)}</span>
                    <span>· {t(`reports.branding.${branding}`)}</span>
                  </div>
                </div>
                {report.file_url ? (
                  <>
                    {!isCsv && (
                      <button onClick={() => open(report, false)} className="btn-ghost p-2" aria-label={t('reports.view')}><Eye className="w-4 h-4" /></button>
                    )}
                    <button onClick={() => open(report, true)} className="btn-ghost p-2 text-savanna-600" aria-label={t('reports.download')}>
                      <Download className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <span className="badge-neutral">{t('reports.unavailable')}</span>
                )}
                {canWrite && (
                  <button
                    onClick={() => handleDelete(report)}
                    disabled={deletingId === report.id}
                    className="btn-ghost p-2 text-clay-600 disabled:opacity-50"
                    aria-label={t('reports.delete')}
                  >
                    {deletingId === report.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
