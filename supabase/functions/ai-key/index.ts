import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { handleAiKey } from "./handler.ts";
import { verifyKey } from "../_shared/llm.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

Deno.serve((req) =>
  handleAiKey(req, {
    env: (k) => Deno.env.get(k),
    getUserId: async (authHeader) => {
      const { data, error } = await createClient(url, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      }).auth.getUser();
      return error || !data.user ? null : data.user.id;
    },
    claim: async (userId, kind, limit) => {
      const { data, error } = await admin.rpc("claim_ai_usage", { p_user: userId, p_kind: kind, p_limit: limit });
      if (error) throw new Error(`claim_ai_usage: ${error.message}`);
      const r = Array.isArray(data) ? data[0] : data;
      return { allowed: r?.allowed === true, used: r?.used ?? 0 };
    },
    verify: (provider, apiKey) => verifyKey(provider, apiKey),
    saveKey: async (userId, provider, ciphertext, last4) => {
      const { error } = await admin.from("ai_provider_keys").upsert(
        { user_id: userId, provider, ciphertext, key_last4: last4, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
      return error?.message ?? null;
    },
  })
);
