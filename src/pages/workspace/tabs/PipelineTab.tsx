import { onActivate } from '@/lib/a11y';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Database, Filter, Columns3, CopyMinus, Eraser, Sigma, GitMerge, FileOutput,
  Trash2, Play, Save, Plus, Loader2, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/report';
import { cn } from '@/lib/utils';
import { useI18n } from '@/context/I18nContext';
import { useWorkspace } from '@/lib/workspace';
import { pipelineErrorCode, runPipeline, type PipelineRunResult } from '@/lib/runPipeline';
import {
  BLOCK_CATEGORIES, dependsOn, fromStored, inputCount, outputColumns, toStored,
  type BlockType, type DatasetColumns, type EditorNode, type StoredEdge, type StoredNode,
} from '@/lib/pipelineGraph';

const ICONS: Record<BlockType, typeof Database> = {
  source: Database, filter: Filter, select: Columns3, dedupe: CopyMinus,
  fill_missing: Eraser, aggregate: Sigma, join: GitMerge, output: FileOutput,
};
const CATEGORY_STYLE: Record<'data' | 'transform' | 'output', { bg: string; border: string; text: string; dot: string }> = {
  data: { bg: 'bg-ocean-50', border: 'border-ocean-200', text: 'text-ocean-700', dot: 'bg-ocean-500' },
  transform: { bg: 'bg-gold-50', border: 'border-gold-200', text: 'text-gold-700', dot: 'bg-gold-500' },
  output: { bg: 'bg-forest-50', border: 'border-forest-200', text: 'text-forest-700', dot: 'bg-forest-500' },
};
const styleOf = (type: BlockType) => CATEGORY_STYLE[BLOCK_CATEGORIES.find((c) => c.types.includes(type))!.key];

const FILTER_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'empty', 'not_empty'];
const STRATEGIES = ['mean', 'median', 'mode', 'constant', 'drop'];
const AGG_FNS = ['count', 'sum', 'mean', 'min', 'max'];

interface AggSpec { column: string; fn: string }

