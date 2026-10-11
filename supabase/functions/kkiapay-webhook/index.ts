import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { handleWebhook } from "./handler.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

// Cette fonction est publique (verify_jwt = false dans config.toml) : KKiaPay ne peut pas envoyer
// de jeton Supabase. Elle est protégée par la signature x-kkiapay-secret.
Deno.serve((req) =>
  handleWebhook(req, {
    env: (k) => Deno.env.get(k),
    fetch,
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
