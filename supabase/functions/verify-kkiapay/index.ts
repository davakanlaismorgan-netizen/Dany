import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { handleVerify } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Client « service » : réservé à l'appel de activate_plan, jamais exposé au navigateur.
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

Deno.serve((req) =>
  handleVerify(req, {
    env: (k) => Deno.env.get(k),
    fetch,
    getUserId: async (authHeader) => {
      const userClient = createClient(url, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data, error } = await userClient.auth.getUser();
      return error || !data.user ? null : data.user.id;
    },
    activatePlan: async (a) => {
      const { data, error } = await admin.rpc("activate_plan", {
        p_user_id: a.userId,
        p_plan: a.plan,
        p_provider: a.provider,
        p_transaction_id: a.transactionId,
        p_amount: a.amount,
        p_currency: "XOF",
        p_method: a.method,
        p_months: 1,
      });
      return { expiresAt: (data as string | null) ?? null, error: error?.message ?? null };
    },
  })
);
