/**
 * Motor de regras de faturamento (parametrizavel por projeto).
 *
 * Pure, deterministic, no I/O — same input -> same output, trivially testable
 * (mirrors the spirit of `buildPreInvoice`). Given a project's charge model
 * (`chargeType`, from the BillingType catalog) and its per-project parameters
 * (ProjectBillingConfig), it turns the period's raw signals (approved hours,
 * hours value, allocated consultants, reimbursable expenses) into the BILLABLE
 * amount for that project — without hardcoding any single contract's logic.
 *
 * Types that have no automatic data source yet (Milestone, Sprint, On-demand,
 * Pay-as-you-go, Success fee) are emitted as `manual`: the value comes from the
 * configured `fixedAmount` (or 0) and a note tells the Financeiro to confirm it.
 * Reajuste indices other than a fixed percentage are recorded as notes only
 * (no external index source in this cycle); ISS/withholding are informational
 * (reported separately by the pre-invoice, never inflating the service total).
 */

import type { BillingChargeType } from "@/lib/clients/types";
import type {
  AdjustmentIndex,
  BillingRoundingRule,
  OverageTreatment,
} from "@/lib/projects/types";

/** Per-project parameters consumed by the engine (subset of ProjectBillingConfig). */
export interface BillingEngineConfig {
  roundingRule: BillingRoundingRule;
  fixedAmount?: number;
  includedHours?: number;
  overageRate?: number;
  overageTreatment: OverageTreatment;
  perConsultantAmount?: number;
  reimbursableExpenses: boolean;
  reimbursableMarkupPct?: number;
  discountPct?: number;
  penaltyPct?: number;
  adjustmentIndex: AdjustmentIndex;
  adjustmentPct?: number;
}

/** Period signals gathered from the project's approved work. */
export interface BillingEngineContext {
  /** Sum of approved, billable hours in the period. */
  approvedHours: number;
  /** Sum of (hours * resolved sale rate) for those hours. */
  hourlyAmount: number;
  /** Active allocations on the project (for per-consultant pricing). */
  allocatedConsultants: number;
  /** Approved reimbursable expense total for the period (T&M). */
  reimbursableExpenseTotal: number;
}

export interface BillingComputation {
  /** Billable hours after rounding / overage treatment. */
  hours: number;
  /** Subtotal before discounts/penalties/reajuste. */
  subtotal: number;
  /** Final billable amount (after reajuste, discount and penalty). */
  amount: number;
  /** True when the value needs manual confirmation by the Financeiro. */
  manual: boolean;
  /** Human-readable explanation of how the amount was reached. */
  notes: string[];
}

