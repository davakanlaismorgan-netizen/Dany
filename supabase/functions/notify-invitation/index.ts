import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { handleNotifyInvitation } from "./handler.ts";
import { sendEmail } from "../_shared/brevo.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const asUser = (authHeader: string) =>
  createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

Deno.serve((req) =>
  handleNotifyInvitation(req, {
    env: (k) => Deno.env.get(k),
    getUserId: async (authHeader) => {
      const { data, error } = await asUser(authHeader).auth.getUser();
      return error || !data.user ? null : data.user.id;
    },
    getInvitation: async (id) => {
      const { data } = await admin.from("team_members").select("id, owner_id, member_email, role, status").eq("id", id).maybeSingle();
      return data;
    },
    getPlan: async (ownerId) => {
      const { data, error } = await admin.rpc("effective_plan", { p_user_id: ownerId });
      if (error) throw new Error(`effective_plan: ${error.message}`); // en cas de doute, aucun envoi
      return data === "premium" || data === "enterprise" ? data : "free";
    },
    getOwnerName: async (ownerId) => {
      const { data } = await admin.from("profiles").select("full_name, company, email").eq("id", ownerId).maybeSingle();
      return data?.full_name || data?.company || data?.email || null;
    },
    claim: async (id, cooldown, max) => {
      const { data, error } = await admin.rpc("claim_invitation_email", { p_id: id, p_cooldown_seconds: cooldown, p_max: max });
      if (error) throw new Error(`claim_invitation_email: ${error.message}`);
      const r = Array.isArray(data) ? data[0] : data;
      return { claimed: r?.claimed === true, prevAt: r?.prev_at ?? null, reason: r?.reason ?? null };
    },
    release: async (id, prevAt) => {
      const { error } = await admin.rpc("release_invitation_email", { p_id: id, p_prev_at: prevAt });
      if (error) console.error("notify-invitation: libération impossible:", error.message);
    },
    send: (cfg, msg) => sendEmail(cfg, msg),
  })
);
