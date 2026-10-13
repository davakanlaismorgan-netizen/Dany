import { DemoBanner } from '@/components/DemoBanner';
import { onActivate } from '@/lib/a11y';
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Database, Filter, BarChart3, Sparkles, FileOutput, Download,
  Trash2, Play, Save, Code2, MousePointer2,
  Upload, Table, GitBranch, Layers, Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/report';
import { cn } from '@/lib/utils';
import { useI18n } from '@/context/I18nContext';
import type { PipelineNode, PipelineEdge } from '@/types';

interface PipelineNodeData {
  id: string;
  type: string;
  label: string;
  icon: typeof Database;
  category: string;
  x: number;
  y: number;
  color: string;
}

const nodePalette: {
  category: string;
  color: string;
  nodes: { type: string; label: string; icon: typeof Database }[];
}[] = [
  {
    category: 'pipeline.cat.data',
    color: 'ocean',
    nodes: [
      { type: 'csv_import', label: 'CSV Import', icon: Upload },
      { type: 'excel_import', label: 'Excel Import', icon: Table },
      { type: 'api_connector', label: 'API Connector', icon: Database },
      { type: 'db_connector', label: 'Database', icon: Database },
    ],
  },
  {
    category: 'pipeline.cat.transform',
    color: 'gold',
    nodes: [
      { type: 'clean', label: 'Data Cleaning', icon: Filter },
      { type: 'normalize', label: 'Normalize', icon: Layers },
      { type: 'encode', label: 'Encode Categorical', icon: GitBranch },
      { type: 'feature_eng', label: 'Feature Engineering', icon: Code2 },
    ],
  },
  {
    category: 'pipeline.cat.modeling',
    color: 'savanna',
    nodes: [
      { type: 'automl', label: 'AutoML', icon: Sparkles },
      { type: 'classification', label: 'Classification', icon: GitBranch },
      { type: 'regression', label: 'Regression', icon: BarChart3 },
      { type: 'clustering', label: 'Clustering', icon: Layers },
    ],
  },
  {
    category: 'pipeline.cat.output',
    color: 'forest',
    nodes: [
      { type: 'chart', label: 'Chart', icon: BarChart3 },
      { type: 'dashboard', label: 'Dashboard', icon: Layers },
      { type: 'export', label: 'Export', icon: Download },
      { type: 'report', label: 'Report', icon: FileOutput },
    ],
  },
];

const colorMap: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  ocean: { bg: 'bg-ocean-50', border: 'border-ocean-200', text: 'text-ocean-700', dot: 'bg-ocean-500' },
  gold: { bg: 'bg-gold-50', border: 'border-gold-200', text: 'text-gold-700', dot: 'bg-gold-500' },
  savanna: { bg: 'bg-savanna-50', border: 'border-savanna-200', text: 'text-savanna-700', dot: 'bg-savanna-500' },
  forest: { bg: 'bg-forest-50', border: 'border-forest-200', text: 'text-forest-700', dot: 'bg-forest-500' },
};

