/**
 * Pure pre-invoice builder (Fase G — Financeiro Receita).
 *
 * Turns a CLOSED RevenueClosing + its lines + client billing data into a
 * deterministic pre-invoice artifact: one line per project (hours, unit rate,
 * amount), subtotal, estimated ISS (issRate% of subtotal) and total.
 *
 * This is the FINANCIAL VALIDATION step BEFORE fiscal issuance — it is NOT a
 * fiscal document (NFS-e is Fase H). No persistence, no I/O, no provider
 * coupling here so it stays trivially testable and deterministic.
 *
 * Value vocabulary (keep distinct):
 * - valor apurado  -> each line amount (hours * unitRate), summed into subtotal.
 * - ISS estimado   -> subtotal * issRate / 100 (estimate only; the real ISS is
 *                     computed by the NFS-e provider in Fase H).
 * - valor total    -> subtotal (services). ISS is informational/withheld; it is
 *                     reported separately and does NOT inflate the service total.
 */

import { formatCurrency, formatDate, formatHours, formatMonth } from "@/lib/format";

/** Money is rounded to cents to avoid floating-point drift in totals. */
function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** A single revenue closing line, grouped by project for the pre-invoice. */
export interface PreInvoiceLineInput {
  projectId: string;
  projectName: string;
  hours: number;
  unitRate: number;
  /** Persisted amount; falls back to hours*unitRate when absent/zero. */
  amount?: number;
}

export interface PreInvoiceClientInput {
  id: string;
  name: string;
  document?: string | null;
  municipality?: string | null;
  /** ISS rate as a 0–100 percentage (e.g. 2 = 2%). Null/absent -> no ISS. */
  issRate?: number | null;
}

export interface PreInvoiceClosingInput {
  id: string;
  month: number;
  year: number;
  /** Manual financial adjustment applied at the closing level (can be negative). */
  adjustmentAmount?: number;
}

export interface PreInvoiceInput {
  closing: PreInvoiceClosingInput;
  client: PreInvoiceClientInput;
  lines: PreInvoiceLineInput[];
  /** When the artifact is built (for the header). Defaults to a fixed epoch in
   * pure usage; callers in actions pass `new Date()`. */
  generatedAt?: Date;
}

export interface PreInvoiceLine {
  projectId: string;
  projectName: string;
  hours: number;
  unitRate: number;
  amount: number;
}

export interface PreInvoice {
  closingId: string;
  competence: string;
  clientName: string;
  clientDocument: string | null;
  municipality: string | null;
  issRate: number;
  lines: PreInvoiceLine[];
  /** Sum of all line amounts (valor apurado dos servicos). */
  servicesSubtotal: number;
  /** Manual adjustment carried from the closing (can be negative). */
  adjustmentAmount: number;
  /** servicesSubtotal + adjustmentAmount: the faturavel base for the period. */
  netServices: number;
  /** Estimated ISS = netServices * issRate / 100. Estimate only (Fase H is real). */
  estimatedIss: number;
  /** Total faturavel of services (== netServices). ISS reported separately. */
  total: number;
  generatedAt: string;
}

/**
 * Build the pre-invoice. Pure: same input -> same output. Lines are emitted in
 * the same order they arrive (caller groups/sorts by project upstream).
 */
export function buildPreInvoice(input: PreInvoiceInput): PreInvoice {
  const lines: PreInvoiceLine[] = input.lines.map((line) => {
    const hours = line.hours;
    const unitRate = line.unitRate;
    const amount =
      line.amount != null && line.amount !== 0
        ? roundCents(line.amount)
        : roundCents(hours * unitRate);
    return {
      projectId: line.projectId,
      projectName: line.projectName,
      hours,
      unitRate,
      amount,
    };
  });

  const servicesSubtotal = roundCents(
    lines.reduce((sum, line) => sum + line.amount, 0),
  );
  const adjustmentAmount = roundCents(input.closing.adjustmentAmount ?? 0);
  const netServices = roundCents(servicesSubtotal + adjustmentAmount);

  const issRate =
    input.client.issRate != null && input.client.issRate > 0
      ? input.client.issRate
      : 0;
  const estimatedIss = roundCents((netServices * issRate) / 100);

  return {
    closingId: input.closing.id,
    competence: formatMonth(input.closing.month, input.closing.year),
    clientName: input.client.name,
    clientDocument: input.client.document ?? null,
    municipality: input.client.municipality ?? null,
    issRate,
    lines,
    servicesSubtotal,
    adjustmentAmount,
    netServices,
    estimatedIss,
    total: netServices,
    generatedAt: (input.generatedAt ?? new Date(0)).toISOString(),
  };
}

