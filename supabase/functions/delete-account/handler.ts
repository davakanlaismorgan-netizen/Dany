import { buildCors, jsonResponse } from "../_shared/http.ts";

export interface DeleteDeps {
  env: (key: string) => string | undefined;
  getUserId: (authHeader: string) => Promise<string | null>;
  // Chacune renvoie un message d'erreur, ou null en cas de succès.
  removeUserFiles: (userId: string) => Promise<string | null>;
  deleteUser: (userId: string) => Promise<string | null>;
}

export async function handleDelete(req: Request, deps: DeleteDeps): Promise<Response> {
  const cors = buildCors(req, deps.env("ALLOWED_ORIGINS"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return jsonResponse(cors, { error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  const userId = authHeader ? await deps.getUserId(authHeader) : null;
  if (!userId) return jsonResponse(cors, { error: "unauthorized" }, 401);

  // Confirmation explicite exigée côté serveur (en plus de l'étape de confirmation de l'interface).
  let body: unknown = null;
  try {
    body = await req.json();
  } catch { /* corps absent */ }
  if ((body as { confirm?: unknown } | null)?.confirm !== true) {
    return jsonResponse(cors, { error: "confirmation_required" }, 400);
  }

  // D'abord les fichiers : si le nettoyage échoue, le compte est conservé et l'opération peut être relancée.
  const storageError = await deps.removeUserFiles(userId);
  if (storageError) {
    console.error("delete-account: nettoyage Storage impossible:", storageError);
    return jsonResponse(cors, { error: "storage_cleanup_failed" }, 500);
  }

  const deleteError = await deps.deleteUser(userId);
  if (deleteError) {
    console.error("delete-account: suppression impossible:", deleteError);
    return jsonResponse(cors, { error: "server_error" }, 500);
  }
  return jsonResponse(cors, { success: true });
}