export function PipelineTab({ projectId }: { projectId: string }) {
  const { t, lang } = useI18n();
  const [nodes, setNodes] = useState<PipelineNodeData[]>([
    { id: 'n1', type: 'csv_import', label: 'CSV Import', icon: Upload, category: 'pipeline.cat.data', x: 80, y: 120, color: 'ocean' },
    { id: 'n2', type: 'clean', label: 'Data Cleaning', icon: Filter, category: 'pipeline.cat.transform', x: 340, y: 120, color: 'gold' },
    { id: 'n3', type: 'automl', label: 'AutoML', icon: Sparkles, category: 'pipeline.cat.modeling', x: 600, y: 120, color: 'savanna' },
    { id: 'n4', type: 'chart', label: 'Chart Output', icon: BarChart3, category: 'pipeline.cat.output', x: 860, y: 120, color: 'forest' },
  ]);
  const [edges, setEdges] = useState<{ from: string; to: string }[]>([
    { from: 'n1', to: 'n2' },
    { from: 'n2', to: 'n3' },
    { from: 'n3', to: 'n4' },
  ]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    async function loadPipeline() {
      const { data } = await supabase
        .from('pipelines')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();
      if (data) {
        setPipelineId(data.id);
        const dbNodes: PipelineNode[] = data.nodes || [];
        const dbEdges: PipelineEdge[] = data.edges || [];
        if (dbNodes.length > 0) {
          const restoredNodes = dbNodes.map(n => {
            const paletteNode = nodePalette
              .flatMap(g => g.nodes)
              .find(pn => pn.type === n.type);
            const colorGroup = nodePalette.find(g => g.nodes.some(pn => pn.type === n.type));
            return {
              ...n,
              icon: paletteNode?.icon || Database,
              color: colorGroup?.color || 'ocean',
              category: colorGroup?.category || 'pipeline.cat.data',
            } as PipelineNodeData;
          });
          setNodes(restoredNodes);
          setEdges(dbEdges.map(e => ({ from: e.from, to: e.to })));
        }
      }
    }
    loadPipeline();
  }, [projectId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const serializedNodes: PipelineNode[] = nodes.map(n => ({
        id: n.id, type: n.type, label: n.label, x: n.x, y: n.y, config: {},
      }));
      const serializedEdges: PipelineEdge[] = edges.map(e => ({
        id: `${e.from}-${e.to}`, from: e.from, to: e.to,
      }));
      if (pipelineId) {
        await supabase.from('pipelines').update({
          nodes: serializedNodes,
          edges: serializedEdges,
          updated_at: new Date().toISOString(),
        }).eq('id', pipelineId);
      } else {
        const { data } = await supabase.from('pipelines').insert({
          project_id: projectId,
          name: 'Main Pipeline',
          nodes: serializedNodes,
          edges: serializedEdges,
          status: 'draft',
        }).select().single();
        if (data) setPipelineId(data.id);
      }
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      reportError(err, { where: 'PipelineTab#1' });
    } finally {
      setSaving(false);
    }
  }, [nodes, edges, pipelineId, projectId]);

  const handleNodeDragStart = (e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || !canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - canvasRect.left - node.x,
      y: e.clientY - canvasRect.top - node.y,
    };
    setDraggingNode(nodeId);
    setSelectedNode(nodeId);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!draggingNode || !canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - canvasRect.left - dragOffset.current.x;
    const y = e.clientY - canvasRect.top - dragOffset.current.y;
    setNodes((prev) => prev.map((n) => (n.id === draggingNode ? { ...n, x: Math.max(0, x), y: Math.max(0, y) } : n)));
  };

  const handleCanvasMouseUp = () => {
    setDraggingNode(null);
  };

  const addNode = (nodeType: string, label: string, icon: typeof Database, color: string) => {
    const id = `n${Date.now()}`;
    const colorGroup = nodePalette.find(g => g.nodes.some(n => n.type === nodeType));
    setNodes([...nodes, {
      id, type: nodeType, label, icon, category: colorGroup?.category || 'pipeline.cat.data', x: 120 + Math.random() * 200, y: 250 + Math.random() * 100, color,
    }]);
  };

  const removeNode = (id: string) => {
    setNodes(nodes.filter((n) => n.id !== id));
    setEdges(edges.filter((e) => e.from !== id && e.to !== id));
    setSelectedNode(null);
  };

  // Démonstration : l'exécution est simulée et n'écrit aucun statut en base.
  const runPipeline = () => {
    setRunning(true);
    setTimeout(() => setRunning(false), 2000);
  };

  return (
    <div>
    <div className="p-4 pb-0"><DemoBanner feature="pipelines" /></div>
    <div className="flex h-[calc(100vh-260px)]">
      {/* Node palette */}
      <div className="w-64 shrink-0 bg-white border-r border-neutral-200 overflow-y-auto scrollbar-thin p-4">
        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">{t('pipeline.palette')}</h3>
        {nodePalette.map((group) => (
          <div key={group.category} className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <div className={cn('w-2 h-2 rounded-full', colorMap[group.color].dot)} />
              <span className="text-xs font-semibold text-neutral-700">{t(group.category)}</span>
            </div>
            <div className="space-y-1.5">
              {group.nodes.map((node) => {
                const Icon = node.icon;
                return (
                  <button
                    key={node.type}
                    onClick={() => addNode(node.type, node.label, node.icon, group.color)}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 transition-all text-left group"
                  >
                    <Icon className={cn('w-4 h-4', colorMap[group.color].text)} />
                    <span className="text-sm text-neutral-700 group-hover:text-neutral-900">{node.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCode(!showCode)}
              className={cn('btn-ghost text-sm', showCode && 'bg-savanna-50 text-savanna-600')}
            >
              <Code2 className="w-4 h-4" /> {showCode ? t('pipeline.visual') : t('pipeline.code')}
            </button>
            <button className="btn-ghost text-sm">
              <MousePointer2 className="w-4 h-4" /> {t('pipeline.select')}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSave} disabled={saving} className="btn-secondary text-sm py-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {savedFlash ? (lang === 'fr' ? 'Enregistré !' : 'Saved!') : t('pipeline.save')}
            </button>
            <button onClick={runPipeline} disabled={running} className="btn-primary text-sm py-2">
              <Play className="w-4 h-4" /> {running ? t('pipeline.running') : t('pipeline.run')}
            </button>
          </div>
        </div>

        {showCode ? (
          <div className="flex-1 bg-neutral-900 p-6 overflow-auto scrollbar-thin font-mono text-sm text-neutral-300">
            <pre className="whitespace-pre-wrap">{`# DAS Auto-generated Pipeline
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report

# Step 1: Load data
df = pd.read_csv("data/input.csv")

# Step 2: Clean data
df = df.drop_duplicates()
df = df.fillna(df.median(numeric_only=True))

# Step 3: Feature engineering
df["transaction_freq"] = df.groupby("user_id")["amount"].transform("count")
df["avg_balance"] = df.groupby("user_id")["balance"].transform("mean")

# Step 4: AutoML — Gradient Boosting
X = df.drop("target", axis=1)
y = df["target"]
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

model = GradientBoostingClassifier(n_estimators=200, max_depth=5)
model.fit(X_train, y_train)

# Step 5: Evaluate
y_pred = model.predict(X_test)
print(f"Accuracy: {accuracy_score(y_test, y_pred):.3f}")
print(classification_report(y_test, y_pred))

# Step 6: Export results
results = pd.DataFrame({"actual": y_test, "predicted": y_pred})
results.to_csv("output/predictions.csv", index=False)`}</pre>
          </div>
        ) : (
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- surface de glisser-déposer à la souris ; fonction de démonstration, chaque nœud reste atteignable au clavier
          <div
            ref={canvasRef}
            role="application"
            aria-label="Pipeline"
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            className="flex-1 relative overflow-auto bg-neutral-50"
            style={{
              backgroundImage: 'radial-gradient(circle, #e2e8f0 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          >
            {/* SVG edges */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
              {edges.map((edge, i) => {
                const from = nodes.find((n) => n.id === edge.from);
                const to = nodes.find((n) => n.id === edge.to);
                if (!from || !to) return null;
                const x1 = from.x + 120;
                const y1 = from.y + 30;
                const x2 = to.x;
                const y2 = to.y + 30;
                const midX = (x1 + x2) / 2;
                return (
                  <g key={i}>
                    <path
                      d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                      stroke="#cbd5e1"
                      strokeWidth={2}
                      fill="none"
                      markerEnd="url(#arrowhead)"
                    />
                  </g>
                );
              })}
              <defs>
                <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                  <polygon points="0 0, 7 3, 0 6" fill="#cbd5e1" />
                </marker>
              </defs>
            </svg>

            {/* Nodes */}
            {nodes.map((node) => {
              const Icon = node.icon;
              const c = colorMap[node.color] || colorMap.ocean;
              return (
                <div
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  aria-label={node.label}
                  onKeyDown={onActivate(() => setSelectedNode(node.id))}
                  onMouseDown={(e) => handleNodeDragStart(e, node.id)}
                  onClick={() => setSelectedNode(node.id)}
                  className={cn(
                    'absolute w-[120px] rounded-xl border-2 bg-white p-3 cursor-move transition-shadow',
                    c.border,
                    selectedNode === node.id ? 'shadow-lg ring-2 ring-savanna-300' : 'shadow-sm hover:shadow-md',
                  )}
                  style={{ left: node.x, top: node.y, zIndex: selectedNode === node.id ? 10 : 2 }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', c.bg)}>
                      <Icon className={cn('w-4 h-4', c.text)} />
                    </div>
                    <span className="text-xs font-semibold text-neutral-800 truncate">{node.label}</span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className={cn('w-2 h-2 rounded-full', c.dot)} />
                    <button
                      onClick={(e) => { e.stopPropagation(); removeNode(node.id); }}
                      className="text-neutral-300 hover:text-clay-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {/* Connection ports */}
                  <div className={cn('absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white', c.dot)} />
                  <div className={cn('absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white', c.dot)} />
                </div>
              );
            })}

            {/* Empty state */}
            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-neutral-400">
                  <Database className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">{t('pipeline.empty')}</p>
                </div>
              </div>
            )}

            {/* Running indicator */}
            {running && (
              <div className="absolute top-4 right-4 bg-white rounded-xl shadow-lg p-3 flex items-center gap-2 animate-fade-in">
                <div className="w-4 h-4 rounded-full bg-savanna-500 animate-pulse" />
                <span className="text-sm font-medium text-neutral-700">{t('pipeline.pipeline.running')}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
