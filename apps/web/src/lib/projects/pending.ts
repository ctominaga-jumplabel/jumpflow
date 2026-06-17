import type { ProjectItem } from "./types";

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

/** Active project with no project-level sale rate currently in effect. */
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
