// Envoi d'e-mails transactionnels par l'API Brevo (https://developers.brevo.com/reference/sendtransacemail).
// La clé API vient d'un secret Supabase (BREVO_API_KEY) : elle n'est jamais journalisée ni renvoyée au navigateur.

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}
export interface BrevoConfig { apiKey: string; senderEmail: string; senderName: string }
export type SendResult = { ok: true } | { ok: false; status: number | null };

const ENDPOINT = "https://api.brevo.com/v3/smtp/email";
export const SEND_TIMEOUT_MS = 8000;

/** Lit la configuration ; renvoie null si elle est absente ou invalide (l'envoi est alors désactivé proprement). */
export function brevoConfig(env: (k: string) => string | undefined): BrevoConfig | null {
  const apiKey = env("BREVO_API_KEY")?.trim();
  const senderEmail = env("BREVO_SENDER_EMAIL")?.trim();
  if (!apiKey || !senderEmail || !/^[^@\s]+@[^@\s]+$/.test(senderEmail)) return null;
  return { apiKey, senderEmail, senderName: env("BREVO_SENDER_NAME")?.trim() || "DAS" };
}

export async function sendEmail(
  cfg: BrevoConfig, msg: EmailMessage, fetchFn: typeof fetch = fetch,
): Promise<SendResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetchFn(ENDPOINT, {
      method: "POST",
      headers: { "api-key": cfg.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: cfg.senderName, email: cfg.senderEmail },
        to: [{ email: msg.to }],
        subject: msg.subject,
        htmlContent: msg.html,
        textContent: msg.text,
      }),
      signal: ctrl.signal,
    });
    await res.body?.cancel();
    return res.ok ? { ok: true } : { ok: false, status: res.status };
  } catch {
    return { ok: false, status: null }; // réseau ou délai dépassé
  } finally {
    clearTimeout(timer);
  }
}

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
