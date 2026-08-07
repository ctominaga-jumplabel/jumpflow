/**
 * Pure comparison between the amount DECLARED on a consultant invoice (NF) and
 * the amount the platform EXPECTS to pay (melhoria #4).
 *
 * Product decision: a divergence only ALERTS — it never blocks validation or
 * approval. The rule lives here (not in the schema) so the backend, the DTO and
 * the audit trail all share a single source of truth.
 */

import type { ConsultantPaymentView } from "./types";

/**
 * Relative tolerance below which a difference is treated as noise (rounding,
 * cents). Default 1%. Anything strictly above this — in absolute relative terms
 * — is flagged as divergent.
 */
export const INVOICE_AMOUNT_TOLERANCE = 0.01;

export interface InvoiceAmountComparison {
  /** Amount the platform expects to pay (pjAmount for PJ, else totalAmount). */
  expected: number;
  /** Amount the consultant declared on the NF. */
  declared: number;
  /** declared - expected (positive = NF above expected). */
  diff: number;
  /** |diff| / expected, as a fraction (0.05 = 5%). 0 when expected is 0. */
  diffPct: number;
  /** True when |diffPct| strictly exceeds {@link INVOICE_AMOUNT_TOLERANCE}. */
  isDivergent: boolean;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Compare a declared NF amount against the expected payable amount. Returns a
 * fully-populated comparison; the caller decides how to surface `isDivergent`
 * (badge, audit detail) — this helper never throws and never blocks.
 *
 * Edge case: an expected amount of 0 means there is nothing to compare against,
 * so any non-zero declared amount is divergent (diffPct falls back to the
 * absolute diff being non-zero) while a declared 0 matches exactly.
 */
export function compareInvoiceAmount(input: {
  declared: number;
  expected: number;
}): InvoiceAmountComparison {
  const expected = round2(input.expected);
  const declared = round2(input.declared);
  const diff = round2(declared - expected);
  if (expected === 0) {
    return {
      expected,
      declared,
      diff,
      diffPct: 0,
      isDivergent: Math.abs(diff) > 0,
    };
  }
  const diffPct = Math.abs(diff) / Math.abs(expected);
  return {
    expected,
    declared,
    diff,
    diffPct,
    isDivergent: diffPct > INVOICE_AMOUNT_TOLERANCE,
  };
}

/**
 * The amount the platform expects on the NF for a given contract:
 * `pjAmount` for pure PJ (the service value), otherwise the full `totalAmount`
 * (CLT FLEX bundles CLT net + PJ service; the NF covers the whole payment).
 */
export function expectedInvoiceAmount(input: {
  contractType: ConsultantPaymentView["contractType"];
  pjAmount: number;
  totalAmount: number;
}): number {
  return input.contractType === "PJ" ? input.pjAmount : input.totalAmount;
}

/**
 * Convenience: build the comparison from a payment's fields, or `null` when no
 * NF amount was declared yet (nothing to compare). Shared by the finance list
 * and the consultant's own list so both expose the identical divergence shape.
 */
export function buildInvoiceComparison(input: {
  contractType: ConsultantPaymentView["contractType"];
  pjAmount: number;
  totalAmount: number;
  invoiceAmount: number | null;
}): InvoiceAmountComparison | null {
  if (input.invoiceAmount == null) return null;
  return compareInvoiceAmount({
    declared: input.invoiceAmount,
    expected: expectedInvoiceAmount(input),
  });
}
