// Helpers HTTP communs aux edge functions.

// Origines autorisées : variable ALLOWED_ORIGINS (séparées par des virgules).
// Par défaut, seul le serveur de développement local est autorisé (pas de « * »).
export function buildCors(req: Request, allowedOriginsEnv: string | undefined): Record<string, string> {
  const allowed = (allowedOriginsEnv ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.get("Origin");
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (origin && allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function jsonResponse(cors: Record<string, string>, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
