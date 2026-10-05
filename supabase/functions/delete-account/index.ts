import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { removeAllUnder } from "../_shared/storage.ts";
import { handleDelete } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

// Les paiements sont conservés pour la comptabilité (payments.user_id passe à NULL).
Deno.serve((req) =>
  handleDelete(req, {
    env: (k) => Deno.env.get(k),
    getUserId: async (authHeader) => {
      const userClient = createClient(url, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data, error } = await userClient.auth.getUser();
      return error || !data.user ? null : data.user.id;
    },
    removeUserFiles: async (userId) => {
      for (const bucket of ["datasets", "reports", "avatars"]) {
        const err = await removeAllUnder(admin.storage.from(bucket), userId);
        if (err) return `${bucket}: ${err}`;
      }
      return null;
    },
    deleteUser: async (userId) => {
      const { error } = await admin.auth.admin.deleteUser(userId);
      return error?.message ?? null;
    },
  })
);
