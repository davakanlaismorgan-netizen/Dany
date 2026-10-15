import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { handleAutoMl } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const asUser = (authHeader: string) =>
  createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

Deno.serve((req) =>
  handleAutoMl(req, {
    env: (k) => Deno.env.get(k),
    now: () => Date.now(),
    getUserId: async (authHeader) => {
      const { data, error } = await asUser(authHeader).auth.getUser();
      return error || !data.user ? null : data.user.id;
    },
    canWriteWorkspace: async (authHeader, ownerId) => {
      const { data, error } = await asUser(authHeader).rpc("can_write_workspace", { p_owner: ownerId });
      return !error && data === true;
    },
    getDataset: async (id) => {
      const { data } = await admin.from("datasets")
        .select("id, user_id, project_id, source_type, source_config, status, row_count").eq("id", id).maybeSingle();
      return data;
    },
    getPlan: async (ownerId) => {
      const { data, error } = await admin.rpc("effective_plan", { p_user_id: ownerId });
      if (error) throw new Error(`effective_plan: ${error.message}`); // en cas de doute, jamais de plan supérieur
      return data === "free" || data == null ? "free" : "premium";
    },
    download: async (path) => {
      const { data, error } = await admin.storage.from("datasets").download(path);
      return error || !data ? null : new Uint8Array(await data.arrayBuffer());
    },
    saveModel: async (m) => {
      const r = m.result;
      const { data, error } = await admin.from("models").insert({
        project_id: m.projectId,
        dataset_id: m.datasetId,
        user_id: m.ownerId,
        created_by: m.createdBy,
        name: m.name,
        model_type: "automl",
        task_type: m.task,
        algorithm: r.algorithm,
        status: "completed",
        metrics: r.metrics,
        feature_importance: r.feature_importance,
        config: {
          target_column: m.target, plan: m.plan, validation: `${r.folds}-fold cross-validation`, seed: 42,
          baseline: r.baseline, leaderboard: r.leaderboard, skipped: r.skipped,
          n_rows: r.n_rows, n_rows_used: r.n_rows_used, n_features: r.n_features, classes: r.classes, dropped: r.dropped,
        },
      }).select("id").single();
      return error || !data ? { error: error?.message ?? "insert_failed" } : { id: data.id };
    },
  })
);
