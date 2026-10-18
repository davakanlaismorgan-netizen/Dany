import { buildCors, jsonResponse } from "../_shared/http.ts";
import { isUuid } from "../_shared/kkiapay.ts";
import { type BrevoConfig, brevoConfig, type EmailMessage, escapeHtml, type SendResult } from "../_shared/brevo.ts";

export const COOLDOWN_SECONDS = 600; // 10 min entre deux e-mails pour la même invitation
export const MAX_EMAILS_PER_INVITATION = 5;

export interface InvitationRow { id: string; owner_id: string; member_email: string; role: string; status: string }
export interface ClaimResult { claimed: boolean; prevAt: string | null; reason: string | null }
export interface NotifyDeps {
  env: (key: string) => string | undefined;
  getUserId: (authHeader: string) => Promise<string | null>;
  getInvitation: (id: string) => Promise<InvitationRow | null>;
  // Plan EFFECTIF du propriétaire (abonnement actif et non expiré) ; lève en cas de doute.
  getPlan: (ownerId: string) => Promise<"free" | "premium" | "enterprise">;
  getOwnerName: (ownerId: string) => Promise<string | null>;
  claim: (id: string, cooldownSeconds: number, max: number) => Promise<ClaimResult>;
  release: (id: string, prevAt: string | null) => Promise<void>;
  send: (cfg: BrevoConfig, msg: EmailMessage) => Promise<SendResult>;
}

/** Adresse du site : SITE_URL, sinon la première origine https de ALLOWED_ORIGINS. Jamais une adresse fournie par le client. */
export function siteUrl(env: (k: string) => string | undefined): string | null {
  const explicit = env("SITE_URL")?.trim();
  const candidates = [explicit, ...(env("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim())];
  for (const c of candidates) {
    if (c && /^https:\/\/[^\s/]+$/.test(c.replace(/\/+$/, ""))) return c.replace(/\/+$/, "");
  }
  return null;
}

const T = {
  fr: {
    subject: (who: string) => `${who} vous invite à rejoindre son équipe sur DAS`,
    intro: (who: string, role: string) => `${who} vous invite à collaborer sur DAS, en tant que ${role}.`,
    roles: { viewer: "lecteur (lecture seule)", editor: "éditeur (peut modifier)" } as Record<string, string>,
    steps: "Pour accepter : connectez-vous (ou créez un compte) avec cette adresse e-mail, confirmez-la si on vous le demande, puis ouvrez Paramètres > Équipe.",
    cta: "Ouvrir DAS",
    ignore: "Si vous ne connaissez pas cette personne, ignorez ce message : rien ne se passe sans votre acceptation.",
  },
  en: {
    subject: (who: string) => `${who} invites you to join their team on DAS`,
    intro: (who: string, role: string) => `${who} invites you to collaborate on DAS as ${role}.`,
    roles: { viewer: "a viewer (read-only)", editor: "an editor (can make changes)" } as Record<string, string>,
    steps: "To accept: sign in (or create an account) with this e-mail address, confirm it if asked, then open Settings > Team.",
    cta: "Open DAS",
    ignore: "If you don't know this person, ignore this message: nothing happens unless you accept.",
  },
} as const;

/** Contenu de l'e-mail : le nom de l'inviteur est échappé (il vient d'un champ libre du profil). */
export function buildInvitationEmail(
  lang: "fr" | "en", ownerName: string, role: string, to: string, site: string,
): EmailMessage {
  const t = T[lang];
  const who = ownerName.replace(/[\r\n]+/g, " ").trim().slice(0, 80) || (lang === "fr" ? "Un collègue" : "A colleague");
  const roleLabel = t.roles[role] ?? t.roles.viewer;
  const link = `${site}/auth/login`;
  const intro = t.intro(who, roleLabel);
  return {
    to,
    subject: t.subject(who).slice(0, 150),
    text: `${intro}\n\n${t.steps}\n\n${link}\n\n${t.ignore}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#222">
<h2 style="color:#b0701c;margin:0 0 16px">DAS</h2>
<p>${escapeHtml(intro)}</p>
<p>${escapeHtml(t.steps)}</p>
<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#b0701c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${escapeHtml(t.cta)}</a></p>
<p style="color:#777;font-size:12px">${escapeHtml(t.ignore)}</p></div>`,
  };
}

export async function handleNotifyInvitation(req: Request, deps: NotifyDeps): Promise<Response> {
  const cors = buildCors(req, deps.env("ALLOWED_ORIGINS"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return jsonResponse(cors, { error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  const userId = authHeader ? await deps.getUserId(authHeader) : null;
  if (!userId) return jsonResponse(cors, { error: "unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) ?? {};
  } catch { /* corps invalide */ }
  if (!isUuid(body.invitation_id) || (body.lang !== "fr" && body.lang !== "en")) {
    return jsonResponse(cors, { error: "invalid_request" }, 400);
  }
  const lang = body.lang as "fr" | "en";

  // Seul le propriétaire de l'invitation peut déclencher l'envoi ; même réponse pour « inexistante » et « d'un autre ».
  const inv = await deps.getInvitation(body.invitation_id as string);
  if (!inv || inv.owner_id !== userId) return jsonResponse(cors, { error: "not_found" }, 404);
  if (inv.status !== "pending") return jsonResponse(cors, { error: "not_pending" }, 422);

  const cfg = brevoConfig(deps.env);
  const site = siteUrl(deps.env);
  if (!cfg || !site) return jsonResponse(cors, { error: "email_not_configured" }, 503);

  try {
    if ((await deps.getPlan(userId)) === "free") return jsonResponse(cors, { error: "plan" }, 403);

    // « Réserver puis envoyer » : une seule réservation à la fois par invitation, délai et plafond appliqués par la base.
    const claim = await deps.claim(inv.id, COOLDOWN_SECONDS, MAX_EMAILS_PER_INVITATION);
    if (!claim.claimed) {
      if (claim.reason === "too_soon") return jsonResponse(cors, { error: "too_soon" }, 429);
      if (claim.reason === "max_sent") return jsonResponse(cors, { error: "max_sent" }, 429);
      return jsonResponse(cors, { error: "not_pending" }, 422);
    }

    const ownerName = (await deps.getOwnerName(userId)) ?? "";
    const result = await deps.send(cfg, buildInvitationEmail(lang, ownerName, inv.role, inv.member_email, site));
    if (!result.ok) {
      await deps.release(inv.id, claim.prevAt); // l'utilisateur pourra réessayer tout de suite
      console.error("notify-invitation: envoi refusé par le fournisseur, statut:", result.status);
      return jsonResponse(cors, { error: "send_failed" }, 502);
    }
    return jsonResponse(cors, { sent: true });
  } catch (e) {
    console.error("notify-invitation: erreur inattendue:", e);
    return jsonResponse(cors, { error: "server_error" }, 500);
  }
}