export function PipelineTab({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const { canWrite } = useWorkspace();
  const [nodes, setNodes] = useState<EditorNode[]>([]);
  const [datasets, setDatasets] = useState<(DatasetColumns & { name: string })[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [status, setStatus] = useState('draft');
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<PipelineRunResult | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [p, d] = await Promise.all([
          supabase.from('pipelines').select('*').eq('project_id', projectId).maybeSingle(),
          supabase.from('datasets').select('id, name, profiling, status').eq('project_id', projectId).eq('status', 'profiled'),
        ]);
        if (cancelled) return;
        if (p.error || d.error) throw p.error ?? d.error;
        setDatasets(((d.data as { id: string; name: string; profiling: { headers?: string[] } | null }[]) ?? []).map((x) => ({
          id: x.id, name: x.name, headers: Array.isArray(x.profiling?.headers) ? x.profiling!.headers! : [],
        })));
        if (p.data) {
          setPipelineId(p.data.id);
          setStatus(p.data.status ?? 'draft');
          setNodes(fromStored((p.data.nodes ?? []) as StoredNode[], (p.data.edges ?? []) as StoredEdge[]));
        }
      } catch (err) {
        reportError(err, { where: 'PipelineTab.load' });
        if (!cancelled) setMessage(t('pipeline.load_error'));
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement unique par projet
  }, [projectId]);

  const update = (id: string, patch: Partial<EditorNode>) =>
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  const setConfig = (id: string, patch: Record<string, unknown>) =>
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, config: { ...n.config, ...patch } } : n)));

  // Enregistre le pipeline (le serveur exécute toujours la version enregistrée). Renvoie son id.
  const save = useCallback(async (): Promise<string | null> => {
    setSaving(true);
    try {
      const { nodes: sn, edges } = toStored(nodes, (type) => t(`pipeline.block.${type}`));
      const body = { nodes: sn, edges, updated_at: new Date().toISOString() };
      if (pipelineId) {
        const { error } = await supabase.from('pipelines').update(body).eq('id', pipelineId);
        if (error) throw error;
        return pipelineId;
      }
      const { data, error } = await supabase.from('pipelines')
        .insert({ project_id: projectId, name: 'Main Pipeline', status: 'draft', ...body }).select().single();
      if (error || !data) throw error ?? new Error('insert_failed');
      setPipelineId(data.id);
      return data.id as string;
    } catch (err) {
      reportError(err, { where: 'PipelineTab.save' });
      setMessage(t('pipeline.save_error'));
      return null;
    } finally {
      setSaving(false);
    }
  }, [nodes, pipelineId, projectId, t]);

  const handleSave = async () => {
    setMessage(null);
    if (await save()) {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    }
  };

  const handleRun = async () => {
    setMessage(null);
    setResult(null);
    setRunning(true);
    try {
      const id = await save();
      if (!id) return;
      const res = await runPipeline(id);
      setResult(res);
      setStatus(res.ok ? 'completed' : 'failed');
      if (!res.ok && res.nodeId) setSelected(res.nodeId);
    } finally {
      setRunning(false);
    }
  };

  const addNode = (type: BlockType) => {
    const id = `n${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const i = nodes.length;
    const input = selected && nodes.some((n) => n.id === selected) && inputCount(type) > 0 ? [selected] : [];
    const config: Record<string, unknown> =
      type === 'filter' ? { op: 'eq' } : type === 'join' ? { kind: 'inner' } : type === 'output' ? { name: t('pipeline.block.output') } : {};
    setNodes([...nodes, { id, type, x: 30 + (i % 4) * 170, y: 30 + Math.floor(i / 4) * 130, config, inputs: input }]);
    setSelected(id);
  };

  const removeNode = (id: string) => {
    setNodes(nodes.filter((n) => n.id !== id).map((n) => ({ ...n, inputs: n.inputs.filter((x) => x !== id) })));
    setSelected(null);
  };

  const onDragStart = (e: React.MouseEvent, id: string) => {
    if (!canWrite || !canvasRef.current) return;
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    e.preventDefault();
    const r = canvasRef.current.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - r.left - node.x, y: e.clientY - r.top - node.y };
    setDragging(id);
    setSelected(id);
  };
  const onMove = (e: React.MouseEvent) => {
    if (!dragging || !canvasRef.current) return;
    const r = canvasRef.current.getBoundingClientRect();
    update(dragging, { x: Math.max(0, e.clientX - r.left - dragOffset.current.x), y: Math.max(0, e.clientY - r.top - dragOffset.current.y) });
  };

  const stepRows = useMemo(() => {
    const m = new Map<string, number>();
    if (result?.ok) for (const s of result.steps) m.set(s.node_id, s.rows_out);
    return m;
  }, [result]);
  const failedNode = result && !result.ok ? result.nodeId : null;
  const sel = nodes.find((n) => n.id === selected) ?? null;

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-260px)]">
      {/* Palette */}
      <div className="lg:w-60 shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-neutral-200 overflow-y-auto scrollbar-thin p-4">
        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">{t('pipeline.palette')}</h3>
        {!canWrite && <p className="text-xs text-neutral-500 mb-3">{t('pipeline.readonly')}</p>}
        {BLOCK_CATEGORIES.map((cat) => (
          <div key={cat.key} className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <div className={cn('w-2 h-2 rounded-full', CATEGORY_STYLE[cat.key].dot)} />
              <span className="text-xs font-semibold text-neutral-700">{t(`pipeline.cat.${cat.key}`)}</span>
            </div>
            <div className="space-y-1.5">
              {cat.types.map((type) => {
                const Icon = ICONS[type];
                return (
                  <button
                    key={type}
                    type="button"
                    disabled={!canWrite}
                    onClick={() => addNode(type)}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 transition-all text-left"
                  >
                    <Icon className={cn('w-4 h-4', CATEGORY_STYLE[cat.key].text)} aria-hidden="true" />
                    <span className="text-sm text-neutral-700">{t(`pipeline.block.${type}`)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-white border-b border-neutral-200">
          <span className="text-xs text-neutral-500">{t(`pipeline.status.${status}`)}</span>
          {canWrite && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleSave} disabled={saving || running} className="btn-secondary text-sm py-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {savedFlash ? t('pipeline.saved') : t('pipeline.save')}
              </button>
              <button type="button" onClick={handleRun} disabled={running || saving || nodes.length === 0} className="btn-primary text-sm py-2">
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} {running ? t('pipeline.running') : t('pipeline.run')}
              </button>
            </div>
          )}
        </div>

        {(message || result) && (
          <div role="status" className="px-4 pt-3">
            {message && <p className="text-sm text-clay-600">{message}</p>}
            {result?.ok && (
              <div className="p-3 rounded-xl bg-forest-50 border border-forest-200 text-sm text-forest-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  {t('pipeline.result.done')} <strong>{result.rowCount} {t('pipeline.result.rows')} × {result.columnCount} {t('pipeline.result.cols')}</strong>. {t('pipeline.result.hint')} {t('pipeline.result.steps')}
                </span>
              </div>
            )}
            {result && !result.ok && (
              <div className="p-3 rounded-xl bg-clay-50 border border-clay-200 text-sm text-clay-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  {result.nodeId && <>{t('pipeline.err.node')} </>}
                  {t(`pipeline.err.${pipelineErrorCode(result.code)}`)}
                  {result.detail && <> <code className="px-1 rounded bg-white/70">{result.detail}</code></>}
                </span>
              </div>
            )}
          </div>
        )}

        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- surface de glisser-déposer à la souris ; chaque bloc reste atteignable et réglable au clavier */}
        <div
          ref={canvasRef}
          role="application"
          aria-label="Pipeline"
          onMouseMove={onMove}
          onMouseUp={() => setDragging(null)}
          onMouseLeave={() => setDragging(null)}
          className="flex-1 relative overflow-auto bg-neutral-50 min-h-[320px]"
          style={{ backgroundImage: 'radial-gradient(circle, #e2e8f0 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        >
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }} aria-hidden="true">
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 7 3, 0 6" fill="#94a3b8" />
              </marker>
            </defs>
            {nodes.flatMap((to) => to.inputs.map((fromId) => {
              const from = nodes.find((n) => n.id === fromId);
              if (!from) return null;
              const x1 = from.x + 130, y1 = from.y + 36, x2 = to.x, y2 = to.y + 36;
              const mid = (x1 + x2) / 2;
              return (
                <path key={`${fromId}-${to.id}`} d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                  stroke="#94a3b8" strokeWidth={2} fill="none" markerEnd="url(#arrowhead)" />
              );
            }))}
          </svg>

          {nodes.map((node) => {
            const Icon = ICONS[node.type];
            const c = styleOf(node.type);
            const rows = stepRows.get(node.id);
            return (
              <div
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={t(`pipeline.block.${node.type}`)}
                aria-pressed={selected === node.id}
                onKeyDown={onActivate(() => setSelected(node.id))}
                onMouseDown={(e) => onDragStart(e, node.id)}
                onClick={() => setSelected(node.id)}
                className={cn(
                  'absolute w-[130px] rounded-xl border-2 bg-white p-3 transition-shadow',
                  canWrite ? 'cursor-move' : 'cursor-pointer',
                  c.border,
                  failedNode === node.id && 'border-clay-500 ring-2 ring-clay-300',
                  selected === node.id ? 'shadow-lg ring-2 ring-savanna-300' : 'shadow-sm hover:shadow-md',
                )}
                style={{ left: node.x, top: node.y, zIndex: selected === node.id ? 10 : 2 }}
              >
                <div className="flex items-center gap-2">
                  <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', c.bg)}>
                    <Icon className={cn('w-4 h-4', c.text)} aria-hidden="true" />
                  </div>
                  <span className="text-xs font-semibold text-neutral-800 leading-tight">{t(`pipeline.block.${node.type}`)}</span>
                </div>
                {rows !== undefined && <p className="mt-2 text-[11px] text-neutral-500">{rows} {t('pipeline.result.rows')}</p>}
                {inputCount(node.type) > 0 && <div className={cn('absolute -left-1.5 top-9 w-3 h-3 rounded-full border-2 border-white', c.dot)} />}
                {node.type !== 'output' && <div className={cn('absolute -right-1.5 top-9 w-3 h-3 rounded-full border-2 border-white', c.dot)} />}
              </div>
            );
          })}

          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-neutral-400">
                <Database className="w-12 h-12 mx-auto mb-3 opacity-30" aria-hidden="true" />
                <p className="text-sm">{t('pipeline.empty')}</p>
              </div>
            </div>
          )}
          {running && (
            <div className="absolute top-4 right-4 bg-white rounded-xl shadow-lg p-3 flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-savanna-500 animate-pulse" />
              <span className="text-sm font-medium text-neutral-700">{t('pipeline.pipeline.running')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Réglages du bloc sélectionné */}
      <aside className="lg:w-72 shrink-0 bg-white border-t lg:border-t-0 lg:border-l border-neutral-200 overflow-y-auto scrollbar-thin p-4" aria-label={t('pipeline.cfg.title')}>
        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">{t('pipeline.cfg.title')}</h3>
        {!sel ? (
          <p className="text-sm text-neutral-500">{t('pipeline.cfg.none')}</p>
        ) : (
          <BlockSettings
            key={sel.id}
            node={sel}
            nodes={nodes}
            datasets={datasets}
            readOnly={!canWrite}
            onConfig={(patch) => setConfig(sel.id, patch)}
            onInputs={(inputs) => update(sel.id, { inputs })}
            onRemove={() => removeNode(sel.id)}
          />
        )}
      </aside>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-neutral-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function ColumnChecks({ label, columns, value, onChange, disabled }: {
  label: string; columns: string[]; value: string[]; onChange: (v: string[]) => void; disabled: boolean;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="mb-3" disabled={disabled}>
      <legend className="block text-xs font-medium text-neutral-600 mb-1">{label}</legend>
      {columns.length === 0 ? (
        <p className="text-xs text-neutral-400">{t('pipeline.cfg.no_columns')}</p>
      ) : (
        <div className="max-h-40 overflow-y-auto space-y-1">
          {columns.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={value.includes(c)}
                onChange={(e) => onChange(e.target.checked ? [...value, c] : value.filter((x) => x !== c))}
              />
              <span className="truncate">{c}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

interface SettingsProps {
  node: EditorNode;
  nodes: EditorNode[];
  datasets: (DatasetColumns & { name: string })[];
  readOnly: boolean;
  onConfig: (patch: Record<string, unknown>) => void;
  onInputs: (inputs: string[]) => void;
  onRemove: () => void;
}

function BlockSettings({ node, nodes, datasets, readOnly, onConfig, onInputs, onRemove }: SettingsProps) {
  const { t } = useI18n();
  const cfg = node.config;
  const str = (k: string) => (typeof cfg[k] === 'string' || typeof cfg[k] === 'number' ? String(cfg[k]) : '');
  const list = (k: string): string[] => (Array.isArray(cfg[k]) ? (cfg[k] as unknown[]).filter((x): x is string => typeof x === 'string') : []);
  const id = (k: string) => `blk-${node.id}-${k}`;

  // Entrées possibles : tout autre bloc qui ne dépend pas déjà de celui-ci (pas de boucle) et n'est pas une sortie.
  const candidates = nodes.filter((n) => n.id !== node.id && n.type !== 'output' && !dependsOn(nodes, n.id, node.id));
  const label = (n: EditorNode) => `${t(`pipeline.block.${n.type}`)} (${n.id.slice(-4)})`;
  const columnsOf = (i: number) => (node.inputs[i] ? outputColumns(nodes, datasets, node.inputs[i]) : []);
  const inputSelect = (i: number, text: string) => (
    <Field label={text} htmlFor={id(`in${i}`)}>
      <select
        id={id(`in${i}`)} className="input-field" disabled={readOnly} value={node.inputs[i] ?? ''}
        onChange={(e) => { const next = [...node.inputs]; next[i] = e.target.value; onInputs(next); }}
      >
        <option value="">{t('pipeline.cfg.input.pick')}</option>
        {candidates.map((n) => <option key={n.id} value={n.id}>{label(n)}</option>)}
      </select>
    </Field>
  );
  const columnSelect = (key: string, text: string, cols: string[], extra?: React.ReactNode) => (
    <Field label={text} htmlFor={id(key)}>
      <select id={id(key)} className="input-field" disabled={readOnly} value={str(key)} onChange={(e) => onConfig({ [key]: e.target.value })}>
        <option value="">{t('pipeline.cfg.column.pick')}</option>
        {extra}
        {cols.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </Field>
  );

  const cols0 = columnsOf(0);
  const aggs: AggSpec[] = Array.isArray(cfg.aggregations) ? (cfg.aggregations as AggSpec[]) : [];
  const setAgg = (i: number, patch: Partial<AggSpec>) => onConfig({ aggregations: aggs.map((a, k) => (k === i ? { ...a, ...patch } : a)) });
  const op = str('op');
  const strategy = str('strategy');

  return (
    <div>
      <p className="text-sm font-semibold text-neutral-800 mb-3">{t(`pipeline.block.${node.type}`)}</p>

      {node.type === 'source' && (
        <Field label={t('pipeline.cfg.dataset')} htmlFor={id('dataset')}>
          <select id={id('dataset')} className="input-field" disabled={readOnly} value={str('dataset_id')} onChange={(e) => onConfig({ dataset_id: e.target.value })}>
            <option value="">{t('pipeline.cfg.dataset.pick')}</option>
            {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
      )}

      {node.type === 'join' ? (
        <>
          {inputSelect(0, t('pipeline.cfg.input.left'))}
          {inputSelect(1, t('pipeline.cfg.input.right'))}
        </>
      ) : node.type !== 'source' && inputSelect(0, t('pipeline.cfg.input'))}

      {node.type === 'filter' && (
        <>
          {columnSelect('column', t('pipeline.cfg.column'), cols0)}
          <Field label={t('pipeline.cfg.op')} htmlFor={id('op')}>
            <select id={id('op')} className="input-field" disabled={readOnly} value={op || 'eq'} onChange={(e) => onConfig({ op: e.target.value })}>
              {FILTER_OPS.map((o) => <option key={o} value={o}>{t(`pipeline.op.${o}`)}</option>)}
            </select>
          </Field>
          {op !== 'empty' && op !== 'not_empty' && (
            <Field label={t('pipeline.cfg.value')} htmlFor={id('value')}>
              <input id={id('value')} className="input-field" disabled={readOnly} value={str('value')} onChange={(e) => onConfig({ value: e.target.value })} />
            </Field>
          )}
        </>
      )}

      {node.type === 'select' && <ColumnChecks label={t('pipeline.cfg.columns')} columns={cols0} value={list('columns')} disabled={readOnly} onChange={(v) => onConfig({ columns: v })} />}

      {node.type === 'dedupe' && <ColumnChecks label={t('pipeline.cfg.dedupe_cols')} columns={cols0} value={list('columns')} disabled={readOnly} onChange={(v) => onConfig({ columns: v })} />}

      {node.type === 'fill_missing' && (
        <>
          {columnSelect('column', t('pipeline.cfg.column'), cols0)}
          <Field label={t('pipeline.cfg.strategy')} htmlFor={id('strategy')}>
            <select id={id('strategy')} className="input-field" disabled={readOnly} value={strategy} onChange={(e) => onConfig({ strategy: e.target.value })}>
              <option value="">{t('pipeline.cfg.column.pick')}</option>
              {STRATEGIES.map((s) => <option key={s} value={s}>{t(`pipeline.strategy.${s}`)}</option>)}
            </select>
          </Field>
          {strategy === 'constant' && (
            <Field label={t('pipeline.cfg.value')} htmlFor={id('value')}>
              <input id={id('value')} className="input-field" disabled={readOnly} value={str('value')} onChange={(e) => onConfig({ value: e.target.value })} />
            </Field>
          )}
        </>
      )}

      {node.type === 'aggregate' && (
        <>
          <ColumnChecks label={t('pipeline.cfg.group_by')} columns={cols0} value={list('group_by')} disabled={readOnly} onChange={(v) => onConfig({ group_by: v })} />
          <p className="block text-xs font-medium text-neutral-600 mb-1">{t('pipeline.cfg.aggregations')}</p>
          {aggs.map((a, i) => (
            <div key={i} className="flex items-center gap-1 mb-2">
              <select aria-label={t('pipeline.cfg.fn')} className="input-field w-auto px-2 text-sm" disabled={readOnly} value={a.fn} onChange={(e) => setAgg(i, { fn: e.target.value })}>
                {AGG_FNS.map((f) => <option key={f} value={f}>{t(`pipeline.fn.${f}`)}</option>)}
              </select>
              <select aria-label={t('pipeline.cfg.column')} className="input-field min-w-0 px-2 text-sm" disabled={readOnly} value={a.column} onChange={(e) => setAgg(i, { column: e.target.value })}>
                <option value="">{t('pipeline.cfg.column.pick')}</option>
                {a.fn === 'count' && <option value="*">{t('pipeline.cfg.all_rows')}</option>}
                {cols0.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {!readOnly && (
                <button type="button" aria-label={t('pipeline.cfg.remove')} onClick={() => onConfig({ aggregations: aggs.filter((_, k) => k !== i) })} className="text-neutral-400 hover:text-clay-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          {!readOnly && (
            <button type="button" className="btn-ghost text-sm mb-3" onClick={() => onConfig({ aggregations: [...aggs, { fn: 'count', column: '*' }] })}>
              <Plus className="w-4 h-4" /> {t('pipeline.cfg.add_agg')}
            </button>
          )}
        </>
      )}

      {node.type === 'join' && (
        <>
          {columnSelect('left_key', t('pipeline.cfg.left_key'), columnsOf(0))}
          {columnSelect('right_key', t('pipeline.cfg.right_key'), columnsOf(1))}
          <Field label={t('pipeline.cfg.join_kind')} htmlFor={id('kind')}>
            <select id={id('kind')} className="input-field" disabled={readOnly} value={str('kind') || 'inner'} onChange={(e) => onConfig({ kind: e.target.value })}>
              <option value="inner">{t('pipeline.kind.inner')}</option>
              <option value="left">{t('pipeline.kind.left')}</option>
            </select>
          </Field>
        </>
      )}

      {node.type === 'output' && (
        <Field label={t('pipeline.cfg.name')} htmlFor={id('name')}>
          <input id={id('name')} className="input-field" maxLength={100} disabled={readOnly} value={str('name')} onChange={(e) => onConfig({ name: e.target.value })} />
        </Field>
      )}

      {!readOnly && (
        <button type="button" onClick={onRemove} className="btn-ghost text-sm text-clay-600 mt-2">
          <Trash2 className="w-4 h-4" /> {t('pipeline.cfg.remove')}
        </button>
      )}
    </div>
  );
}
