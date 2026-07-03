/**
 * Versao imprimivel do curriculo (EP-M06 / US-M06.04). Renderiza o agregado em
 * HTML limpo para o usuario fazer "Imprimir -> Salvar como PDF" no navegador.
 * Sem lib de PDF e sem dados financeiros. Funcao PURA (recebe o agregado).
 *
 * Inspirado no padrao de HTML gerado da pre-fatura
 * (apps/web/src/lib/billing/pre-invoice.ts renderPreInvoiceHtml).
 */
import type { ConsultantCurriculum } from "./curriculum";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function section(title: string, body: string): string {
  if (!body) return "";
  return `<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

export function renderCurriculumHtml(cv: ConsultantCurriculum): string {
  const subtitleParts = [cv.identity.jobTitle, cv.identity.seniority, cv.identity.area]
    .filter((part): part is string => Boolean(part))
    .map(escapeHtml);
  const subtitle = subtitleParts.length
    ? `<p class="subtitle">${subtitleParts.join(" &middot; ")}</p>`
    : "";
  const headline = cv.identity.headline
    ? `<p class="headline">${escapeHtml(cv.identity.headline)}</p>`
    : "";
  const summary = cv.identity.summary
    ? `<p class="summary">${escapeHtml(cv.identity.summary)}</p>`
    : "";

  const highlights = cv.highlights.length
    ? section(
        "Destaques",
        `<ul>${cv.highlights
          .map(
            (item) =>
              `<li><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)}</li>`,
          )
          .join("")}</ul>`,
      )
    : "";

  const education = cv.education.length
    ? section(
        "Formacao",
        `<ul>${cv.education
          .map((entry) => {
            const period = entry.period ? ` (${escapeHtml(entry.period)})` : "";
            const status = entry.completed ? "" : " — em andamento";
            return `<li><strong>${escapeHtml(entry.course)}</strong>, ${escapeHtml(entry.degree)} — ${escapeHtml(entry.institution)}${period}${status}</li>`;
          })
          .join("")}</ul>`,
      )
    : "";

  const languages = cv.languages.length
    ? section(
        "Idiomas",
        `<ul>${cv.languages
          .map(
            (entry) =>
              `<li>${escapeHtml(entry.name)} — ${escapeHtml(entry.level)}</li>`,
          )
          .join("")}</ul>`,
      )
    : "";

  const skills = cv.skills.length
    ? section(
        "Competencias validadas",
        `<ul>${cv.skills
          .map((entry) => {
            const category = entry.category ? ` (${escapeHtml(entry.category)})` : "";
            const years =
              entry.yearsExperience != null
                ? ` — ${entry.yearsExperience} ano(s)`
                : "";
            return `<li><strong>${escapeHtml(entry.name)}</strong>${category} — ${escapeHtml(entry.level)}${years}</li>`;
          })
          .join("")}</ul>`,
      )
    : "";

  const certificates = cv.certificates.length
    ? section(
        "Certificados",
        `<ul>${cv.certificates
          .map((entry) => {
            const expires = entry.expiresAt
              ? ` (valido ate ${escapeHtml(entry.expiresAt)})`
              : "";
            return `<li><strong>${escapeHtml(entry.name)}</strong> — ${escapeHtml(entry.issuer)}, ${escapeHtml(entry.issuedAt)}${expires}</li>`;
          })
          .join("")}</ul>`,
      )
    : "";

  const projects = cv.projects.length
    ? section(
        "Historico de projetos",
        `<ul>${cv.projects
          .map((entry) => {
            const client = entry.clientName ? ` — ${escapeHtml(entry.clientName)}` : "";
            return `<li><strong>${escapeHtml(entry.projectName)}</strong>${client} — ${escapeHtml(entry.role)} (${escapeHtml(entry.period)})</li>`;
          })
          .join("")}</ul>`,
      )
    : "";

  const generatedDate = cv.generatedAt.slice(0, 10);

  return [
    "<!doctype html>",
    '<html lang="pt-BR"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>Curriculo — ${escapeHtml(cv.identity.name)}</title>`,
    "<style>",
    "body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:760px;margin:32px auto;padding:0 24px;line-height:1.5;}",
    "h1{font-size:26px;margin:0 0 4px;}",
    "h2{font-size:15px;text-transform:uppercase;letter-spacing:.04em;color:#444;border-bottom:1px solid #ddd;padding-bottom:4px;margin:24px 0 8px;}",
    ".subtitle{color:#555;margin:0 0 8px;font-size:14px;}",
    ".headline{font-weight:600;margin:8px 0;}",
    ".summary{margin:8px 0;}",
    "ul{margin:6px 0;padding-left:20px;}",
    "li{margin:2px 0;}",
    ".footer{margin-top:32px;color:#888;font-size:12px;}",
    "@media print{body{margin:0;}.no-print{display:none;}}",
    "</style>",
    "</head><body>",
    `<h1>${escapeHtml(cv.identity.name)}</h1>`,
    subtitle,
    headline,
    summary,
    highlights,
    education,
    languages,
    skills,
    certificates,
    projects,
    `<p class="footer">Curriculo gerado em ${escapeHtml(generatedDate)}. Documento interno JumpFlow.</p>`,
    "</body></html>",
  ]
    .filter((part) => part.length > 0)
    .join("\n");
}
