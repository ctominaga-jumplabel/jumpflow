/**
 * Project margin (PR) — Onda 4.
 *
 * Pure helpers: given each allocation's sale rate (what we bill) and cost rate
 * (what we pay), compute the expected margin per allocation and per project.
 * No I/O — the DB layer resolves rates and feeds these.
 */

function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface AllocationMarginInput {
  /** Hours used for the projection (e.g. budget share or approved hours). */
  hours: number;
  /** Sale (billing) hourly rate; null when not priced. */
  saleRate: number | null;
  /** Cost (payment) hourly rate; null when no cost is registered. */
  costRate: number | null;
}

export interface AllocationMargin {
  revenue: number | null;
  cost: number | null;
  /** revenue - cost (null when either side is unknown). */
  margin: number | null;
  /** margin / revenue as 0–100 (null when revenue is 0/unknown). */
  marginPct: number | null;
}

export function computeAllocationMargin(
  input: AllocationMarginInput,
): AllocationMargin {
  const revenue =
    input.saleRate != null ? roundCents(input.hours * input.saleRate) : null;
  const cost =
    input.costRate != null ? roundCents(input.hours * input.costRate) : null;
  const margin =
    revenue != null && cost != null ? roundCents(revenue - cost) : null;
  const marginPct =
    margin != null && revenue != null && revenue > 0
      ? Math.round((margin / revenue) * 1000) / 10
      : null;
  return { revenue, cost, margin, marginPct };
}

export interface ProjectMarginTotals {
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number | null;
  /** True when at least one allocation has no cost rate (margin is partial). */
  hasMissingCost: boolean;
}

/**
 * Aggregate allocation margins into a project total. Allocations missing a cost
 * rate contribute their revenue but flag the total as partial (hasMissingCost).
 */
export function computeProjectMargin(
  allocations: AllocationMargin[],
): ProjectMarginTotals {
  let revenue = 0;
  let cost = 0;
  let hasMissingCost = false;
  for (const a of allocations) {
    if (a.revenue != null) revenue += a.revenue;
    if (a.cost != null) cost += a.cost;
    else hasMissingCost = true;
  }
  revenue = roundCents(revenue);
  cost = roundCents(cost);
  const margin = roundCents(revenue - cost);
  const marginPct =
    revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : null;
  return { revenue, cost, margin, marginPct, hasMissingCost };
}
