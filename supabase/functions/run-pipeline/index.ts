import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { handleRun } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const asUser = (authHeader: string) =>
  createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

Deno.serve((req) =>
  handleRun(req, {
    env: (k) => Deno.env.get(k),
    getUserId: async (authHeader) => {
      const { data, error } = await asUser(authHeader).auth.getUser();
      return error || !data.user ? null : data.user.id;
    },
    canWriteWorkspace: async (authHeader, ownerId) => {
      const { data, error } = await asUser(authHeader).rpc("can_write_workspace", { p_owner: ownerId });
      return !error && data === true;
    },
    getPipeline: async (id) => {
      const { data } = await admin.from("pipelines").select("id, project_id, user_id, nodes, edges").eq("id", id).maybeSingle();
      return data;
    },
    getDataset: async (id) => {
      const { data } = await admin.from("datasets")
        .select("id, user_id, project_id, source_type, source_config, status").eq("id", id).maybeSingle();
      return data;
    },
    download: async (path) => {
      const { data, error } = await admin.storage.from("datasets").download(path);
      return error || !data ? null : new Uint8Array(await data.arrayBuffer());
    },
    saveOutput: async (o) => {
      const path = `${o.ownerId}/${o.projectId}/${crypto.randomUUID()}_pipeline.csv`;
      const up = await admin.storage.from("datasets").upload(path, o.csv, { contentType: "text/csv", upsert: false });
      if (up.error) return { error: up.error.message };
      const p = o.profile;
      const { data, error } = await admin.from("datasets").insert({
        project_id: o.projectId,
        user_id: o.ownerId,
        created_by: o.createdBy,
        name: o.name,
        source_type: "csv",
        source_config: { storage_path: path, derived_from_pipeline: o.pipelineId },
        row_count: p.rowCount,
        column_count: p.headers.length,
        size_bytes: o.csv.byteLength,
        profiling: {
          headers: p.headers, preview: p.preview, columns: p.columns,
          bad_rows: p.badRows, encoding: p.encoding, delimiter: p.delimiter,
        },
        status: "profiled",
      }).select("id").single();
      if (error || !data) {
        await admin.storage.from("datasets").remove([path]);
        return { error: error?.message ?? "insert_failed" };
      }
      return { id: data.id };
    },
    setStatus: async (id, status) => {
      await admin.from("pipelines").update({ status }).eq("id", id);
    },
  })
);
