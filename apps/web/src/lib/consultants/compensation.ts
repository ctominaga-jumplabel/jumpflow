import {
  computeCltCharges,
  type CltChargeResult,
  type CltChargeTables,
} from "./clt-charges";

export interface CompensationInput {
  contractType: "CLT" | "PJ" | "CLT_FLEX";
  hourlyRate?: number | null;
  cltAmount?: number | null;
  pjAmount?: number | null;
  benefitCardAmount?: number | null;
  discountRules?: {
    version: 1;
    fixedDiscounts?: Array<{ label: string; amount: number }>;
    percentDiscounts?: Array<{ label: string; percent: number; base: "CLT" | "PJ" | "TOTAL" }>;
  } | null;
  /**
   * Optional automatic CLT charge calculation. When `autoApplyDeductions` is
   * true, INSS and IRRF computed from `cltAmount` are added to the employee
   * deductions (on top of any manual discountRules). FGTS is never deducted —
   * it stays informational in the result. Only meaningful when there is a CLT
   * portion (CLT or CLT_FLEX). Tables are versionable per competence year.
   */
  cltCharges?: {
    autoApplyDeductions: boolean;
    dependents?: number;
    tables?: CltChargeTables;
  } | null;
}

export interface BenefitInput {
  amount: number;
}

export interface CompensationResult {
  grossAmount: number;
  benefitAmount: number;
  discountAmount: number;
  netAmount: number;
  /**
   * CLT charge breakdown when `cltCharges` is provided (or when there is a CLT
   * portion). `null` for pure-PJ compensations without CLT charges requested.
   * FGTS inside this object is INFORMATIONAL and is not part of `discountAmount`.
   */
  cltCharges: CltChargeResult | null;
}

function baseAmount(input: CompensationInput, base: "CLT" | "PJ" | "TOTAL") {
  const clt = input.cltAmount ?? 0;
  const pj = input.pjAmount ?? input.hourlyRate ?? 0;
  if (base === "CLT") return clt;
  if (base === "PJ") return pj;
  return clt + pj + (input.benefitCardAmount ?? 0);
}

export function computeCompensation(
  compensation: CompensationInput,
  benefits: BenefitInput[],
): CompensationResult {
  const grossAmount =
    (compensation.cltAmount ?? 0) +
    (compensation.pjAmount ?? 0) +
    (compensation.hourlyRate ?? 0);
  const benefitAmount =
    (compensation.benefitCardAmount ?? 0) +
    benefits.reduce((sum, benefit) => sum + benefit.amount, 0);
  const rules = compensation.discountRules;
  const fixed = rules?.fixedDiscounts?.reduce((sum, item) => sum + item.amount, 0) ?? 0;
  const percent =
    rules?.percentDiscounts?.reduce(
      (sum, item) =>
        sum + (baseAmount(compensation, item.base) * item.percent) / 100,
      0,
    ) ?? 0;

  // CLT charges: computed whenever there is a CLT portion AND a CLT charge
  // config is present. INSS/IRRF are added to deductions only when the caller
  // opts in (autoApplyDeductions); FGTS is always informational.
  const cltPortion = compensation.cltAmount ?? 0;
  const cltCharges =
    compensation.cltCharges && cltPortion > 0
      ? computeCltCharges({
          cltAmount: cltPortion,
          dependents: compensation.cltCharges.dependents,
          tables: compensation.cltCharges.tables,
        })
      : null;
  const autoDeductions =
    cltCharges && compensation.cltCharges?.autoApplyDeductions
      ? cltCharges.employeeDeductions
      : 0;

  const discountAmount = fixed + percent + autoDeductions;
  return {
    grossAmount,
    benefitAmount,
    discountAmount,
    netAmount: grossAmount + benefitAmount - discountAmount,
    cltCharges,
  };
}
