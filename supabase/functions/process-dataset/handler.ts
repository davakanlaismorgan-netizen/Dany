import { buildCors, jsonResponse } from "../_shared/http.ts";
import { isUuid } from "../_shared/kkiapay.ts";
import { DatasetError, type DatasetProfile, profileFile } from "../_shared/dataset.ts";

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export interface DatasetRow {
  id: string;
  user_id: string;
  source_type: string | null;
  source_config: { storage_path?: unknown } | null;
}
export interface ProcessDeps {
  env: (key: string) => string | undefined;
  getUserId: (authHeader: string) => Promise<string | null>;
  getDataset: (id: string) => Promise<DatasetRow | null>;
  download: (path: string) => Promise<Uint8Array | null>;
  // Renvoie le message d'erreur de la base, ou null. Le trigger plan_limit:rows peut refuser l'écriture.
  saveResult: (id: string, profile: DatasetProfile) => Promise<string | null>;
  markFailed: (id: string, reason: string) => Promise<void>;
  deleteDataset: (id: string, storagePath: string) => Promise<void>;
}

// Chemin attendu : <user_id>/<project_id>/<fichier>, sans remontée de dossier.
export function isOwnedPath(path: unknown, userId: string): path is string {
  return typeof path === "string" && path.startsWith(`${userId}/`) && !path.split("/").includes("..");
}

export async function handleProcess(req: Request, deps: ProcessDeps): Promise<Response> {
  const cors = buildCors(req, deps.env("ALLOWED_ORIGINS"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return jsonResponse(cors, { error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  const userId = authHeader ? await deps.getUserId(authHeader) : null;
  if (!userId) return jsonResponse(cors, { error: "unauthorized" }, 401);

  let datasetId: unknown;
  try {
    datasetId = (await req.json())?.dataset_id;
  } catch { /* corps invalide */ }
  if (!isUuid(datasetId)) return jsonResponse(cors, { error: "invalid_request" }, 400);

  // Même réponse pour « inexistant » et « appartient à un autre » : pas d'énumération.
  const ds = await deps.getDataset(datasetId);
  if (!ds || ds.user_id !== userId) return jsonResponse(cors, { error: "not_found" }, 404);
  const path = ds.source_config?.storage_path;
  if (!isOwnedPath(path, userId)) {
    await deps.markFailed(ds.id, "invalid_path");
    return jsonResponse(cors, { error: "invalid_path" }, 400);
  }

  const bytes = await deps.download(path);
  if (!bytes) {
    await deps.markFailed(ds.id, "file_missing");
    return jsonResponse(cors, { error: "file_missing" }, 422);
  }
  if (bytes.byteLength > MAX_FILE_BYTES) {
    await deps.markFailed(ds.id, "file_too_large");
    return jsonResponse(cors, { error: "file_too_large" }, 422);
  }

  let profile: DatasetProfile;
  try {
    profile = profileFile(ds.source_type ?? "", bytes);
  } catch (e) {
    const code = e instanceof DatasetError ? e.code : "parse_failed";
    if (!(e instanceof DatasetError)) console.error("process-dataset: analyse impossible:", e);
    await deps.markFailed(ds.id, code);
    return jsonResponse(cors, { error: code }, 422);
  }

  const err = await deps.saveResult(ds.id, profile);
  if (err) {
    if (err.includes("plan_limit:rows")) {
      // Plan gratuit dépassé : on ne garde ni la ligne ni le fichier.
      await deps.deleteDataset(ds.id, path);
      return jsonResponse(cors, { error: "plan_limit_rows" }, 422);
    }
    console.error("process-dataset: enregistrement impossible:", err);
    return jsonResponse(cors, { error: "server_error" }, 500);
  }
  return jsonResponse(cors, { row_count: profile.rowCount, column_count: profile.headers.length });
}