/** Stable reference key for idempotency: one pre-invoice per closing+competence. */
export function preInvoiceReferenceKey(closing: {
  id: string;
  month: number;
  year: number;
}): string {
  const mm = String(closing.month).padStart(2, "0");
  return `${closing.id}:${closing.year}-${mm}`;
}

/** Storage key for the persisted artifact in the `pre-invoices` bucket. */
export function preInvoiceStorageKey(closing: {
  id: string;
  month: number;
  year: number;
}): string {
  const mm = String(closing.month).padStart(2, "0");
  return `${closing.year}-${mm}/pre-fatura-${closing.id}.html`;
}

/**
 * Deterministic plain-text rendering (used as the e-mail body and a degrade
 * fallback when storage is unavailable). No PDF dependency.
 */
export function renderPreInvoiceText(pre: PreInvoice): string {
  const lines: string[] = [
    `Pre-fatura — ${pre.clientName}`,
    `Competencia: ${pre.competence}`,
  ];
  if (pre.clientDocument) lines.push(`Documento: ${pre.clientDocument}`);
  if (pre.municipality) lines.push(`Municipio: ${pre.municipality}`);
  lines.push("");
  lines.push("Servicos por projeto:");
  for (const line of pre.lines) {
    lines.push(
      `- ${line.projectName}: ${formatHours(line.hours)} x ` +
        `${formatCurrency(line.unitRate)} = ${formatCurrency(line.amount)}`,
    );
  }
  lines.push("");
  lines.push(`Subtotal servicos: ${formatCurrency(pre.servicesSubtotal)}`);
  if (pre.adjustmentAmount !== 0) {
    lines.push(`Ajuste manual: ${formatCurrency(pre.adjustmentAmount)}`);
  }
  lines.push(`Total faturavel: ${formatCurrency(pre.total)}`);
  lines.push(
    `ISS estimado (${pre.issRate}%): ${formatCurrency(pre.estimatedIss)}`,
  );
  lines.push("");
  lines.push(
    "Pre-fatura para validacao financeira. Nao constitui documento fiscal.",
  );
  return lines.join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Deterministic HTML rendering for the stored artifact / on-screen preview.
 * Self-contained (inline styles); no external assets, no PDF library.
 */
export function renderPreInvoiceHtml(pre: PreInvoice): string {
  const rows = pre.lines
    .map(
      (line) =>
        `<tr><td>${escapeHtml(line.projectName)}</td>` +
        `<td style="text-align:right">${formatHours(line.hours)}</td>` +
        `<td style="text-align:right">${formatCurrency(line.unitRate)}</td>` +
        `<td style="text-align:right">${formatCurrency(line.amount)}</td></tr>`,
    )
    .join("");
  const adjustmentRow =
    pre.adjustmentAmount !== 0
      ? `<tr><th colspan="3" style="text-align:right">Ajuste manual</th>` +
        `<td style="text-align:right">${formatCurrency(pre.adjustmentAmount)}</td></tr>`
      : "";
  const docLine = pre.clientDocument
    ? `<p>Documento: ${escapeHtml(pre.clientDocument)}</p>`
    : "";
  const cityLine = pre.municipality
    ? `<p>Municipio: ${escapeHtml(pre.municipality)}</p>`
    : "";
  return [
    "<!doctype html>",
    '<html lang="pt-BR"><head><meta charset="utf-8">',
    `<title>Pre-fatura ${escapeHtml(pre.clientName)} — ${escapeHtml(pre.competence)}</title>`,
    "</head><body>",
    `<h1>Pre-fatura — ${escapeHtml(pre.clientName)}</h1>`,
    `<p>Competencia: ${escapeHtml(pre.competence)}</p>`,
    docLine,
    cityLine,
    '<table border="1" cellpadding="6" cellspacing="0">',
    "<thead><tr><th>Projeto</th><th>Horas</th><th>Valor hora</th><th>Valor</th></tr></thead>",
    `<tbody>${rows}</tbody>`,
    "<tfoot>",
    `<tr><th colspan="3" style="text-align:right">Subtotal servicos</th>` +
      `<td style="text-align:right">${formatCurrency(pre.servicesSubtotal)}</td></tr>`,
    adjustmentRow,
    `<tr><th colspan="3" style="text-align:right">Total faturavel</th>` +
      `<td style="text-align:right">${formatCurrency(pre.total)}</td></tr>`,
    `<tr><th colspan="3" style="text-align:right">ISS estimado (${pre.issRate}%)</th>` +
      `<td style="text-align:right">${formatCurrency(pre.estimatedIss)}</td></tr>`,
    "</tfoot>",
    "</table>",
    `<p><small>Gerada em ${formatDate(pre.generatedAt.slice(0, 10))}. ` +
      "Pre-fatura para validacao financeira. Nao constitui documento fiscal.</small></p>",
    "</body></html>",
  ]
    .filter((part) => part.length > 0)
    .join("\n");
}
