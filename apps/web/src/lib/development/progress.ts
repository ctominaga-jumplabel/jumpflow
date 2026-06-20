import type { DevelopmentActionStatus, PlanProgress } from "./types";

/**
 * Pure progress computation for a PDI (EP17 US17.03).
 *
 * No I/O: callers pass the actions' status + dueAt; this returns the % done and
 * the overdue count. Cancelled actions don't count toward the denominator (they
 * were dropped, not pending). "today" is injected for deterministic tests.
 */

export interface ProgressActionInput {
  status: DevelopmentActionStatus;
  /** ISO yyyy-mm-dd, ou null se a ação não tem prazo. */
  dueAt: string | null;
}

/** yyyy-mm-dd de uma data (UTC), para comparar prazos sem fuso. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function computePlanProgress(
  actions: ReadonlyArray<ProgressActionInput>,
  today: string,
): PlanProgress {
  const total = actions.length;
  const done = actions.filter((a) => a.status === "DONE").length;
  // Denominador do percentual: ações não canceladas (as canceladas foram
  // descartadas, não estão "pendentes").
  const counted = actions.filter((a) => a.status !== "CANCELLED").length;
  const overdue = actions.filter(
    (a) =>
      a.dueAt !== null &&
      a.dueAt < today &&
      a.status !== "DONE" &&
      a.status !== "CANCELLED",
  ).length;
  const donePercent = counted === 0 ? 0 : Math.round((done / counted) * 100);
  return { total, done, overdue, donePercent };
}
