// Logique KKiaPay partagée (prix, validation, appel de vérification).
// Spécification vérifiée dans la documentation officielle KKiaPay :
//   - vérification : POST {base}/api/v1/transactions/status, corps {"transactionId": "..."},
//     en-têtes X-API-KEY (clé publique), X-PRIVATE-KEY (clé privée), X-SECRET-KEY (clé secrète)
//   - bases : https://api.kkiapay.me (production), https://api-sandbox.kkiapay.me (test)
//   - les montants sont en XOF (FCFA)

export const CURRENCY = "XOF";

// SOURCE DE VÉRITÉ des prix côté serveur (à garder identique à src/lib/plans.ts).
// Le plan est déduit du montant réellement payé : le client ne choisit jamais son plan.
export const PLAN_PRICES_XOF = { premium: 17900 } as const;
export type PaidPlan = keyof typeof PLAN_PRICES_XOF;

export function planForAmount(amount: unknown): PaidPlan | null {
  if (typeof amount !== "number" || !Number.isInteger(amount)) return null;
  for (const [plan, price] of Object.entries(PLAN_PRICES_XOF)) {
    if (price === amount) return plan as PaidPlan;
  }
  return null;
}

const TRANSACTION_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
export function isValidTransactionId(v: unknown): v is string {
  return typeof v === "string" && TRANSACTION_ID_RE.test(v);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

// Comparaison en temps constant (évite de révéler le secret par mesure de durée).
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export interface KkiapayConfig {
  publicKey: string;
  privateKey: string;
  secretKey: string;
  sandbox: boolean;
}

// Sandbox UNIQUEMENT si KKIAPAY_SANDBOX vaut exactement "true". Toute autre valeur (y compris
// l'absence de la variable) vérifie sur la production : en cas d'oubli, un faux paiement de test
// n'est pas reconnu (échec « fermé »), contrairement à l'ancien comportement.
export function readConfig(env: (key: string) => string | undefined): KkiapayConfig | null {
  const publicKey = env("KKIAPAY_PUBLIC_KEY");
  const privateKey = env("KKIAPAY_PRIVATE_KEY");
  const secretKey = env("KKIAPAY_SECRET_KEY");
  if (!publicKey || !privateKey || !secretKey) return null;
  return { publicKey, privateKey, secretKey, sandbox: env("KKIAPAY_SANDBOX") === "true" };
}

// Les transactions de test et de production ne se mélangent jamais dans la table payments.
export function providerName(cfg: KkiapayConfig): string {
  return cfg.sandbox ? "kkiapay-sandbox" : "kkiapay";
}

export function paymentMethod(source: string | null): string {
  if (source === "MOBILE_MONEY") return "momo";
  if (source === "CARD") return "card";
  return "wallet";
}

export interface KkiapayTransaction {
  status: string;
  amount: number | null;
  source: string | null;
}

export class KkiapayError extends Error {
  constructor(public code: "unreachable" | "bad_response") {
    super(code);
  }
}

export async function fetchTransaction(
  cfg: KkiapayConfig,
  transactionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<KkiapayTransaction> {
  const base = cfg.sandbox ? "https://api-sandbox.kkiapay.me" : "https://api.kkiapay.me";
  let res: Response;
  try {
    res = await fetchImpl(`${base}/api/v1/transactions/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-KEY": cfg.publicKey,
        "X-PRIVATE-KEY": cfg.privateKey,
        "X-SECRET-KEY": cfg.secretKey,
      },
      body: JSON.stringify({ transactionId }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new KkiapayError("unreachable");
  }

  let json: Record<string, unknown>;
  try {
    json = await res.json();
  } catch {
    throw new KkiapayError("bad_response");
  }
  if (typeof json.status !== "string") throw new KkiapayError("bad_response");

  const rawAmount = typeof json.amount === "string" ? Number(json.amount) : json.amount;
  return {
    status: json.status,
    amount: typeof rawAmount === "number" && Number.isFinite(rawAmount) ? rawAmount : null,
    source: typeof json.source === "string" ? json.source : null,
  };
}

export interface ActivatePlanArgs {
  userId: string;
  plan: PaidPlan;
  provider: string;
  transactionId: string;
  amount: number;
  method: string;
}

// Résultat de l'activation (implémentée avec supabase.rpc('activate_plan') dans index.ts).
export interface ActivatePlanResult {
  expiresAt: string | null;
  error: string | null;
}
export type ActivatePlan = (args: ActivatePlanArgs) => Promise<ActivatePlanResult>;
