import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { handleProcess } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

Deno.serve((req) =>
  handleProcess(req, {
    env: (k) => Deno.env.get(k),
    getUserId: async (authHeader) => {
      const userClient = createClient(url, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data, error } = await userClient.auth.getUser();
      return error || !data.user ? null : data.user.id;
    },
    getDataset: async (id) => {
      const { data } = await admin.from("datasets").select("id, user_id, source_type, source_config").eq("id", id).maybeSingle();
      return data;
    },
    download: async (path) => {
      const { data, error } = await admin.storage.from("datasets").download(path);
      return error || !data ? null : new Uint8Array(await data.arrayBuffer());
    },
    saveResult: async (id, p) => {
      const { error } = await admin.from("datasets").update({
        row_count: p.rowCount,
        column_count: p.headers.length,
        profiling: {
          headers: p.headers, preview: p.preview, columns: p.columns,
          bad_rows: p.badRows, encoding: p.encoding, delimiter: p.delimiter,
        },
        status: "profiled",
      }).eq("id", id);
      return error?.message ?? null;
    },
    markFailed: async (id, reason) => {
      await admin.from("datasets").update({ status: "failed", profiling: { error: reason } }).eq("id", id);
    },
    deleteDataset: async (id, path) => {
      await admin.storage.from("datasets").remove([path]);
      await admin.from("datasets").delete().eq("id", id);
    },
  })
);
