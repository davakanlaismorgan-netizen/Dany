import { buildCors, jsonResponse } from "../_shared/http.ts";
import { isUuid } from "../_shared/kkiapay.ts";
import { DatasetError, type DatasetProfile, profileCsv } from "../_shared/dataset.ts";
import {
  parseTable, PipelineError, type PipelineEdgeDef, type PipelineNodeDef, runPipeline, sourceIds, tableToCsv,
} from "../_shared/pipeline.ts";
import { isOwnedPath, MAX_FILE_BYTES } from "../process-dataset/handler.ts";

export interface PipelineRow {
  id: string;
  project_id: string;
  user_id: string;
  nodes: unknown;
  edges: unknown;
}
export interface SourceDataset {
  id: string;
  user_id: string;
  project_id: string;
  source_type: string | null;
  source_config: { storage_path?: unknown } | null;
  status: string | null;
}
export interface SavedOutput {
  ownerId: string;
  createdBy: string;
  projectId: string;
  pipelineId: string;
  name: string;
  csv: Uint8Array;
  profile: DatasetProfile;
}
export interface RunDeps {
  env: (key: string) => string | undefined;
  getUserId: (authHeader: string) => Promise<string | null>;
  canWriteWorkspace: (authHeader: string, ownerId: string) => Promise<boolean>;
  getPipeline: (id: string) => Promise<PipelineRow | null>;
  getDataset: (id: string) => Promise<SourceDataset | null>;
  download: (path: string) => Promise<Uint8Array | null>;
  // Dépose le fichier et crée le jeu de données. Renvoie son id, ou le message d'erreur de la base
  // (le trigger plan_limit:rows peut refuser). En cas d'échec, rien ne doit subsister.
  saveOutput: (o: SavedOutput) => Promise<{ id: string } | { error: string }>;
  setStatus: (pipelineId: string, status: "completed" | "failed") => Promise<void>;
}

const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function parseGraph(p: PipelineRow): { nodes: PipelineNodeDef[]; edges: PipelineEdgeDef[] } {
  const nodes = asList(p.nodes).map((n) => {
    const o = (n ?? {}) as Record<string, unknown>;
    const cfg = o.config && typeof o.config === "object" && !Array.isArray(o.config) ? o.config as Record<string, unknown> : {};
    return { id: o.id as string, type: o.type as string, config: cfg };
  });
  const edges = asList(p.edges).map((e) => {
    const o = (e ?? {}) as Record<string, unknown>;
    return { from: o.from as string, to: o.to as string };
  });
  return { nodes, edges };
}

// Codes d'erreur de moteur → réponse 422 (données ou configuration de l'utilisateur à corriger).
function pipelineFailure(cors: Record<string, string>, e: PipelineError | DatasetError) {
  if (e instanceof PipelineError) return jsonResponse(cors, { error: e.code, node_id: e.nodeId ?? null, detail: e.message === e.code ? null : e.message }, 422);
  return jsonResponse(cors, { error: e.code, node_id: null, detail: null }, 422);
}

export async function handleRun(req: Request, deps: RunDeps): Promise<Response> {
  const cors = buildCors(req, deps.env("ALLOWED_ORIGINS"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return jsonResponse(cors, { error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  const userId = authHeader ? await deps.getUserId(authHeader) : null;
  if (!userId) return jsonResponse(cors, { error: "unauthorized" }, 401);

  let pipelineId: unknown;
  try {
    pipelineId = (await req.json())?.pipeline_id;
  } catch { /* corps invalide */ }
  if (!isUuid(pipelineId)) return jsonResponse(cors, { error: "invalid_request" }, 400);

  // Même réponse pour « inexistant » et « accès refusé ». Autorisé : propriétaire ou éditeur actif.
  const pipeline = await deps.getPipeline(pipelineId);
  if (!pipeline) return jsonResponse(cors, { error: "not_found" }, 404);
  if (pipeline.user_id !== userId && !(await deps.canWriteWorkspace(authHeader!, pipeline.user_id))) {
    return jsonResponse(cors, { error: "not_found" }, 404);
  }

  try {
    // Le graphe exécuté est celui ENREGISTRÉ en base, jamais un graphe fourni par l'appelant.
    const { nodes, edges } = parseGraph(pipeline);
    const wanted = sourceIds(nodes); // valide la forme avant tout accès aux fichiers
    void wanted;
    const run = await runPipeline(nodes, edges, async (datasetId, nodeId) => {
      const ds = isUuid(datasetId) ? await deps.getDataset(datasetId) : null;
      // Une source doit appartenir au même propriétaire ET au même projet que le pipeline.
      if (!ds || ds.user_id !== pipeline.user_id || ds.project_id !== pipeline.project_id || ds.status !== "profiled") {
        throw new PipelineError("source_not_found", nodeId);
      }
      const path = ds.source_config?.storage_path;
      if (!isOwnedPath(path, ds.user_id)) throw new PipelineError("source_not_found", nodeId);
      const bytes = await deps.download(path);
      if (!bytes || bytes.byteLength > MAX_FILE_BYTES) throw new PipelineError("source_not_found", nodeId);
      return parseTable(ds.source_type ?? "", bytes);
    });

    const csv = tableToCsv(run.table);
    const profile = profileCsv(csv);
    const saved = await deps.saveOutput({
      ownerId: pipeline.user_id, createdBy: userId, projectId: pipeline.project_id, pipelineId: pipeline.id,
      name: run.output_name, csv, profile,
    });
    if ("error" in saved) {
      await deps.setStatus(pipeline.id, "failed");
      if (saved.error.includes("plan_limit:rows")) return jsonResponse(cors, { error: "plan_limit_rows" }, 422);
      console.error("run-pipeline: enregistrement impossible:", saved.error);
      return jsonResponse(cors, { error: "server_error" }, 500);
    }
    await deps.setStatus(pipeline.id, "completed");
    return jsonResponse(cors, {
      dataset_id: saved.id, row_count: profile.rowCount, column_count: profile.headers.length, steps: run.steps,
    });
  } catch (e) {
    if (e instanceof PipelineError || e instanceof DatasetError) {
      await deps.setStatus(pipeline.id, "failed");
      return pipelineFailure(cors, e);
    }
    console.error("run-pipeline: erreur inattendue:", e);
    await deps.setStatus(pipeline.id, "failed");
    return jsonResponse(cors, { error: "server_error" }, 500);
  }
}
