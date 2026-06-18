import type { AllocationStatus, ProjectItem } from "./types";

/**
 * Pure derivations for the per-area pending queues. A `Project` is allowed to
 * exist in a partial state (created by Operação without sale value or billing
 * rule yet); the queues are derived from the current state — no materialized
 * "setup completeness" field on the entity (see docs/modelo-dados.md, regras
 * transversais: estrutura no banco, regras derivadas na aplicação).
 *
 * Only ACTIVE projects are considered pending: a PROPOSAL is not yet expected
 * to be priced, and a CLOSED/PAUSED project should not nag the áreas.
 */

/**
 * Whether a sale rate is a project-level (base) rate currently in effect on
 * `todayIso` — the same semantics `listProjects` uses to set `hasActiveSaleRate`
 * (scope = no consultant/allocation; vigência cobre hoje). Shared so the demo
 * optimistic updates stay consistent with the server-derived flag. ISO dates
 * (YYYY-MM-DD) compare chronologically as strings.
 */
export function isProjectBaseSaleRateActive(
  rate: {
    consultantId?: string;
    allocationId?: string;
    startsAt: string;
    endsAt?: string;
  },
  todayIso: string,
): boolean {
  return (
    !rate.consultantId &&
    !rate.allocationId &&
    rate.startsAt <= todayIso &&
    (!rate.endsAt || rate.endsAt >= todayIso)
  );
}

/** Vigência check (scope-agnostic): rate is in effect on `todayIso`. */
function isSaleRateActiveOn(
  rate: { startsAt: string; endsAt?: string },
  todayIso: string,
): boolean {
  return rate.startsAt <= todayIso && (!rate.endsAt || rate.endsAt >= todayIso);
}

type ScopeRate = {
  consultantId?: string | null;
  allocationId?: string | null;
};
type PriceableAllocation = { id: string; consultantId: string; status: AllocationStatus };

/**
 * Whether a project is considered priced. A project counts as having a sale
 * value when EITHER a project-level base rate is in effect (covers everyone),
 * OR — pricing per consultant, como no Comercial — every active/planned
 * allocation has its own rate (escopo alocação ou consultor). Sem alocações e
 * sem base rate, ainda falta precificar. `vigentRates` já vem filtrado por
 * vigência (a chamada decide a data de referência).
 */
export function projectHasSaleValue(
  allocations: PriceableAllocation[],
  vigentRates: ScopeRate[],
): boolean {
  const hasBase = vigentRates.some((r) => !r.consultantId && !r.allocationId);
  if (hasBase) return true;
  const priceable = allocations.filter(
    (a) => a.status === "ACTIVE" || a.status === "PLANNED",
  );
  if (priceable.length === 0) return false;
  return priceable.every((a) =>
    vigentRates.some(
      (r) =>
        r.allocationId === a.id ||
        (!r.allocationId && r.consultantId === a.consultantId),
    ),
  );
}

/** `projectHasSaleValue` applied to a UI ProjectItem (filters by vigência). */
export function projectItemHasSaleValue(
  project: ProjectItem,
  todayIso: string,
): boolean {
  const vigentRates = project.saleRates.filter((rate) =>
    isSaleRateActiveOn(rate, todayIso),
  );
  return projectHasSaleValue(project.allocations, vigentRates);
}

/**
 * Active project still missing a sale value. "Tem valor" agora considera a
 * precificação por consultor (todos os vínculos ativos/planejados com rate),
 * não apenas um valor de venda a nível de projeto — por isso a flag some quando
 * todos os consultores foram precificados.
 */
export function isMissingSaleRate(project: ProjectItem): boolean {
  return project.status === "ACTIVE" && !project.hasActiveSaleRate;
}

/** Active project with no billing rule (ProjectBillingConfig) configured. */
export function isMissingBillingConfig(project: ProjectItem): boolean {
  return project.status === "ACTIVE" && !project.hasBillingConfig;
}

/** Count of active projects awaiting a sale value (fila do Comercial). */
export function countMissingSaleRate(projects: ProjectItem[]): number {
  return projects.filter(isMissingSaleRate).length;
}

/** Count of active projects awaiting a billing rule (fila do Financeiro). */
export function countMissingBillingConfig(projects: ProjectItem[]): number {
  return projects.filter(isMissingBillingConfig).length;
}
