import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const KKIAPAY_PRIVATE_KEY = Deno.env.get("KKIAPAY_PRIVATE_KEY") || "";
const KKIAPAY_PUBLIC_KEY = Deno.env.get("KKIAPAY_PUBLIC_KEY") || "";
const KKIAPAY_SECRET_KEY = Deno.env.get("KKIAPAY_SECRET_KEY") || "";
const KKIAPAY_SANDBOX = Deno.env.get("KKIAPAY_SANDBOX") !== "false";

const PLAN_PRICES: Record<string, number> = {
  premium: 2900,
  enterprise: 0,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { transactionId, plan } = await req.json();
    if (!transactionId || !plan) {
      return new Response(JSON.stringify({ error: "Missing transactionId or plan" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expectedAmount = PLAN_PRICES[plan];
    if (expectedAmount === undefined) {
      return new Response(JSON.stringify({ error: "Invalid plan" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify transaction with Kkiapay server-side
    const verifyUrl = KKIAPAY_SANDBOX
      ? "https://api-sandbox.kkiapay.me/api/v1/transactions/verify"
      : "https://api.kkiapay.me/api/v1/transactions/verify";

    const verifyResponse = await fetch(`${verifyUrl}/${transactionId}`, {
      method: "GET",
      headers: {
        "x-api-key": KKIAPAY_SECRET_KEY,
        "x-private-key": KKIAPAY_PRIVATE_KEY,
        "x-public-key": KKIAPAY_PUBLIC_KEY,
        "Content-Type": "application/json",
      },
    });

    if (!verifyResponse.ok) {
      return new Response(JSON.stringify({ error: "Transaction verification failed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const txData = await verifyResponse.json();

    if (txData.status !== "SUCCESS") {
      return new Response(JSON.stringify({ verified: false, error: "Transaction not successful" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (expectedAmount > 0 && txData.amount !== expectedAmount) {
      return new Response(JSON.stringify({ verified: false, error: "Amount mismatch" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update user's subscription in the database
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const { error: subError } = await supabase
      .from("subscriptions")
      .upsert({
        user_id: user.id,
        plan: plan,
        status: "active",
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        payment_method: txData.source === "MOBILE_MONEY" ? "momo" : (txData.source === "CARD" ? "card" : "wallet"),
        payment_ref: transactionId,
        updated_at: now.toISOString(),
      }, { onConflict: "user_id" });

    if (subError) {
      return new Response(JSON.stringify({ error: "Failed to update subscription" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ plan: plan })
      .eq("id", user.id);

    if (profileError) {
      return new Response(JSON.stringify({ error: "Failed to update profile" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ verified: true, plan }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
