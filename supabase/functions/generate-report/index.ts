import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { handleGenerateReport } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const asUser = (authHeader: string) =>
  createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

Deno.serve((req) =>
  handleGenerateReport(req, {
    env: (k) => Deno.env.get(k),
    now: () => new Date(),
    getUserId: async (authHeader) => {
      const { data, error } = await asUser(authHeader).auth.getUser();
      return error || !data.user ? null : data.user.id;
    },
    canWriteWorkspace: async (authHeader, ownerId) => {
      const { data, error } = await asUser(authHeader).rpc("can_write_workspace", { p_owner: ownerId });
      return !error && data === true;
    },
    getProject: async (id) => {
      const { data } = await admin.from("projects").select("id, user_id, name, description").eq("id", id).maybeSingle();
      return data;
    },
    getPlan: async (ownerId) => {
      const { data, error } = await admin.rpc("effective_plan", { p_user_id: ownerId });
      if (error) throw new Error(`effective_plan: ${error.message}`); // en cas de doute, jamais de marque Premium
      return data === "free" || data == null ? "free" : "premium";
    },
    getCompany: async (ownerId) => {
      const { data } = await admin.from("profiles").select("company").eq("id", ownerId).maybeSingle();
      return data?.company ?? null;
    },
    getLogo: async (ownerId) => {
      const { data, error } = await admin.storage.from("reports").download(`${ownerId}/brand/logo.jpg`);
      return error || !data ? null : new Uint8Array(await data.arrayBuffer());
    },
    loadData: async (projectId) => {
      const [ds, ms, ps, vs] = await Promise.all([
        admin.from("datasets").select("id, name, row_count, column_count, status, profiling").eq("project_id", projectId)
          .order("created_at", { ascending: false }).limit(50),
        admin.from("models").select("name, task_type, algorithm, metrics, feature_importance, config, created_at, dataset_id")
          .eq("project_id", projectId).eq("status", "completed").order("created_at", { ascending: false }).limit(100),
        admin.from("pipelines").select("name, status, nodes").eq("project_id", projectId).limit(50),
        admin.from("visualizations").select("name, chart_type").eq("project_id", projectId).limit(50),
      ]);
      for (const r of [ds, ms, ps, vs]) if (r.error) throw new Error(r.error.message);
      const names = new Map((ds.data ?? []).map((d) => [d.id as string, d.name as string]));
      return {
        // Le profil complet contient un aperçu des lignes : on n'en garde que les colonnes et le contrôle qualité.
        datasets: (ds.data ?? []).map((d) => ({
          name: d.name, row_count: d.row_count, column_count: d.column_count, status: d.status,
          profiling: { columns: d.profiling?.columns ?? [], badRows: d.profiling?.badRows ?? 0 },
        })),
        models: (ms.data ?? []).map((m) => ({ ...m, dataset_name: names.get(m.dataset_id as string) ?? null })),
        pipelines: ps.data ?? [],
        visualizations: vs.data ?? [],
      };
    },
    countRecent: async (ownerId, since) => {
      const { count, error } = await admin.from("reports").select("id", { count: "exact", head: true })
        .eq("user_id", ownerId).gte("created_at", since.toISOString());
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    save: async (a) => {
      const id = crypto.randomUUID();
      const path = `${a.ownerId}/${id}.${a.extension}`;
      const up = await admin.storage.from("reports").upload(path, a.bytes, { contentType: a.contentType, upsert: false });
      if (up.error) return { error: up.error.message };
      const { error } = await admin.from("reports").insert({
        id, project_id: a.projectId, user_id: a.ownerId, created_by: a.createdBy, name: a.name, format: a.extension,
        status: "completed", file_url: path, config: { template: a.template, lang: a.lang, branding: a.branding, size_bytes: a.bytes.length },
      });
      if (error) {
        await admin.storage.from("reports").remove([path]); // pas de fichier orphelin
        return { error: error.message };
      }
      return { id };
    },
  })
);
