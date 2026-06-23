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

export interface RenderEmailInput {
  /** Hidden inbox preview text. */
  preheader?: string;
  /** Big title at the top of the card. */
  title: string;
  /** Ordered content blocks. */
  blocks: EmailBlock[];
  /** Optional closing note shown above the footer. */
  signoff?: string;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

/**
 * Wrap content blocks in the branded JumpFlow shell and return both bodies.
 * The app name comes from `appConfig` (configurable via NEXT_PUBLIC_APP_NAME),
 * keeping the product easy to rename per CLAUDE.md.
 */
export function renderEmail(input: RenderEmailInput): RenderedEmail {
  const appName = appConfig.name;
  const monogram = appConfig.monogram;
  const year = "2026"; // Date.now() is unavailable in some runtimes; static is fine for footer.
  const preheader = input.preheader ?? "";

  const bodyHtml = input.blocks.map((b) => b.html).join("\n");
  const signoffHtml = input.signoff
    ? `<p style="margin:24px 0 0;font-size:14px;color:${C.textMedium};">${esc(
        input.signoff,
      )}</p>`
    : "";

  const html = `<!--[if mso]><style>body,table,td{font-family:Arial,sans-serif !important;}</style><![endif]-->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvas};padding:24px 12px;font-family:${F.sans};">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${emailTheme.maxWidth};margin:0 auto;">
      <tr><td style="padding:0 0 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="width:40px;height:40px;background:${C.ink};border-radius:8px;text-align:center;vertical-align:middle;color:#ffffff;font-weight:700;font-size:16px;">${esc(
            monogram,
          )}</td>
          <td style="padding-left:12px;font-size:16px;font-weight:700;color:${C.textStrong};">${esc(
            appName,
          )}</td>
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
      <tr><td style="padding:16px 4px 0;font-size:12px;color:${C.textSoft};line-height:1.5;">
        Enviado automaticamente pelo ${esc(appName)} · plataforma Jump de operações e consultoria.<br/>
        © ${year} Jump. Este é um e-mail operacional; responda em caso de divergência.
      </td></tr>
    </table>
  </td></tr>
</table>`;

  const textParts = [
    `${appName}`,
    "",
    input.title,
    "",
    ...input.blocks.map((b) => b.text),
  ];
  if (input.signoff) textParts.push("", input.signoff);
  textParts.push(
    "",
    "—",
    `Enviado automaticamente pelo ${appName}. Responda em caso de divergência.`,
  );

  return { html, text: textParts.join("\n") };
}
