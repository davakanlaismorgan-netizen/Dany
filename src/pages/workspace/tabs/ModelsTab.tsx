import { useEffect, useState } from 'react';
import {
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Plus, Sparkles, TrendingUp, CheckCircle2, XCircle, Loader2,
  Brain, Target, Zap, Award, Info,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Model, Dataset } from '@/types';

import { CardSkeleton, EmptyState } from '@/components/ui/Loading';
import { timeAgo, cn } from '@/lib/utils';
import { useI18n } from '@/context/I18nContext';

const statusConfig: Record<string, { icon: typeof CheckCircle2; labelKey: string; color: string }> = {
  completed: { icon: CheckCircle2, labelKey: 'models.status.completed', color: 'badge-forest' },
  training: { icon: Loader2, labelKey: 'models.status.training', color: 'badge-gold' },
  pending: { icon: Loader2, labelKey: 'models.status.pending', color: 'badge-neutral' },
  failed: { icon: XCircle, labelKey: 'models.status.failed', color: 'badge-clay' },
};

const taskLabels: Record<string, string> = {
  classification: 'Classification',
  regression: 'Regression',
  clustering: 'Clustering',
  time_series: 'Time Series',
  nlp: 'NLP',
  anomaly_detection: 'Anomaly Detection',
};

export function ModelsTab({ projectId }: { projectId: string }) {
  const { t, lang } = useI18n();
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [showNewModel, setShowNewModel] = useState(false);
  const [modelForm, setModelForm] = useState({ name: '', taskType: 'classification', datasetId: '', targetColumn: '' });
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [training, setTraining] = useState(false);

  useEffect(() => {
    async function loadDatasets() {
      const { data } = await supabase.from('datasets').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
      setDatasets((data as Dataset[]) ?? []);
    }
    loadDatasets();
  }, [projectId]);

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase.from('models').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
        if (error) throw error;
        setModels((data as Model[]) ?? []);
      } catch {
        setModels([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectId]);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">{t('models.title')}</h2>
          <p className="text-sm text-neutral-500 mt-1">{models.length} {t('models.subtitle')}</p>
        </div>
        <button onClick={() => setShowNewModel(!showNewModel)} className="btn-primary">
          <Plus className="w-4 h-4" /> {t('models.new')}
        </button>
      </div>

      {/* New model panel */}
      {showNewModel && (
        <div className="card p-6 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-neutral-900">{t('models.config')}</h3>
            <button onClick={() => setShowNewModel(false)} className="btn-ghost p-2">✕</button>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">{t('models.name')}</label>
              <input
                type="text"
                value={modelForm.name}
                onChange={(e) => setModelForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g., Credit Risk v3"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">{t('models.tasktype')}</label>
              <select
                value={modelForm.taskType}
                onChange={(e) => setModelForm(f => ({ ...f, taskType: e.target.value }))}
                className="input-field"
              >
                <option value="classification">Classification</option>
                <option value="regression">Regression</option>
                <option value="clustering">Clustering</option>
                <option value="time_series">Time Series Forecasting</option>
                <option value="nlp">NLP / Sentiment Analysis</option>
                <option value="anomaly_detection">Anomaly Detection</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">{t('models.dataset')}</label>
              <select
                value={modelForm.datasetId}
                onChange={(e) => setModelForm(f => ({ ...f, datasetId: e.target.value }))}
                className="input-field"
              >
                <option value="">Select a dataset...</option>
                {datasets.map(ds => (
                  <option key={ds.id} value={ds.id}>{ds.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">{t('models.target')}</label>
              <input
                type="text"
                value={modelForm.targetColumn}
                onChange={(e) => setModelForm(f => ({ ...f, targetColumn: e.target.value }))}
                placeholder="e.g., loan_default"
                className="input-field"
              />
            </div>
          </div>

          <div className="mt-4 p-4 rounded-xl bg-savanna-50 border border-savanna-200">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-savanna-600" />
              <span className="text-sm font-semibold text-savanna-800">{t('models.automl')}</span>
            </div>
            <p className="text-xs text-savanna-700">
              {t('models.automl.desc')}
            </p>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowNewModel(false)} className="btn-secondary">{t('models.cancel')}</button>
            <button
              onClick={async () => {
                if (!modelForm.name.trim() || !modelForm.datasetId) return;
                setTraining(true);
                const { data, error } = await supabase.from('models').insert({
                  project_id: projectId,
                  dataset_id: modelForm.datasetId,
                  name: modelForm.name,
                  model_type: modelForm.taskType,
                  task_type: modelForm.taskType,
                  algorithm: 'auto',
                  status: 'pending',
                  config: { target_column: modelForm.targetColumn, automl: true },
                }).select().single();
                if (!error && data) {
                  setModels(prev => [data as Model, ...prev]);
                  setModelForm({ name: '', taskType: 'classification', datasetId: '', targetColumn: '' });
                  setShowNewModel(false);
                  // Simulate training progression
                  const modelId = data.id;
                  setTimeout(async () => {
                    await supabase.from('models').update({
                      status: 'training',
                    }).eq('id', modelId);
                    setModels(prev => prev.map(m => m.id === modelId ? { ...m, status: 'training' } : m));
                  }, 1500);
                  setTimeout(async () => {
                    const isRegression = modelForm.taskType === 'regression';
                    const mockMetrics = isRegression
                      ? { rmse: 0.0832, mae: 0.0654, r2: 0.87 + Math.random() * 0.08 }
                      : { accuracy: 0.86 + Math.random() * 0.1, precision: 0.82 + Math.random() * 0.1, recall: 0.79 + Math.random() * 0.1, f1: 0.81 + Math.random() * 0.08 };
                    const mockFeatures = ['transaction_count', 'avg_amount', 'days_active', 'balance_trend', 'network_diversity', 'frequency_score']
                      .reduce((acc, f, i) => ({ ...acc, [f]: [0.28, 0.22, 0.18, 0.12, 0.11, 0.09][i] }), {} as Record<string, number>);
                    await supabase.from('models').update({
                      status: 'completed',
                      algorithm: isRegression ? 'Random Forest' : 'Gradient Boosting',
                      metrics: mockMetrics,
                      feature_importance: mockFeatures,
                    }).eq('id', modelId);
                    setModels(prev => prev.map(m => m.id === modelId ? { ...m, status: 'completed', algorithm: isRegression ? 'Random Forest' : 'Gradient Boosting', metrics: mockMetrics, feature_importance: mockFeatures } : m));
                  }, 4000);
                }
                setTraining(false);
              }}
              disabled={!modelForm.name.trim() || !modelForm.datasetId || training}
              className="btn-primary"
            >
              {training ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} {t('models.start')}
            </button>
          </div>
        </div>
      )}

      {/* Model cards */}
      {loading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : models.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Brain className="w-8 h-8" />}
            title={t('models.empty.title')}
            description={t('models.empty.desc')}
            action={<button onClick={() => setShowNewModel(true)} className="btn-primary"><Plus className="w-4 h-4" /> {t('models.new')}</button>}
          />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {models.map((model) => {
            const status = statusConfig[model.status] || statusConfig.pending;
            const StatusIcon = status.icon;
            const metrics = Object.entries(model.metrics);
            return (
              <div
                key={model.id}
                onClick={() => model.status === 'completed' && setSelectedModel(selectedModel?.id === model.id ? null : model)}
                className={cn('card p-5', model.status === 'completed' && 'cursor-pointer card-hover')}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-savanna-50 flex items-center justify-center">
                      <Brain className="w-5 h-5 text-savanna-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-neutral-900 text-sm">{model.name}</h3>
                      <p className="text-xs text-neutral-400">{model.algorithm} · {taskLabels[model.task_type]}</p>
                    </div>
                  </div>
                  <span className={cn('badge', status.color, model.status === 'training' && 'animate-pulse')}>
                    <StatusIcon className={cn('w-3 h-3', model.status === 'training' && 'animate-spin')} />
                    {t(status.labelKey)}
                  </span>
                </div>

                {metrics.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-3 border-y border-neutral-100">
                    {metrics.slice(0, 6).map(([key, value]) => (
                      <div key={key}>
                        <div className="text-sm font-semibold text-neutral-900">
                          {typeof value === 'number' ? value.toFixed(2) : value}
                        </div>
                        <div className="text-xs text-neutral-400 uppercase">{key}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-neutral-400">{timeAgo(model.created_at, lang)}</span>
                  {model.status === 'completed' && (
                    <span className="text-xs text-savanna-600 font-medium flex items-center gap-1">
                      <Info className="w-3 h-3" /> {t('models.click.details')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Model detail panel */}
      {selectedModel && (
        <ModelDetailPanel model={selectedModel} onClose={() => setSelectedModel(null)} t={t} />
      )}
    </div>
  );
}

function ModelDetailPanel({ model, onClose, t }: { model: Model; onClose: () => void; t: (key: string) => string }) {
  const featureData = Object.entries(model.feature_importance)
    .map(([name, value]) => ({ name: name.replace(/_/g, ' '), value: Math.round(value * 100) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const metricsData = Object.entries(model.metrics).map(([name, value]) => ({
    metric: name.toUpperCase(),
    value: typeof value === 'number' ? (value <= 1 ? value * 100 : value) : 0,
  }));

  return (
    <div className="card p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Award className="w-5 h-5 text-savanna-600" />
          <div>
            <h3 className="font-semibold text-neutral-900">{model.name} — {t('models.details')}</h3>
            <p className="text-sm text-neutral-500">{model.algorithm} · {taskLabels[model.task_type]}</p>
          </div>
        </div>
        <button onClick={onClose} className="btn-ghost p-2">✕</button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Feature importance */}
        <div>
          <h4 className="font-semibold text-neutral-800 mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-savanna-600" /> {t('models.feature.importance')}
          </h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={featureData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" stroke="#94a3b8" fontSize={12} domain={[0, 100]} />
              <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} width={120} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px' }} formatter={(v: any) => `${v}%`} />
              <Bar dataKey="value" fill="#df8429" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Metrics radar */}
        <div>
          <h4 className="font-semibold text-neutral-800 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-forest-600" /> {t('models.performance')}
          </h4>
          <ResponsiveContainer width="100%" height={250}>
            <RadarChart data={metricsData}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="metric" stroke="#94a3b8" fontSize={11} />
              <PolarRadiusAxis stroke="#cbd5e1" fontSize={10} domain={[0, 100]} />
              <Radar dataKey="value" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} strokeWidth={2} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Plain language explanation */}
      <div className="mt-6 p-4 rounded-xl bg-ocean-50 border border-ocean-200">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-ocean-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-ocean-900 text-sm mb-1">{t('models.ai.explanation')}</h4>
            <p className="text-sm text-ocean-800">
              This {model.algorithm} model achieves {((model.metrics.accuracy || model.metrics.r2 || 0) * 100).toFixed(1)}%
              {' '}{model.task_type === 'regression' ? 'R² score' : 'accuracy'}.{' '}
              {featureData.length > 0 && (<>The most important feature is{' '}
              <strong>{featureData[0]?.name || 'N/A'}</strong> ({featureData[0]?.value}% importance),
              followed by <strong>{featureData[1]?.name || 'N/A'}</strong> ({featureData[1]?.value}%).
              This suggests the model relies primarily on{' '}{featureData[0]?.name?.toLowerCase()} patterns to make predictions.</>)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
