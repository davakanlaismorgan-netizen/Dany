import { buildCors, jsonResponse } from "../_shared/http.ts";
import { isUuid } from "../_shared/kkiapay.ts";
import { DatasetError } from "../_shared/dataset.ts";
import { parseTable } from "../_shared/pipeline.ts";
import { type AutoMlResult, AutoMlError, type Plan, prepare, runAutoMl, type Task } from "../_shared/automl.ts";
import { isOwnedPath } from "../process-dataset/handler.ts";

// Une edge function est coupée après 2 s de CPU : le fichier est limité, l'entraînement porte sur un
// échantillon de 1 000 lignes et un budget de temps interrompt les candidats restants (voir automl.ts).
export const MAX_AUTOML_BYTES = 5 * 1024 * 1024;
export const MAX_AUTOML_ROWS = 100_000;
export const SOFT_BUDGET_MS = 1200;
export const SEED = 42;

export interface AutoMlDataset {
  id: string;
  user_id: string;
  project_id: string;
  source_type: string | null;
  source_config: { storage_path?: unknown } | null;
  status: string | null;
  row_count: number | null;
}
export interface SavedModel {
  ownerId: string;
  createdBy: string;
  projectId: string;
  datasetId: string;
  name: string;
  task: Task;
  target: string;
  plan: Plan;
  result: AutoMlResult;
}
export interface AutoMlDeps {
  env: (key: string) => string | undefined;
  now: () => number;
  getUserId: (authHeader: string) => Promise<string | null>;
  canWriteWorkspace: (authHeader: string, ownerId: string) => Promise<boolean>;
  getDataset: (id: string) => Promise<AutoMlDataset | null>;
  // Plan EFFECTIF du propriétaire de l'espace de travail (abonnement actif et non expiré), décidé par la base.
  getPlan: (ownerId: string) => Promise<Plan>;
  download: (path: string) => Promise<Uint8Array | null>;
  saveModel: (m: SavedModel) => Promise<{ id: string } | { error: string }>;
}

const TASKS: Task[] = ["classification", "regression"];
const isShortString = (v: unknown, max: number): v is string => typeof v === "string" && v.trim() !== "" && v.length <= max;

export async function handleAutoMl(req: Request, deps: AutoMlDeps): Promise<Response> {
  const started = deps.now();
  const cors = buildCors(req, deps.env("ALLOWED_ORIGINS"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return jsonResponse(cors, { error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  const userId = authHeader ? await deps.getUserId(authHeader) : null;
  if (!userId) return jsonResponse(cors, { error: "unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) ?? {};
  } catch { /* corps invalide */ }
  const features = body.features;
  if (
    !isUuid(body.dataset_id) || !isShortString(body.target, 200) || !TASKS.includes(body.task as Task) ||
    (body.name !== undefined && !isShortString(body.name, 100)) ||
    (features !== undefined && (!Array.isArray(features) || features.length > 60 || features.some((f) => !isShortString(f, 200))))
  ) {
    return jsonResponse(cors, { error: "invalid_request" }, 400);
  }
  const task = body.task as Task;
  const target = body.target as string;

  // Même réponse pour « inexistant » et « accès refusé ». Autorisé : propriétaire ou éditeur actif.
  const ds = await deps.getDataset(body.dataset_id as string);
  if (!ds) return jsonResponse(cors, { error: "not_found" }, 404);
  if (ds.user_id !== userId && !(await deps.canWriteWorkspace(authHeader!, ds.user_id))) {
    return jsonResponse(cors, { error: "not_found" }, 404);
  }
  const path = ds.source_config?.storage_path;
  if (ds.status !== "profiled" || !isOwnedPath(path, ds.user_id)) return jsonResponse(cors, { error: "dataset_not_ready" }, 422);
  if ((ds.row_count ?? 0) > MAX_AUTOML_ROWS) return jsonResponse(cors, { error: "dataset_too_large" }, 422);

  try {
    const bytes = await deps.download(path);
    if (!bytes) return jsonResponse(cors, { error: "dataset_not_ready" }, 422);
    if (bytes.byteLength > MAX_AUTOML_BYTES) return jsonResponse(cors, { error: "dataset_too_large" }, 422);

    const plan = await deps.getPlan(ds.user_id);
    const prep = prepare(parseTable(ds.source_type ?? "", bytes), target, task, {
      features: features as string[] | undefined, seed: SEED,
    });
    const result = runAutoMl(prep, plan, { seed: SEED, deadline: started + SOFT_BUDGET_MS });

    const saved = await deps.saveModel({
      ownerId: ds.user_id, createdBy: userId, projectId: ds.project_id, datasetId: ds.id,
      name: ((body.name as string | undefined)?.trim()) || `${target} (${task})`, task, target, plan, result,
    });
    if ("error" in saved) {
      console.error("run-automl: enregistrement impossible:", saved.error);
      return jsonResponse(cors, { error: "server_error" }, 500);
    }
    return jsonResponse(cors, {
      model_id: saved.id, algorithm: result.algorithm, metrics: result.metrics, baseline: result.baseline,
      n_rows: result.n_rows, n_rows_used: result.n_rows_used, skipped: result.skipped.length, plan,
    });
  } catch (e) {
    if (e instanceof AutoMlError) return jsonResponse(cors, { error: e.code, detail: e.message === e.code ? null : e.message }, 422);
    if (e instanceof DatasetError) return jsonResponse(cors, { error: e.code, detail: null }, 422);
    console.error("run-automl: erreur inattendue:", e);
    return jsonResponse(cors, { error: "server_error" }, 500);
  }
}
