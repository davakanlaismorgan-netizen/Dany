import { buildCors, jsonResponse } from "../_shared/http.ts";
import { isUuid } from "../_shared/kkiapay.ts";
import { parseJpeg, stripControl } from "../_shared/pdf.ts";
import {
  type Brand, buildReport, type DatasetRow, type Lang, type ModelRow, type ReportInput, reportTitle, type Template, TEMPLATES,
} from "../_shared/reportdoc.ts";

export type Plan = "free" | "premium";
export const MAX_REPORTS_PER_HOUR = 20;
export const MAX_BRAND_NAME = 60;

export interface ProjectRow { id: string; user_id: string; name: string; description: string | null }
export interface ProjectData {
  datasets: DatasetRow[];
  models: ModelRow[];
  pipelines: ReportInput["pipelines"];
  visualizations: ReportInput["visualizations"];
}
export interface SaveArgs {
  ownerId: string;
  createdBy: string;
  projectId: string;
  name: string;
  template: Template;
  lang: Lang;
  extension: "pdf" | "csv";
  contentType: string;
  bytes: Uint8Array;
  branding: "das" | "custom";
}
export interface ReportDeps {
  env: (key: string) => string | undefined;
  now: () => Date;
  getUserId: (authHeader: string) => Promise<string | null>;
  canWriteWorkspace: (authHeader: string, ownerId: string) => Promise<boolean>;
  getProject: (id: string) => Promise<ProjectRow | null>;
  // Plan EFFECTIF du propriétaire (abonnement actif et non expiré), décidé par la base. Lève en cas de doute.
  getPlan: (ownerId: string) => Promise<Plan>;
  // Nom d'organisation du propriétaire (profil) et logo JPEG stocké dans « <propriétaire>/brand/logo.jpg ».
  getCompany: (ownerId: string) => Promise<string | null>;
  getLogo: (ownerId: string) => Promise<Uint8Array | null>;
  loadData: (projectId: string) => Promise<ProjectData>;
  countRecent: (ownerId: string, since: Date) => Promise<number>;
  save: (a: SaveArgs) => Promise<{ id: string } | { error: string }>;
}

/** Nom de marque affichable : sans caractères de contrôle, espaces normalisés, borné. */
export function cleanBrandName(raw: string | null | undefined): string {
  return stripControl(raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_BRAND_NAME);
}

export async function handleGenerateReport(req: Request, deps: ReportDeps): Promise<Response> {
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
  if (!isUuid(body.project_id) || !TEMPLATES.includes(body.template as Template) || (body.lang !== "fr" && body.lang !== "en")) {
    return jsonResponse(cors, { error: "invalid_request" }, 400);
  }
  const template = body.template as Template;
  const lang = body.lang as Lang;

  // Même réponse pour « inexistant » et « accès refusé ». Autorisé : propriétaire ou éditeur actif.
  const project = await deps.getProject(body.project_id as string);
  if (!project) return jsonResponse(cors, { error: "not_found" }, 404);
  if (project.user_id !== userId && !(await deps.canWriteWorkspace(authHeader!, project.user_id))) {
    return jsonResponse(cors, { error: "not_found" }, 404);
  }

  try {
    const now = deps.now();
    if ((await deps.countRecent(project.user_id, new Date(now.getTime() - 3600_000))) >= MAX_REPORTS_PER_HOUR) {
      return jsonResponse(cors, { error: "rate_limited" }, 429);
    }

    // Marque : DAS par défaut. Marque personnalisée uniquement si le plan EFFECTIF du propriétaire est Premium
    // ET qu'un nom d'organisation est renseigné ; le client n'a aucun moyen de la demander.
    const plan = await deps.getPlan(project.user_id);
    let brand: Brand = { kind: "das" };
    if (plan === "premium") {
      const name = cleanBrandName(await deps.getCompany(project.user_id));
      if (name) {
        const logoBytes = await deps.getLogo(project.user_id);
        brand = { kind: "custom", name, logo: logoBytes ? parseJpeg(logoBytes) : null };
      }
    }

    const data = await deps.loadData(project.id);
    const built = buildReport(template, {
      project: { name: project.name, description: project.description }, ...data, lang, brand, generatedAt: now,
    });
    const saved = await deps.save({
      ownerId: project.user_id, createdBy: userId, projectId: project.id, name: reportTitle(template, lang, now),
      template, lang, extension: built.extension, contentType: built.contentType, bytes: built.bytes, branding: brand.kind,
    });
    if ("error" in saved) {
      console.error("generate-report: enregistrement impossible:", saved.error);
      return jsonResponse(cors, { error: "server_error" }, 500);
    }
    return jsonResponse(cors, {
      report_id: saved.id, format: built.extension, branding: brand.kind, plan,
      // Premium sans nom d'organisation : on le signale pour que l'écran invite à le renseigner.
      brand_name_missing: plan === "premium" && brand.kind === "das",
    });
  } catch (e) {
    console.error("generate-report: erreur inattendue:", e);
    return jsonResponse(cors, { error: "server_error" }, 500);
  }
}
