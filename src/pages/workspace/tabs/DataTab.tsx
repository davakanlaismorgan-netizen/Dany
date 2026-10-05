import { useEffect, useState, useRef } from 'react';
import {
  Upload, FileSpreadsheet, Link2, Database, Globe, Cloud,
  FileText, Table, Trash2, Eye, CheckCircle2,
  AlertTriangle, XCircle, Loader2,
} from 'lucide-react';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Dataset } from '@/types';

import { EmptyState, CardSkeleton, ErrorState } from '@/components/ui/Loading';
import { formatBytes, formatNumber, timeAgo, sanitizeFilename, cn } from '@/lib/utils';
import { useI18n } from '@/context/I18nContext';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const sourceIcons: Record<string, typeof Upload> = {
  csv: Upload,
  excel: FileSpreadsheet,
  api: Link2,
  database: Database,
  sheets: Globe,
  sample: Cloud,
};

const sourceLabels: Record<string, string> = {
  csv: 'CSV',
  excel: 'Excel',
  api: 'API',
  database: 'Database',
  sheets: 'Google Sheets',
  sample: 'Sample',
};

function parseCSV(text: string): { headers: string[]; rows: string[][]; rowCount: number } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [], rowCount: 0 };
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1, 100).map(l => parseCSVLine(l));
  return { headers, rows, rowCount: lines.length - 1 };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
    else if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

function parseJSON(text: string): { headers: string[]; rows: string[][]; rowCount: number } {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : [data];
  if (arr.length === 0) return { headers: [], rows: [], rowCount: 0 };
  const headers = Object.keys(arr[0]);
  const rows = arr.slice(0, 100).map(item => headers.map(h => String(item[h] ?? '')));
  return { headers, rows, rowCount: arr.length };
}

export function DataTab({ projectId }: { projectId: string }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
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
    } catch {
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
    if (file.size > MAX_FILE_SIZE) {
      setUploadError(lang === 'fr' ? 'Fichier trop volumineux (max 50 Mo)' : 'File too large (max 50MB)');
      return;
    }
    setUploading(true);
    setUploadError(null);

    const ext = file.name.split('.').pop()?.toLowerCase() || 'csv';
    const sourceType = ext === 'xls' || ext === 'xlsx' ? 'excel' : ext;
    const safeName = sanitizeFilename(file.name);
    const filePath = `${user.id}/${projectId}/${Date.now()}_${safeName}`;

    let rowCount = 0;
    let columnCount = 0;
    let headers: string[] = [];
    let previewRows: string[][] = [];

    try {
      if (ext === 'csv' || ext === 'json') {
        const text = await file.text();
        if (ext === 'csv') {
          const parsed = parseCSV(text);
          rowCount = parsed.rowCount;
          columnCount = parsed.headers.length;
          headers = parsed.headers;
          previewRows = parsed.rows;
        } else {
          const parsed = parseJSON(text);
          rowCount = parsed.rowCount;
          columnCount = parsed.headers.length;
          headers = parsed.headers;
          previewRows = parsed.rows;
        }
      }
    } catch {
      // parsing failed — continue with 0 counts
    }

    try {
      const { error: storageError } = await supabase.storage
        .from('datasets')
        .upload(filePath, file);

      if (storageError) throw storageError;

      const { data, error: dbError } = await supabase
        .from('datasets')
        .insert({
          project_id: projectId,
          name: file.name,
          source_type: sourceType,
          source_config: { storage_path: filePath, original_name: file.name },
          size_bytes: file.size,
          row_count: rowCount,
          column_count: columnCount,
          profiling: headers.length > 0 ? { headers, preview: previewRows } : {},
          status: headers.length > 0 ? 'profiled' : 'uploaded',
        })
        .select()
        .single();

      if (dbError) {
        await supabase.storage.from('datasets').remove([filePath]);
        throw dbError;
      }

      setDatasets(prev => [data as Dataset, ...prev]);
      setShowUpload(false);
    } catch (err) {
      setUploadError(friendlyError(err, lang === 'fr' ? 'Échec de l\'import' : 'Upload failed', t));
    } finally {
      setUploading(false);
    }
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
      setDatasets(prev => prev.filter(d => d.id !== ds.id));
      if (selectedDataset?.id === ds.id) setSelectedDataset(null);
    } catch {
      // keep both intact if either fails
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
        <button onClick={() => setShowUpload(!showUpload)} className="btn-primary">
          <Upload className="w-4 h-4" /> {t('data.upload')}
        </button>
      </div>

      {showUpload && (
        <div className="card p-6 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-neutral-900">{t('data.addsource')}</h3>
            <button onClick={() => { setShowUpload(false); setUploadError(null); }} className="btn-ghost p-2" aria-label="Close">✕</button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            {Object.entries(sourceLabels).map(([key, label]) => {
              const Icon = sourceIcons[key] || Upload;
              const isClickable = key === 'csv' || key === 'excel';
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
                </button>
              );
            })}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = '';
            }}
          />

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
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
            <div className="mt-3 p-3 rounded-lg bg-clay-50 border border-clay-200 text-sm text-clay-700 flex items-center gap-2">
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
            action={<button onClick={() => setShowUpload(true)} className="btn-primary"><Upload className="w-4 h-4" /> {t('data.upload')}</button>}
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
                      <button
                        onClick={() => handleDeleteDataset(ds)}
                        disabled={deletingId === ds.id}
                        className="btn-ghost p-2 text-xs text-clay-600 hover:bg-clay-50 disabled:opacity-50"
                        aria-label="Delete"
                      >
                        {deletingId === ds.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
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

function DataPreview({ dataset, onClose, t, lang }: { dataset: Dataset; onClose: () => void; t: (key: string) => string; lang: string }) {
  const profiling = dataset.profiling as { headers?: string[]; preview?: string[][] };
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
