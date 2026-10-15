import { onActivate } from '@/lib/a11y';
import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  Plus, Sparkles, CheckCircle2, XCircle, Loader2, Brain, Target, Zap, Award, Info, AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/report';
import { runAutoMl, automlErrorCode } from '@/lib/runAutoMl';
import { useWorkspace } from '@/lib/workspace';
import type { Model } from '@/types';

import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/Loading';
import { timeAgo, cn } from '@/lib/utils';
import { useI18n } from '@/context/I18nContext';

const statusConfig: Record<string, { icon: typeof CheckCircle2; labelKey: string; color: string }> = {
  completed: { icon: CheckCircle2, labelKey: 'models.status.completed', color: 'badge-forest' },
  training: { icon: Loader2, labelKey: 'models.status.training', color: 'badge-gold' },
  pending: { icon: Loader2, labelKey: 'models.status.pending', color: 'badge-neutral' },
  failed: { icon: XCircle, labelKey: 'models.status.failed', color: 'badge-clay' },
};
const KNOWN_METRICS = ['accuracy', 'f1_macro', 'precision_macro', 'recall_macro', 'rmse', 'mae', 'r2'];
const DROP_REASONS = ['missing', 'constant', 'id_like', 'too_wide'];

interface DatasetOption { id: string; name: string; headers: string[] }
type Task = 'classification' | 'regression';
interface LeaderRow { label: string; score: number; metrics?: Record<string, number> }
interface DroppedCol { column: string; reason: string }

