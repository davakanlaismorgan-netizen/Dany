import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { handleAssistant } from "./handler.ts";
import { callLlm } from "../_shared/llm.ts";
import { parseTable } from "../_shared/pipeline.ts";
import { isOwnedPath } from "../process-dataset/handler.ts";
import { MAX_STATS_ROWS } from "../_shared/facts.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const MAX_BYTES = 5 * 1024 * 1024; // une edge function est coupée après 2 s de CPU

const asUser = (authHeader: string) =>
  createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });

Deno.serve((req) =>
  handleAssistant(req, {
    env: (k) => Deno.env.get(k),
    now: () => new Date(),
    getUserId: async (authHeader) => {
      const { data, error } = await asUser(authHeader).auth.getUser();
      return error || !data.user ? null : data.user.id;
    },
    canReadWorkspace: async (authHeader, ownerId) => {
      const { data, error } = await asUser(authHeader).rpc("can_read_workspace", { p_owner: ownerId });
      return !error && data === true;
    },
    getProject: async (id) => {
      const { data } = await admin.from("projects").select("id, user_id, name, description").eq("id", id).maybeSingle();
      return data;
    },
    getPlan: async (userId) => {
      const { data, error } = await admin.rpc("effective_plan", { p_user_id: userId });
      if (error) throw new Error(`effective_plan: ${error.message}`); // en cas de doute : aucun message, jamais un quota plus large
      return data === "premium" || data === "enterprise" ? data : "free";
    },
    getKey: async (userId) => {
      const { data } = await admin.from("ai_provider_keys").select("provider, ciphertext").eq("user_id", userId).maybeSingle();
      return data;
    },
    claim: async (userId, kind, limit) => {
      const { data, error } = await admin.rpc("claim_ai_usage", { p_user: userId, p_kind: kind, p_limit: limit });
      if (error) throw new Error(`claim_ai_usage: ${error.message}`);
      const r = Array.isArray(data) ? data[0] : data;
      return { allowed: r?.allowed === true, used: r?.used ?? 0 };
    },
    release: async (userId, kind) => {
      const { error } = await admin.rpc("release_ai_usage", { p_user: userId, p_kind: kind });
      if (error) console.error("ai-assistant: libération du compteur impossible:", error.message);
    },
    loadContext: async (projectId, datasetId) => {
      const [ds, ms, ps, vs] = await Promise.all([
        admin.from("datasets").select("id, name, row_count, column_count, status, source_type, source_config, user_id")
          .eq("project_id", projectId).order("created_at", { ascending: false }).limit(50),
        admin.from("models").select("name, task_type, algorithm, metrics, dataset_id")
          .eq("project_id", projectId).eq("status", "completed").order("created_at", { ascending: false }).limit(20),
        admin.from("pipelines").select("id", { count: "exact", head: true }).eq("project_id", projectId),
        admin.from("visualizations").select("id", { count: "exact", head: true }).eq("project_id", projectId),
      ]);
      for (const r of [ds, ms, ps, vs]) if (r.error) throw new Error(r.error.message);
      const all = ds.data ?? [];
      const names = new Map(all.map((d) => [d.id as string, d.name as string]));
      const chosen = (datasetId ? all.find((d) => d.id === datasetId) : all.find((d) => d.status === "profiled")) ?? null;
      let selected: { name: string; rows: number; table: ReturnType<typeof parseTable> | null; reason: "ok" | "too_large" | "unreadable" | "none" } =
        { name: "", rows: 0, table: null, reason: "none" };
      if (chosen) {
        selected = { name: chosen.name, rows: chosen.row_count ?? 0, table: null, reason: "unreadable" };
        const path = (chosen.source_config as { storage_path?: unknown } | null)?.storage_path;
        if (chosen.status === "profiled" && isOwnedPath(path, chosen.user_id)) {
          if ((chosen.row_count ?? 0) > MAX_STATS_ROWS) {
            selected.reason = "too_large";
          } else {
            const { data } = await admin.storage.from("datasets").download(path);
            if (data && data.size <= MAX_BYTES) {
              try {
                selected.table = parseTable(chosen.source_type ?? "", new Uint8Array(await data.arrayBuffer()));
                selected.reason = "ok";
              } catch { selected.reason = "unreadable"; }
            } else if (data) selected.reason = "too_large";
          }
        }
      }
      return {
        datasets: all.slice(0, 10).map((d) => ({ name: d.name, row_count: d.row_count, column_count: d.column_count, status: d.status })),
        models: (ms.data ?? []).map((m) => ({
          name: m.name, task_type: m.task_type, algorithm: m.algorithm, metrics: (m.metrics ?? {}) as Record<string, unknown>,
          dataset_name: names.get(m.dataset_id as string) ?? null,
        })),
        pipelines: ps.count ?? 0,
        visualizations: vs.count ?? 0,
        selected,
      };
    },
    getConversation: async (id) => {
      const { data } = await admin.from("ai_conversations").select("id, user_id, project_id, messages").eq("id", id).maybeSingle();
      return data ? { ...data, messages: Array.isArray(data.messages) ? data.messages : [] } : null;
    },
    saveConversation: async (c) => {
      if (c.id) {
        const { error } = await admin.from("ai_conversations").update({ messages: c.messages }).eq("id", c.id).eq("user_id", c.userId);
        return error ? { error: error.message } : { id: c.id };
      }
      const { data, error } = await admin.from("ai_conversations")
        .insert({ user_id: c.userId, project_id: c.projectId, title: c.title, messages: c.messages }).select("id").single();
      return error || !data ? { error: error?.message ?? "insert" } : { id: data.id };
    },
    llm: (provider, apiKey, model, system, messages) => callLlm(provider, apiKey, model, system, messages),
  })
);
