/**
 * Overtime + vacation billing rules (Onda 3 — items 3.2 e 3.5).
 *
 * Pure, deterministic helpers (no I/O) — like charge-engine.ts. They turn a
 * project's configured policy (ProjectBillingConfig) into concrete charges so
 * the Financeiro can apply them on top of the base billing. Kept standalone so
 * the existing revenue math is untouched until explicitly wired.
 */

export type OvertimeAppliesTo = "NONE" | "CLT" | "PJ" | "BOTH";
export type ContractType = "CLT" | "PJ" | "CLT_FLEX";

export interface OvertimePolicy {
  appliesTo: OvertimeAppliesTo;
  /** Percentage uplift on the overtime hours' value (e.g. 50 = +50%). */
  billingPct?: number | null;
  /** Hours above which the excess rate applies. */
  excessThresholdHours?: number | null;
  /** Flat amount charged per excess hour (above the threshold). */
  excessHourRate?: number | null;
}

function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Whether the overtime policy applies to a given contract type. */
export function overtimePolicyApplies(
  appliesTo: OvertimeAppliesTo,
  contractType: ContractType,
): boolean {
  switch (appliesTo) {
    case "BOTH":
      return true;
    case "CLT":
      // CLT_FLEX is a CLT-based contract for overtime purposes.
      return contractType === "CLT" || contractType === "CLT_FLEX";
    case "PJ":
      return contractType === "PJ";
    case "NONE":
    default:
      return false;
  }
}

export interface OvertimeChargeResult {
  applies: boolean;
  /** billingPct% × (overtimeHours × hourlyRate). */
  upliftAmount: number;
  /** Hours beyond the configured threshold. */
  excessHours: number;
  /** excessHours × excessHourRate. */
  excessAmount: number;
  /** upliftAmount + excessAmount. */
  total: number;
  notes: string[];
}

/**
 * Compute the extra overtime charge for a consultant's overtime in a period.
 * Returns zeros (applies=false) when the policy does not target the contract.
 */
export function computeOvertimeCharge(input: {
  overtimeHours: number;
  hourlyRate: number;
  contractType: ContractType;
  policy: OvertimePolicy;
}): OvertimeChargeResult {
  const { overtimeHours, hourlyRate, contractType, policy } = input;
  const notes: string[] = [];
  const zero: OvertimeChargeResult = {
    applies: false,
    upliftAmount: 0,
    excessHours: 0,
    excessAmount: 0,
    total: 0,
    notes,
  };

  if (overtimeHours <= 0) return zero;
  if (!overtimePolicyApplies(policy.appliesTo, contractType)) {
    notes.push(`Regra de hora extra não se aplica ao vínculo ${contractType}.`);
    return zero;
  }

  const pct = policy.billingPct ?? 0;
  const upliftAmount =
    pct > 0 ? roundCents(overtimeHours * hourlyRate * (pct / 100)) : 0;
  if (upliftAmount > 0) {
    notes.push(
      `Adicional de ${pct}% sobre ${overtimeHours}h extra(s): +${upliftAmount}.`,
    );
  }

  let excessHours = 0;
  let excessAmount = 0;
  const threshold = policy.excessThresholdHours ?? null;
  const excessRate = policy.excessHourRate ?? null;
  if (threshold != null && excessRate != null && overtimeHours > threshold) {
    excessHours = roundCents(overtimeHours - threshold);
    excessAmount = roundCents(excessHours * excessRate);
    notes.push(
      `Excedente: ${excessHours}h acima de ${threshold}h × ${excessRate} = ${excessAmount}.`,
    );
  }

  return {
    applies: true,
    upliftAmount,
    excessHours,
    excessAmount,
    total: roundCents(upliftAmount + excessAmount),
    notes,
  };
}

export interface VacationBillingResult {
  /** Amount actually billable after applying the vacation policy. */
  billable: number;
  /** Amount deducted because of vacation (0 when billing during vacation). */
  deduction: number;
  notes: string[];
}

/**
 * Apply the "bill during vacation" policy to a period amount. When billing is
 * NOT allowed during vacation, deduct the vacation share pro-rata over the
 * period (e.g. fixed/monthly contracts). When allowed, the amount is unchanged.
 */
export function applyVacationPolicy(input: {
  amount: number;
  vacationDays: number;
  daysInPeriod: number;
  billDuringVacation: boolean;
}): VacationBillingResult {
  const { amount, vacationDays, daysInPeriod, billDuringVacation } = input;
  const notes: string[] = [];
  if (billDuringVacation || vacationDays <= 0 || daysInPeriod <= 0) {
    return { billable: roundCents(amount), deduction: 0, notes };
  }
  const cappedDays = Math.min(vacationDays, daysInPeriod);
  const deduction = roundCents(amount * (cappedDays / daysInPeriod));
  notes.push(
    `Férias: ${cappedDays}/${daysInPeriod} dias não faturados (-${deduction}).`,
  );
  return { billable: roundCents(amount - deduction), deduction, notes };
}
