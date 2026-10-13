import { onActivate } from '@/lib/a11y';
import { useEffect, useState, useRef } from 'react';
import {
  Upload, FileSpreadsheet, Link2, Database, Globe, Cloud,
  FileText, Trash2, Eye, CheckCircle2,
  AlertTriangle, XCircle, Loader2,
} from 'lucide-react';
import { friendlyError } from '@/lib/errors';
import { reportError } from '@/lib/report';
import { processDataset } from '@/lib/processDataset';
import { logActivity } from '@/lib/activity';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/lib/workspace';
import type { Dataset } from '@/types';

import { DataPreview } from './DataPreview';
import { EmptyState, CardSkeleton, ErrorState } from '@/components/ui/Loading';
import { formatBytes, formatNumber, timeAgo, sanitizeFilename, cn } from '@/lib/utils';
import { useI18n } from '@/context/I18nContext';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const sourceIcons: Record<string, typeof Upload> = {
  csv: Upload,
  json: FileText,
  excel: FileSpreadsheet,
  api: Link2,
  database: Database,
  sheets: Globe,
  sample: Cloud,
};

const sourceLabels: Record<string, string> = {
  csv: 'CSV',
  json: 'JSON',
  excel: 'Excel',
  api: 'API',
  database: 'Database',
  sheets: 'Google Sheets',
  sample: 'Sample',
};

