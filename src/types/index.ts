export type Plan = 'free' | 'premium' | 'enterprise';
export type Sector = 'finance' | 'commerce' | 'agriculture' | 'healthcare' | 'logistics' | 'general';
export type ModelStatus = 'pending' | 'training' | 'completed' | 'failed';
export type TaskType = 'classification' | 'regression' | 'clustering' | 'time_series' | 'nlp' | 'anomaly_detection';
export type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'heatmap' | 'area' | 'geo';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  company: string | null;
  role: string;
  preferred_language: string;
  plan: Plan;
  phone: string | null;
  country: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  sector: Sector;
  status: string;
  config: Record<string, unknown>;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface Dataset {
  id: string;
  project_id: string;
  name: string;
  source_type: string;
  source_config: Record<string, unknown>;
  row_count: number;
  column_count: number;
  size_bytes: number;
  profiling: Record<string, unknown>;
  status: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface PipelineNode {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  config: Record<string, unknown>;
}

export interface PipelineEdge {
  id: string;
  from: string;
  to: string;
}

export interface Pipeline {
  id: string;
  project_id: string;
  name: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  status: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface Model {
  id: string;
  project_id: string;
  dataset_id: string | null;
  name: string;
  model_type: string;
  task_type: TaskType;
  algorithm: string | null;
  metrics: Record<string, number>;
  config: Record<string, unknown>;
  status: ModelStatus;
  feature_importance: Record<string, number>;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface Visualization {
  id: string;
  project_id: string;
  dataset_id: string | null;
  name: string;
  chart_type: ChartType;
  config: Record<string, unknown>;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface Report {
  id: string;
  project_id: string;
  name: string;
  format: string;
  config: Record<string, unknown>;
  status: string;
  file_url: string | null;
  user_id: string;
  created_at: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface AIConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  user_id: string;
  created_at: string;
  updated_at: string;
}
