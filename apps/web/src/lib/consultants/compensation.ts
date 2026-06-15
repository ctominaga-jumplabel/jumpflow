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
}

export interface BenefitInput {
  amount: number;
}

export interface CompensationResult {
  grossAmount: number;
  benefitAmount: number;
  discountAmount: number;
  netAmount: number;
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
  const discountAmount = fixed + percent;
  return {
    grossAmount,
    benefitAmount,
    discountAmount,
    netAmount: grossAmount + benefitAmount - discountAmount,
  };
}