function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundHours(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Apply the rounding rule to a quantity of hours. NEAREST_* rounds to the
 * closest step; CEIL_* always rounds up. NONE returns the value unchanged.
 */
export function applyRounding(
  hours: number,
  rule: BillingRoundingRule,
): number {
  if (rule === "NONE" || hours <= 0) return roundHours(hours);
  const stepMinutes: Record<Exclude<BillingRoundingRule, "NONE">, number> = {
    NEAREST_15_MINUTES: 15,
    NEAREST_30_MINUTES: 30,
    NEAREST_HOUR: 60,
    CEIL_15_MINUTES: 15,
    CEIL_30_MINUTES: 30,
    CEIL_HOUR: 60,
  };
  const minutes = hours * 60;
  const step = stepMinutes[rule];
  const isCeil = rule.startsWith("CEIL_");
  const rounded = isCeil
    ? Math.ceil(minutes / step) * step
    : Math.round(minutes / step) * step;
  return roundHours(rounded / 60);
}

/** Average resolved hour rate for the period (0 when there are no hours). */
function averageRate(ctx: BillingEngineContext): number {
  return ctx.approvedHours > 0 ? ctx.hourlyAmount / ctx.approvedHours : 0;
}

function reimbursable(
  config: BillingEngineConfig,
  ctx: BillingEngineContext,
): number {
  if (!config.reimbursableExpenses || ctx.reimbursableExpenseTotal <= 0) return 0;
  const markup = config.reimbursableMarkupPct ?? 0;
  return ctx.reimbursableExpenseTotal * (1 + markup / 100);
}

/**
 * Compute the billable amount for one project in one period, dispatching by the
 * charge model. Returns the billable hours, the subtotal, the final amount and
 * notes explaining the calculation.
 */
export function computeProjectBilling(input: {
  chargeType: BillingChargeType;
  config: BillingEngineConfig;
  context: BillingEngineContext;
}): BillingComputation {
  const { chargeType, config, context } = input;
  const notes: string[] = [];
  const avgRate = averageRate(context);
  const billableHours = applyRounding(context.approvedHours, config.roundingRule);
  if (billableHours !== context.approvedHours) {
    notes.push(
      `Horas arredondadas de ${roundHours(context.approvedHours)} para ${billableHours}.`,
    );
  }
  const hoursAmount = roundCents(avgRate * billableHours);

  let hours = billableHours;
  let subtotal = 0;
  let manual = false;

  switch (chargeType) {
    case "HOURLY":
    case "CONSULTANT_HOURLY": {
      subtotal = hoursAmount;
      break;
    }
    case "TIME_AND_MATERIAL": {
      const expenses = reimbursable(config, context);
      subtotal = hoursAmount + expenses;
      if (expenses > 0) {
        notes.push(`Despesas reembolsáveis incluídas: ${roundCents(expenses)}.`);
      }
      break;
    }
    case "MONTHLY":
    case "FIXED":
    case "SUBSCRIPTION":
    case "PER_PROJECT": {
      subtotal = config.fixedAmount ?? 0;
      hours = config.fixedAmount != null ? 0 : billableHours;
      if (config.fixedAmount == null) {
        manual = true;
        notes.push("Defina o valor fixo no projeto para faturar este modelo.");
      }
      break;
    }
    case "HOURLY_PLUS_FIXED": {
      const base = config.fixedAmount ?? 0;
      const included = config.includedHours ?? 0;
      const excessHours = Math.max(0, billableHours - included);
      const excessRate = config.overageRate ?? avgRate;
      subtotal = base + roundCents(excessHours * excessRate);
      notes.push(
        `Base fixa ${base} + ${roundHours(excessHours)}h excedentes × ${excessRate}.`,
      );
      break;
    }
    case "HOUR_PACKAGE": {
      const base = config.fixedAmount ?? 0;
      const included = config.includedHours ?? 0;
      const excessHours = Math.max(0, billableHours - included);
      const excessRate = config.overageRate ?? avgRate;
      switch (config.overageTreatment) {
        case "BILL_EXTRA": {
          subtotal = base + roundCents(excessHours * excessRate);
          if (excessHours > 0) {
            notes.push(
              `Franquia ${included}h + ${roundHours(excessHours)}h excedentes × ${excessRate}.`,
            );
          }
          break;
        }
        case "BLOCK_AT_LIMIT": {
          subtotal = base;
          hours = Math.min(billableHours, included);
          if (excessHours > 0) {
            notes.push(`${roundHours(excessHours)}h excedentes bloqueadas (não faturadas).`);
          }
          break;
        }
        case "INCLUDE_FREE": {
          subtotal = base;
          if (excessHours > 0) {
            notes.push(`${roundHours(excessHours)}h excedentes incluídas sem custo.`);
          }
          break;
        }
        case "CARRY_OVER": {
          subtotal = base;
          if (excessHours > 0) {
            notes.push(
              `${roundHours(excessHours)}h excedentes acumuladas para o próximo período.`,
            );
          }
          break;
        }
      }
      break;
    }
    case "PER_ALLOCATED_CONSULTANT": {
      const per = config.perConsultantAmount ?? 0;
      subtotal = roundCents(context.allocatedConsultants * per);
      hours = 0;
      notes.push(`${context.allocatedConsultants} consultor(es) × ${per}.`);
      if (config.perConsultantAmount == null) {
        manual = true;
        notes.push("Defina o valor por consultor no projeto.");
      }
      break;
    }
    case "MIXED": {
      subtotal = (config.fixedAmount ?? 0) + hoursAmount;
      notes.push(`Misto: fixo ${config.fixedAmount ?? 0} + horas ${hoursAmount}.`);
      break;
    }
    case "MILESTONE":
    case "PER_SPRINT":
    case "ON_DEMAND":
    case "PAY_AS_YOU_GO":
    case "SUCCESS_FEE": {
      subtotal = config.fixedAmount ?? 0;
      hours = 0;
      manual = true;
      notes.push(
        "Modelo de cobrança manual: confirme o valor do período com o Financeiro.",
      );
      break;
    }
  }

  subtotal = roundCents(subtotal);
  let amount = subtotal;

  // Reajuste: only a fixed percentage is applied automatically. Market indices
  // (IPCA/IGP-M/CDI) are recorded for traceability — no external source here.
  if (config.adjustmentIndex === "FIXED" && config.adjustmentPct) {
    amount = roundCents(amount * (1 + config.adjustmentPct / 100));
    notes.push(`Reajuste fixo de ${config.adjustmentPct}% aplicado.`);
  } else if (config.adjustmentIndex !== "NONE") {
    notes.push(
      `Reajuste ${config.adjustmentIndex} registrado (não aplicado automaticamente).`,
    );
  }

  if (config.discountPct) {
    const discount = roundCents(amount * (config.discountPct / 100));
    amount = roundCents(amount - discount);
    notes.push(`Desconto de ${config.discountPct}% (-${discount}).`);
  }
  if (config.penaltyPct) {
    const penalty = roundCents(amount * (config.penaltyPct / 100));
    amount = roundCents(amount + penalty);
    notes.push(`Multa de ${config.penaltyPct}% (+${penalty}).`);
  }

  return { hours: roundHours(hours), subtotal, amount: roundCents(amount), manual, notes };
}

/** Default config used when a project has no ProjectBillingConfig row. */
export const DEFAULT_BILLING_CONFIG: BillingEngineConfig = {
  roundingRule: "NONE",
  overageTreatment: "BILL_EXTRA",
  reimbursableExpenses: false,
  adjustmentIndex: "NONE",
};
