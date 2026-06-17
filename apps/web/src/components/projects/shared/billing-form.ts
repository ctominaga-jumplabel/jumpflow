import type { ProjectBillingConfigInput } from "@/lib/projects/schemas";
import type { ProjectBillingConfigItem, ProjectItem } from "@/lib/projects/types";

/**
 * Maps a project's persisted billing config into the editable form shape,
 * falling back to sensible defaults when none exists yet (the project is in a
 * partial state — created by Operação, not yet configured by Financeiro).
 */
export function billingConfigToForm(
  project: ProjectItem,
): ProjectBillingConfigInput {
  const c = project.billingConfig;
  return {
    projectId: project.id,
    periodicity: c?.periodicity ?? "MONTHLY",
    roundingRule: c?.roundingRule ?? "NONE",
    fixedAmount: c?.fixedAmount,
    includedHours: c?.includedHours,
    overageRate: c?.overageRate,
    overageTreatment: c?.overageTreatment ?? "BILL_EXTRA",
    perConsultantAmount: c?.perConsultantAmount,
    reimbursableExpenses: c?.reimbursableExpenses ?? false,
    reimbursableMarkupPct: c?.reimbursableMarkupPct,
    discountPct: c?.discountPct,
    penaltyPct: c?.penaltyPct,
    adjustmentIndex: c?.adjustmentIndex ?? "NONE",
    adjustmentPct: c?.adjustmentPct,
    withholdIss: c?.withholdIss ?? false,
    withholdingPct: c?.withholdingPct,
    closingDay: c?.closingDay,
    dueDay: c?.dueDay,
    requireApproval: c?.requireApproval ?? true,
    notes: c?.notes ?? "",
  };
}

/** Projects the form back to the display item (used for optimistic updates). */
export function formToBillingConfigItem(
  form: ProjectBillingConfigInput,
): ProjectBillingConfigItem {
  return {
    periodicity: form.periodicity,
    roundingRule: form.roundingRule,
    fixedAmount: form.fixedAmount,
    includedHours: form.includedHours,
    overageRate: form.overageRate,
    overageTreatment: form.overageTreatment,
    perConsultantAmount: form.perConsultantAmount,
    reimbursableExpenses: form.reimbursableExpenses,
    reimbursableMarkupPct: form.reimbursableMarkupPct,
    discountPct: form.discountPct,
    penaltyPct: form.penaltyPct,
    adjustmentIndex: form.adjustmentIndex,
    adjustmentPct: form.adjustmentPct,
    withholdIss: form.withholdIss,
    withholdingPct: form.withholdingPct,
    closingDay: form.closingDay,
    dueDay: form.dueDay,
    requireApproval: form.requireApproval,
    notes: form.notes,
  };
}