export function ModelsTab({ projectId }: { projectId: string }) {
  const { t, lang } = useI18n();
  const { canWrite } = useWorkspace();
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [showNewModel, setShowNewModel] = useState(false);
  const [form, setForm] = useState({ name: '', task: 'classification' as Task, datasetId: '', target: '' });
  const [datasets, setDatasets] = useState<DatasetOption[]>([]);
  const [training, setTraining] = useState(false);
  const [trainError, setTrainError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDatasets() {
      const { data } = await supabase.from('datasets').select('id, name, profiling').eq('project_id', projectId).eq('status', 'profiled');
      setDatasets(((data as { id: string; name: string; profiling: { headers?: string[] } | null }[]) ?? []).map((d) => ({
        id: d.id, name: d.name, headers: Array.isArray(d.profiling?.headers) ? d.profiling!.headers! : [],
      })));
    }
    loadDatasets();
  }, [projectId]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(false);
      try {
        const { data, error } = await supabase.from('models').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
        if (error) throw error;
        setModels((data as Model[]) ?? []);
      } catch (err) {
        reportError(err, { where: 'ModelsTab.load' });
        setModels([]);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectId, reloadKey]);

  const columns = datasets.find((d) => d.id === form.datasetId)?.headers ?? [];

  async function train() {
    if (!form.datasetId || !form.target) return;
    setTraining(true);
    setTrainError(null);
    try {
      const res = await runAutoMl({ datasetId: form.datasetId, target: form.target, task: form.task, name: form.name.trim() || undefined });
      if (!res.ok) {
        setTrainError(`${t(`models.err.${automlErrorCode(res.code)}`)}${res.detail ? ` (${res.detail})` : ''}`);
        return;
      }
      setForm({ name: '', task: 'classification', datasetId: '', target: '' });
      setShowNewModel(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      reportError(err, { where: 'ModelsTab.train' });
      setTrainError(t('models.err.unknown'));
    } finally {
      setTraining(false);
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">{t('models.title')}</h2>
          <p className="text-sm text-neutral-500 mt-1">{models.length} {t('models.subtitle')}</p>
          {!canWrite && <p className="text-xs text-neutral-500 mt-1">{t('models.readonly')}</p>}
        </div>
        {canWrite && (
          <button type="button" onClick={() => setShowNewModel(!showNewModel)} className="btn-primary">
            <Plus className="w-4 h-4" /> {t('models.new')}
          </button>
        )}
      </div>

      {showNewModel && canWrite && (
        <div className="card p-6 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-neutral-900">{t('models.config')}</h3>
            <button type="button" aria-label={t('models.cancel')} onClick={() => setShowNewModel(false)} className="btn-ghost p-2">✕</button>
          </div>
          {datasets.length === 0 ? (
            <p className="text-sm text-neutral-600">{t('models.no_datasets')}</p>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="m-name" className="block text-sm font-medium text-neutral-700 mb-1.5">{t('models.name')}</label>
                <input id="m-name" type="text" maxLength={100} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t('models.name.placeholder')} className="input-field" />
              </div>
              <div>
                <label htmlFor="m-task" className="block text-sm font-medium text-neutral-700 mb-1.5">{t('models.tasktype')}</label>
                <select id="m-task" value={form.task} onChange={(e) => setForm((f) => ({ ...f, task: e.target.value as Task }))} className="input-field">
                  <option value="classification">{t('models.task.classification')}</option>
                  <option value="regression">{t('models.task.regression')}</option>
                </select>
              </div>
              <div>
                <label htmlFor="m-dataset" className="block text-sm font-medium text-neutral-700 mb-1.5">{t('models.dataset')}</label>
                <select id="m-dataset" value={form.datasetId} onChange={(e) => setForm((f) => ({ ...f, datasetId: e.target.value, target: '' }))} className="input-field">
                  <option value="">{t('models.dataset.pick')}</option>
                  {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="m-target" className="block text-sm font-medium text-neutral-700 mb-1.5">{t('models.target')}</label>
                <select id="m-target" value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} className="input-field" disabled={!form.datasetId}>
                  <option value="">{t('models.target.pick')}</option>
                  {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="mt-4 p-4 rounded-xl bg-savanna-50 border border-savanna-200">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-savanna-600" aria-hidden="true" />
              <span className="text-sm font-semibold text-savanna-800">{t('models.automl')}</span>
            </div>
            <p className="text-xs text-savanna-700">{t('models.automl.desc')}</p>
          </div>

          {trainError && (
            <p role="alert" className="mt-4 p-3 rounded-xl bg-clay-50 border border-clay-200 text-sm text-clay-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> {trainError}
            </p>
          )}
          {training && <p role="status" className="mt-4 text-sm text-neutral-600">{t('models.training')}</p>}

          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setShowNewModel(false)} className="btn-secondary">{t('models.cancel')}</button>
            <button type="button" onClick={train} disabled={!form.datasetId || !form.target || training} className="btn-primary">
              {training ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} {t('models.start')}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : loadError ? (
        <ErrorState message={t('common.error')} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : models.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Brain className="w-8 h-8" />}
            title={t('models.empty.title')}
            description={t('models.empty.desc')}
            action={canWrite ? <button type="button" onClick={() => setShowNewModel(true)} className="btn-primary"><Plus className="w-4 h-4" /> {t('models.new')}</button> : undefined}
          />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {models.map((model) => {
            const status = statusConfig[model.status] || statusConfig.pending;
            const StatusIcon = status.icon;
            const metrics = Object.entries(model.metrics ?? {}).filter(([k]) => KNOWN_METRICS.includes(k));
            const done = model.status === 'completed';
            const toggle = () => done && setSelectedModel(selectedModel?.id === model.id ? null : model);
            return (
              <div
                key={model.id}
                role={done ? 'button' : undefined}
                tabIndex={done ? 0 : undefined}
                onClick={toggle}
                onKeyDown={onActivate(toggle)}
                className={cn('card p-5', done && 'cursor-pointer card-hover')}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-savanna-50 flex items-center justify-center">
                      <Brain className="w-5 h-5 text-savanna-600" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-neutral-900 text-sm">{model.name}</h3>
                      <p className="text-xs text-neutral-400">{algorithmLabel(model.algorithm, t)} · {taskLabel(model.task_type, t)}</p>
                    </div>
                  </div>
                  <span className={cn('badge', status.color)}>
                    <StatusIcon className="w-3 h-3" />
                    {t(status.labelKey)}
                  </span>
                </div>

                {metrics.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-3 border-y border-neutral-100">
                    {metrics.slice(0, 6).map(([key, value]) => (
                      <div key={key}>
                        <div className="text-sm font-semibold text-neutral-900">{fmt(value)}</div>
                        <div className="text-xs text-neutral-400">{t(`models.metric.${key}`)}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-neutral-400">{timeAgo(model.created_at, lang)}</span>
                  {done && (
                    <span className="text-xs text-savanna-600 font-medium flex items-center gap-1">
                      <Info className="w-3 h-3" aria-hidden="true" /> {t('models.click.details')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedModel && <ModelDetailPanel model={selectedModel} onClose={() => setSelectedModel(null)} />}
    </div>
  );
}

function taskLabel(task: string, t: (k: string) => string) {
  return task === 'classification' || task === 'regression' ? t(`models.task.${task}`).split(' (')[0] : task;
}
const fmt = (v: unknown) => (typeof v === 'number' ? (Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(3)) : '—');
function algorithmLabel(a: string | null, t: (k: string) => string) {
  return a === 'baseline' ? t('models.algorithm.baseline') : a ?? '—';
}

function ModelDetailPanel({ model, onClose }: { model: Model; onClose: () => void }) {
  const { t } = useI18n();
  const cfg = model.config as {
    plan?: string; baseline?: Record<string, number>; leaderboard?: LeaderRow[]; skipped?: string[];
    n_rows?: number; n_rows_used?: number; dropped?: DroppedCol[]; target_column?: string;
  };
  const isReg = model.task_type === 'regression';
  const main = isReg ? 'r2' : 'accuracy';
  const baseline = cfg.baseline ?? {};
  const features = Object.entries(model.feature_importance ?? {})
    .map(([name, value]) => ({ name, value: Math.round(value * 100) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const metrics = Object.entries(model.metrics ?? {}).filter(([k]) => KNOWN_METRICS.includes(k));
  const learned = model.algorithm !== 'baseline';
  const pct = (v: number | undefined) => (typeof v === 'number' ? (isReg ? v.toFixed(3) : `${(v * 100).toFixed(1)}%`) : '—');

  return (
    <div className="card p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Award className="w-5 h-5 text-savanna-600" aria-hidden="true" />
          <div>
            <h3 className="font-semibold text-neutral-900">{model.name} — {t('models.details')}</h3>
            <p className="text-sm text-neutral-500">
              {algorithmLabel(model.algorithm, t)}{cfg.plan === 'premium' || cfg.plan === 'free' ? ` · ${t(`models.plan.${cfg.plan}`)}` : ''}
            </p>
          </div>
        </div>
        <button type="button" aria-label={t('models.cancel')} onClick={onClose} className="btn-ghost p-2">✕</button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <h4 className="font-semibold text-neutral-800 mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-savanna-600" aria-hidden="true" /> {t('models.feature.importance')}
          </h4>
          {features.length === 0 ? (
            <p className="text-sm text-neutral-500">{t('models.explain.nolearn')}</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={features} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" stroke="#94a3b8" fontSize={12} domain={[0, 100]} />
                <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} width={120} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px' }} formatter={(v) => `${v}%`} />
                <Bar dataKey="value" fill="#df8429" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div>
          <h4 className="font-semibold text-neutral-800 mb-3">{t('models.performance')}</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-400">
                <th scope="col" className="pb-1 font-medium">{t('models.col.metric')}</th>
                <th scope="col" className="pb-1 font-medium">{t('models.col.model')}</th>
                <th scope="col" className="pb-1 font-medium">{t('models.col.baseline')}</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(([k, v]) => (
                <tr key={k} className="border-t border-neutral-100">
                  <th scope="row" className="py-1.5 font-normal text-neutral-700">{t(`models.metric.${k}`)}</th>
                  <td className="py-1.5 font-semibold text-neutral-900">{fmt(v)}</td>
                  <td className="py-1.5 text-neutral-500">{fmt(baseline[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-neutral-400 mt-2">{t('models.baseline.note')}</p>
        </div>
      </div>

      {Array.isArray(cfg.leaderboard) && cfg.leaderboard.length > 0 && (
        <div className="mt-6">
          <h4 className="font-semibold text-neutral-800 mb-2">{t('models.leaderboard')}</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-400">
                <th scope="col" className="pb-1 font-medium">{t('models.col.algorithm')}</th>
                <th scope="col" className="pb-1 font-medium">{t(isReg ? 'models.metric.rmse' : 'models.metric.f1_macro')}</th>
              </tr>
            </thead>
            <tbody>
              {cfg.leaderboard.map((r) => (
                <tr key={r.label} className={cn('border-t border-neutral-100', r.label === model.algorithm && 'font-semibold')}>
                  <td className="py-1.5">{r.label}</td>
                  <td className="py-1.5">{fmt(r.metrics?.[isReg ? 'rmse' : 'f1_macro'])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 p-4 rounded-xl bg-ocean-50 border border-ocean-200 text-sm text-ocean-800 space-y-2">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-ocean-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-2">
            <h4 className="font-semibold text-ocean-900">{t('models.ai.explanation')}</h4>
            {learned ? (
              <p>
                {t(isReg ? 'models.explain.r2' : 'models.explain.acc')} <strong>{pct(model.metrics?.[main])}</strong>{' '}
                {t('models.explain.vs')} {pct(baseline[main])} {t(isReg ? 'models.explain.vs.reg' : 'models.explain.vs.class')}
                {features[0] && <> {t('models.explain.top')} <strong>{features[0].name}</strong> ({features[0].value}%). {t('models.explain.caveat')}</>}
              </p>
            ) : (
              <p>{t('models.explain.nolearn')}</p>
            )}
            {typeof cfg.n_rows === 'number' && typeof cfg.n_rows_used === 'number' && cfg.n_rows_used < cfg.n_rows && (
              <p>{t('models.sample.a')} {cfg.n_rows_used} {t('models.sample.b')} {cfg.n_rows}.</p>
            )}
            {Array.isArray(cfg.skipped) && cfg.skipped.length > 0 && <p>{t('models.skipped')}</p>}
            {Array.isArray(cfg.dropped) && cfg.dropped.length > 0 && (
              <p>
                {t('models.dropped')}{' '}
                {cfg.dropped.map((d) => `${d.column} (${DROP_REASONS.includes(d.reason) ? t(`models.dropped.${d.reason}`) : d.reason})`).join(', ')}
              </p>
            )}
            <p className="text-ocean-700">{t('models.nopredict')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
