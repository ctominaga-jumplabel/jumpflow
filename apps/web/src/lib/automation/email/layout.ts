/**
 * Zero-dependency, brand-consistent email renderer for JumpFlow.
 *
 * Why no library (react-email/mjml): the automation engine runs inside Server
 * Actions and cron job handlers where a build/runtime dependency adds weight
 * and coupling for little gain. These pure functions return both an HTML body
 * and a plain-text fallback, so a single template feeds `EmailTransport`
 * (html + text) without extra tooling.
 *
 * Robustness: table-based layout with inline styles (no fl/grid, no <style>
 * media queries relied upon) so it renders in Outlook, Gmail and Apple Mail.
 * The neo-brutalist frame/CTA degrade gracefully where box-shadow is dropped.
 */
import { appConfig } from "@/config/app";
import { COMPANY_LOGO_CID, PRODUCT_LOGO_CID } from "./inline-assets";
import { emailTheme, toneColors, type EmailTone } from "./theme";

const C = emailTheme.color;
const F = emailTheme.font;

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A renderable block carries both its HTML and a plain-text projection. */
export interface EmailBlock {
  html: string;
  text: string;
}

export function paragraph(text: string): EmailBlock {
  return {
    html: `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${C.textMedium};">${esc(
      text,
    )}</p>`,
    text,
  };
}

export function heading(text: string): EmailBlock {
  return {
    html: `<h2 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:${C.textStrong};font-weight:700;">${esc(
      text,
    )}</h2>`,
    text: `\n${text}\n`,
  };
}

/** Key/value summary (e.g. competência, prazo, total). Clean, no heavy borders. */
export function keyValueList(rows: Array<{ label: string; value: string }>): EmailBlock {
  const htmlRows = rows
    .map(
      (r) =>
        `<tr>` +
        `<td style="padding:6px 0;font-size:13px;color:${C.textSoft};white-space:nowrap;">${esc(
          r.label,
        )}</td>` +
        `<td style="padding:6px 0 6px 16px;font-size:14px;color:${C.textStrong};font-weight:600;text-align:right;">${esc(
          r.value,
        )}</td>` +
        `</tr>`,
    )
    .join("");
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-top:1px solid ${C.borderSoft};border-bottom:1px solid ${C.borderSoft};">${htmlRows}</table>`,
    text: rows.map((r) => `${r.label}: ${r.value}`).join("\n"),
  };
}

/** Data table (e.g. apuração por consultor). Scannable, light separators. */
export function dataTable(
  headers: string[],
  rows: string[][],
  options?: { alignRight?: number[] },
): EmailBlock {
  const alignRight = new Set(options?.alignRight ?? []);
  const align = (i: number) => (alignRight.has(i) ? "right" : "left");
  const head = headers
    .map(
      (h, i) =>
        `<th style="padding:8px 10px;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:${C.textSoft};text-align:${align(
          i,
        )};border-bottom:2px solid ${C.ink};">${esc(h)}</th>`,
    )
    .join("");
  const body = rows
    .map(
      (cells, ri) =>
        `<tr style="background:${ri % 2 ? C.surfaceMuted : C.surface};">` +
        cells
          .map(
            (cell, i) =>
              `<td style="padding:8px 10px;font-size:13px;color:${C.textStrong};text-align:${align(
                i,
              )};">${esc(cell)}</td>`,
          )
          .join("") +
        `</tr>`,
    )
    .join("");
  const textRows = [
    headers.join(" | "),
    ...rows.map((cells) => cells.join(" | ")),
  ].join("\n");
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`,
    text: textRows,
  };
}

/** Tone-colored callout for status, alerts and reminders. */
export function callout(text: string, tone: EmailTone = "neutral"): EmailBlock {
  const { text: fg, bg } = toneColors(tone);
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td style="padding:14px 16px;background:${bg};border-radius:${emailTheme.radius};font-size:14px;line-height:1.5;color:${fg};font-weight:600;">${esc(
      text,
    )}</td></tr></table>`,
    text: `>> ${text}`,
  };
}

/** Single emphasized number (e.g. total a faturar / margem esperada). */
export function kpi(label: string, value: string, tone: EmailTone = "info"): EmailBlock {
  const { text: fg } = toneColors(tone);
  return {
    html: `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td style="padding:16px 20px;border:2px solid ${C.ink};border-radius:${emailTheme.radius};box-shadow:4px 4px 0 ${C.ink};background:${C.surface};"><div style="font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:${C.textSoft};margin-bottom:4px;">${esc(
      label,
    )}</div><div style="font-size:26px;font-weight:700;color:${fg};">${esc(
      value,
    )}</div></td></tr></table>`,
    text: `${label}: ${value}`,
  };
}