export function DataTab({ projectId }: { projectId: string }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const ws = useWorkspace();
  const canWrite = ws.canWrite;
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadDatasets() {
    setLoadError(false);
    try {
      const { data, error } = await supabase
        .from('datasets')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDatasets((data as Dataset[]) ?? []);
    } catch (err) {
      reportError(err, { where: 'DataTab.load' });
      setDatasets([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDatasets();
  }, [projectId]);

  async function handleFileUpload(file: File) {
    if (!user) return;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (ext !== 'csv' && ext !== 'json') {
      setUploadError(t(ext === 'xlsx' || ext === 'xls' ? 'data.err.excel' : 'data.err.format'));
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError(t('data.err.too_large'));
      return;
    }
    setUploading(true);
    setUploadError(null);

    // Dossier du PROPRIÉTAIRE du projet (un éditeur écrit dans l'espace du propriétaire).
    const filePath = `${ws.ownerId ?? user.id}/${projectId}/${Date.now()}_${sanitizeFilename(file.name)}`;
    let datasetId: string | null = null;
    try {
      const { error: storageError } = await supabase.storage.from('datasets').upload(filePath, file);
      if (storageError) throw storageError;

      // Seules les colonnes d'identité sont écrites ici ; lignes, colonnes et profil sont calculés par le serveur.
      const { data, error: dbError } = await supabase
        .from('datasets')
        .insert({
          project_id: projectId,
          name: file.name,
          source_type: ext,
          source_config: { storage_path: filePath, original_name: file.name },
          size_bytes: file.size,
        })
        .select('id')
        .single();
      if (dbError) throw dbError;
      datasetId = data.id as string;

      const result = await processDataset(datasetId);
      if (!result.ok) {
        // Le serveur a déjà supprimé le dataset en cas de dépassement du plan ; sinon on nettoie ici.
        if (result.code !== 'plan_limit_rows') await removeDataset(datasetId, filePath);
        setUploadError(t(`data.err.${result.code}`));
        return;
      }
      void logActivity('dataset.imported', 'dataset', datasetId, { name: file.name });
      await loadDatasets();
      setShowUpload(false);
    } catch (err) {
      reportError(err, { where: 'DataTab.upload' });
      if (datasetId) await removeDataset(datasetId, filePath);
      else await supabase.storage.from('datasets').remove([filePath]).then(({ error }) => { if (error) reportError(error); });
      setUploadError(friendlyError(err, t('data.err.unknown'), t));
    } finally {
      setUploading(false);
    }
  }

  async function removeDataset(id: string, path: string) {
    const { error: e1 } = await supabase.from('datasets').delete().eq('id', id);
    const { error: e2 } = await supabase.storage.from('datasets').remove([path]);
    if (e1 || e2) reportError(e1 ?? e2, { where: 'DataTab.cleanup' });
  }

  async function handleDeleteDataset(ds: Dataset) {
    setDeletingId(ds.id);
    try {
      if (ds.source_config?.storage_path) {
        const { error: storageErr } = await supabase.storage
          .from('datasets')
          .remove([ds.source_config.storage_path as string]);
        if (storageErr) throw storageErr;
      }
      const { error: dbErr } = await supabase.from('datasets').delete().eq('id', ds.id);
      if (dbErr) throw dbErr;
      void logActivity('dataset.deleted', 'dataset', undefined, { name: ds.name });
      setDatasets(prev => prev.filter(d => d.id !== ds.id));
      if (selectedDataset?.id === ds.id) setSelectedDataset(null);
    } catch (err) {
      reportError(err, { where: 'DataTab.delete' });
      setUploadError(friendlyError(err, t('data.err.delete'), t));
      setShowUpload(true);
    } finally {
      setDeletingId(null);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">{t('data.title')}</h2>
          <p className="text-sm text-neutral-500 mt-1">{datasets.length} {t('data.subtitle')}</p>
        </div>
        {canWrite && (
          <button onClick={() => setShowUpload(!showUpload)} className="btn-primary">
            <Upload className="w-4 h-4" /> {t('data.upload')}
          </button>
        )}
      </div>

      {canWrite && showUpload && (
        <div className="card p-6 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-neutral-900">{t('data.addsource')}</h3>
            <button onClick={() => { setShowUpload(false); setUploadError(null); }} className="btn-ghost p-2" aria-label="Close">✕</button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            {Object.entries(sourceLabels).map(([key, label]) => {
              const Icon = sourceIcons[key] || Upload;
              const isClickable = key === 'csv' || key === 'json';
              return (
                <button
                  key={key}
                  onClick={() => {
                    if (isClickable) {
                      fileInputRef.current?.click();
                    }
                  }}
                  disabled={!isClickable}
                  className={cn(
                    'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                    isClickable
                      ? 'border-neutral-200 hover:border-savanna-300 hover:bg-savanna-50/50 cursor-pointer'
                      : 'border-neutral-100 opacity-50 cursor-not-allowed'
                  )}
                >
                  <Icon className="w-6 h-6 text-savanna-600" />
                  <span className="text-sm font-medium text-neutral-700">{label}</span>
                  {!isClickable && <span className="text-[10px] uppercase tracking-wide text-neutral-500">{t('common.soon')}</span>}
                </button>
              );
            })}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = '';
            }}
          />

          <div
            role="button"
            tabIndex={0}
            aria-label={t('data.upload')}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={onActivate(() => fileInputRef.current?.click())}
            className="border-2 border-dashed border-neutral-300 rounded-xl p-8 text-center hover:border-savanna-400 transition-colors cursor-pointer"
          >
            {uploading ? (
              <>
                <Loader2 className="w-10 h-10 text-savanna-500 mx-auto mb-3 animate-spin" />
                <p className="text-sm text-neutral-600">{t('common.loading')}</p>
              </>
            ) : (
              <>
                <Cloud className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
                <p className="text-sm text-neutral-600">{t('data.dropzone')}</p>
                <p className="text-xs text-neutral-400 mt-1">{t('data.dropzone.desc')}</p>
              </>
            )}
          </div>

          {uploadError && (
            <div role="alert" className="mt-3 p-3 rounded-lg bg-clay-50 border border-clay-200 text-sm text-clay-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {uploadError}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : loadError ? (
        <ErrorState message={t('common.error')} onRetry={loadDatasets} />
      ) : datasets.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Database className="w-8 h-8" />}
            title={t('data.empty.title')}
            description={t('data.empty.desc')}
            action={canWrite ? <button onClick={() => setShowUpload(true)} className="btn-primary"><Upload className="w-4 h-4" /> {t('data.upload')}</button> : undefined}
          />
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            {datasets.map((ds) => {
              const Icon = sourceIcons[ds.source_type] || FileText;
              return (
                <div key={ds.id} className="card card-hover p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-ocean-50 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-ocean-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-neutral-900 text-sm">{ds.name}</h3>
                        <span className="text-xs text-neutral-400">{sourceLabels[ds.source_type] || ds.source_type}</span>
                      </div>
                    </div>
                    <StatusBadge status={ds.status} />
                  </div>

                  <div className="grid grid-cols-3 gap-3 py-3 border-y border-neutral-100">
                    <Stat label={t('data.rows')} value={formatNumber(ds.row_count)} />
                    <Stat label={t('data.columns')} value={ds.column_count.toString()} />
                    <Stat label={t('data.size')} value={formatBytes(ds.size_bytes)} />
                  </div>

                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-neutral-400">{timeAgo(ds.created_at, lang)}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setSelectedDataset(ds)}
                        className="btn-ghost p-2 text-xs"
                        aria-label="Preview"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {canWrite && (
                        <button
                          onClick={() => handleDeleteDataset(ds)}
                          disabled={deletingId === ds.id}
                          className="btn-ghost p-2 text-xs text-clay-600 hover:bg-clay-50 disabled:opacity-50"
                          aria-label="Delete"
                        >
                          {deletingId === ds.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedDataset && (
            <DataPreview dataset={selectedDataset} onClose={() => setSelectedDataset(null)} t={t} lang={lang} />
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-semibold text-neutral-900">{value}</div>
      <div className="text-xs text-neutral-400">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: typeof CheckCircle2; color: string }> = {
    profiled: { icon: CheckCircle2, color: 'badge-forest' },
    uploaded: { icon: CheckCircle2, color: 'badge-ocean' },
    processing: { icon: AlertTriangle, color: 'badge-gold' },
    failed: { icon: XCircle, color: 'badge-clay' },
  };
  const c = config[status] || config.uploaded;
  const Icon = c.icon;
  return (
    <span className={cn('badge', c.color)}>
      <Icon className="w-3 h-3" /> {status}
    </span>
  );
}
