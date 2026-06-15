import {
  computeCompensation,
  type BenefitInput,
  type CompensationInput,
} from "@/lib/consultants/compensation";

export interface PaymentLineAmountInput {
  amount: number;
}

export interface ConsultantPaymentAmounts {
  cltNetAmount: number;
  pjAmount: number;
  benefitAmount: number;
  totalAmount: number;
}

export function buildConsultantPaymentAmounts(
  compensation: CompensationInput,
  benefits: BenefitInput[],
  lines: PaymentLineAmountInput[],
): ConsultantPaymentAmounts {
  const lineAmount = lines.reduce((sum, line) => sum + line.amount, 0);
  const base = computeCompensation(compensation, benefits);
  const benefitAmount = base.benefitAmount;

  if (compensation.contractType === "CLT") {
    return {
      cltNetAmount: base.netAmount,
      pjAmount: 0,
      benefitAmount,
      totalAmount: base.netAmount,
    };
  }

  if (compensation.contractType === "CLT_FLEX") {
    const cltOnly = computeCompensation(
      { ...compensation, pjAmount: 0, hourlyRate: 0 },
      benefits,
    );
    const pjAmount =
      compensation.hourlyRate != null && lineAmount > 0
        ? lineAmount
        : (compensation.pjAmount ?? 0);
    return {
      cltNetAmount: cltOnly.netAmount,
      pjAmount,
      benefitAmount,
      totalAmount: cltOnly.netAmount + pjAmount,
    };
  }

  return {
    cltNetAmount: 0,
    pjAmount:
      compensation.hourlyRate != null && lineAmount > 0
        ? lineAmount
        : (compensation.pjAmount ?? 0),
    benefitAmount,
    totalAmount:
      (compensation.hourlyRate != null && lineAmount > 0
        ? lineAmount
        : (compensation.pjAmount ?? 0)) +
      benefitAmount,
  };
}