/** Primary CTA — high-value, so it carries the brutalist treatment. */
export function button(label: string, url: string): EmailBlock {
  return {
    html: `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="border:2px solid ${C.ink};border-radius:${emailTheme.radius};box-shadow:4px 4px 0 ${C.ink};background:${C.blue};"><a href="${esc(
      url,
    )}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">${esc(
      label,
    )}</a></td></tr></table>`,
    text: `${label}: ${url}`,
  };
}

export function divider(): EmailBlock {
  return {
    html: `<div style="height:1px;background:${C.borderSoft};margin:0 0 20px;"></div>`,
    text: "—",
  };
}

/**
 * Which brand the shell wears.
 * - "product" (default): JumpFlow — the internal operational tool. Used for
 *   all internal notifications (team, DP, financeiro, comercial).
 * - "company": Jump — the parent brand. Used for anything that leaves the
 *   building (client-facing email), so the client sees Jump, not the tool.
 */
export type EmailBrand = "product" | "company";

export interface RenderEmailInput {
  /** Hidden inbox preview text. */
  preheader?: string;
  /** Big title at the top of the card. */
  title: string;
  /** Ordered content blocks. */
  blocks: EmailBlock[];
  /** Optional closing note shown above the footer. */
  signoff?: string;
  /** Brand identity for the header/footer. Defaults to the product (JumpFlow). */
  brand?: EmailBrand;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

/** Product tagline shown under the wordmark — the brand's guiding phrase. */
const PRODUCT_TAGLINE = "Operações & consultoria, sem parecer arrastado.";

interface ResolvedBrand {
  name: string;
  monogram: string;
  logoUrl: string | null;
  /** Content-ID for the inline logo, referenced as `cid:<id>` in the <img>. */
  logoCid: string;
  /**
   * A wordmark logo already contains the brand name and reads horizontally, so
   * it renders on its own (no icon tile, no repeated text). A non-wordmark logo
   * is a square icon shown in the brutalist tile beside the wordmark text.
   */
  logoIsWordmark: boolean;
  /** Rendered logo dimensions in px (kept in aspect ratio of the source). */
  logoWidth: number;
  logoHeight: number;
  tagline: string;
  /** Footer identity line shown above the fine print. */
  footerLine: string;
}

function resolveBrand(brand: EmailBrand): ResolvedBrand {
  if (brand === "company") {
    return {
      name: appConfig.company.name,
      monogram: appConfig.company.monogram,
      logoUrl: appConfig.company.logoUrl,
      logoCid: COMPANY_LOGO_CID,
      logoIsWordmark: true, // Jump logo is a horizontal wordmark (1369×310)
      logoWidth: 132,
      logoHeight: 30,
      tagline: "", // client-facing: keep it clean, no internal tagline
      footerLine: appConfig.company.name,
    };
  }
  return {
    name: appConfig.name,
    monogram: appConfig.monogram,
    logoUrl: appConfig.logoUrl,
    logoCid: PRODUCT_LOGO_CID,
    logoIsWordmark: false, // JumpFlow logo is a square icon
    logoWidth: 30,
    logoHeight: 30,
    tagline: PRODUCT_TAGLINE,
    footerLine: `${appConfig.name} · plataforma Jump de operações e consultoria`,
  };
}

/**
 * Header brand mark cells. A wordmark logo renders on its own; a square icon
 * (or its textual-monogram fallback) sits in the brutalist tile beside the
 * wordmark text + tagline — mirroring the in-app `BrandMark`. Mail clients
 * cannot reach app-relative assets, so the monogram is the graceful fallback
 * when no public logo URL is available.
 */
function renderHeaderCells(b: ResolvedBrand): string {
  const imgReset =
    "border:0;outline:none;text-decoration:none;display:block;";

  if (b.logoUrl && b.logoIsWordmark) {
    return `<td style="vertical-align:middle;"><img src="cid:${
      b.logoCid
    }" width="${b.logoWidth}" height="${b.logoHeight}" alt="${esc(
      b.name,
    )}" style="${imgReset}height:${b.logoHeight}px;width:auto;" /></td>`;
  }

  const tileBase =
    "width:44px;height:44px;border:2px solid " +
    C.ink +
    ";border-radius:10px;box-shadow:2px 2px 0 " +
    C.ink +
    ";text-align:center;vertical-align:middle;";
  const tile = b.logoUrl
    ? `<td style="${tileBase}background:${C.surface};"><img src="cid:${
        b.logoCid
      }" width="${b.logoWidth}" height="${b.logoHeight}" alt="${esc(
        b.name,
      )}" style="${imgReset}margin:0 auto;" /></td>`
    : `<td style="${tileBase}background:${C.ink};color:#ffffff;font-weight:800;font-size:16px;">${esc(
        b.monogram,
      )}</td>`;

  const taglineHtml = b.tagline
    ? `<div style="font-size:11px;color:${C.textSoft};line-height:1.3;padding-top:2px;">${esc(
        b.tagline,
      )}</div>`
    : "";

  return `${tile}
          <td style="padding-left:12px;vertical-align:middle;">
            <div style="font-size:17px;font-weight:800;color:${C.textStrong};line-height:1.1;">${esc(
              b.name,
            )}</div>
            ${taglineHtml}
          </td>`;
}

/**
 * Secondary company mark shown on the RIGHT of the product header — the Jump
 * logo, opposite the JumpFlow mark. Only for the product brand: the company
 * brand header already IS the Jump wordmark. Returns "" when no company logo
 * URL is available so the header degrades cleanly (no broken image).
 */
function renderCompanyMarkCell(brand: EmailBrand): string {
  if (brand === "company") return "";
  const url = appConfig.company.logoUrl;
  if (!url) return "";
  // Jump wordmark is 1369×310 → keep aspect ratio at 24px tall.
  const h = 24;
  const w = 106;
  return `<td align="right" style="vertical-align:middle;text-align:right;"><img src="cid:${COMPANY_LOGO_CID}" width="${w}" height="${h}" alt="${esc(
    appConfig.company.name,
  )}" style="border:0;outline:none;text-decoration:none;display:inline-block;height:${h}px;width:auto;" /></td>`;
}

export function renderEmail(input: RenderEmailInput): RenderedEmail {
  const brand = input.brand ?? "product";
  const b = resolveBrand(brand);
  const isCompany = brand === "company";
  const companyMarkCell = renderCompanyMarkCell(brand);
  const year = "2026"; // Date.now() is unavailable in some runtimes; static is fine for footer.
  const preheader = input.preheader ?? "";
  const copyrightName = appConfig.company.name;

  const bodyHtml = input.blocks.map((blk) => blk.html).join("\n");
  const signoffHtml = input.signoff
    ? `<p style="margin:24px 0 0;font-size:14px;color:${C.textMedium};">${esc(
        input.signoff,
      ).replace(/\n/g, "<br/>")}</p>`
    : "";

  // The app link is internal, so only the product brand exposes it. Client mail
  // (company brand) stays link-free.
  const footerLink =
    !isCompany && appConfig.url
      ? ` · <a href="${esc(appConfig.url)}" style="color:${C.textSoft};text-decoration:underline;">${esc(
          appConfig.host ?? appConfig.url,
        )}</a>`
      : "";
  const finePrint = isCompany
    ? `Em caso de divergência, responda a este e-mail.<br/>© ${year} ${esc(
        copyrightName,
      )}.`
    : `E-mail operacional automático — em caso de divergência, entre em contato com o WhatsApp da operação (11) 97845-1754.<br/>© ${year} ${esc(
        copyrightName,
      )}.${footerLink}`;

  const html = `<!--[if mso]><style>body,table,td{font-family:Arial,sans-serif !important;}</style><![endif]-->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvas};padding:24px 12px;font-family:${F.sans};">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${emailTheme.maxWidth};margin:0 auto;">
      <tr><td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              ${renderHeaderCells(b)}
            </tr></table>
          </td>
          ${companyMarkCell}
        </tr></table>
      </td></tr>
      <tr><td style="background:${C.surface};border:2px solid ${C.ink};border-radius:${emailTheme.radius};box-shadow:6px 6px 0 ${C.ink};padding:28px;">
        <div style="height:6px;width:48px;background:${C.coral};border-radius:3px;margin:0 0 20px;"></div>
        <h1 style="margin:0 0 20px;font-size:22px;line-height:1.25;color:${C.textStrong};font-weight:800;">${esc(
          input.title,
        )}</h1>
        ${bodyHtml}
        ${signoffHtml}
      </td></tr>
      <tr><td style="padding:20px 4px 0;">
        <div style="height:1px;background:${C.borderSoft};margin:0 0 14px;"></div>
        <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:${C.textMedium};">${esc(
          b.footerLine,
        )}</p>
        <p style="margin:0;font-size:11px;color:${C.textSoft};line-height:1.6;">
          ${finePrint}
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>`;

  const textParts = [
    b.tagline ? `${b.name} — ${b.tagline}` : b.name,
    "",
    input.title,
    "",
    ...input.blocks.map((blk) => blk.text),
  ];
  if (input.signoff) textParts.push("", input.signoff);
  textParts.push(
    "",
    "—",
    isCompany
      ? `Enviado por ${b.name}. Responda em caso de divergência.`
      : `Enviado automaticamente pelo ${b.name}. Responda em caso de divergência.`,
    ...(!isCompany && appConfig.url ? [appConfig.url] : []),
  );

  return { html, text: textParts.join("\n") };
}
