export type ProjectStatus = "PROPOSAL" | "ACTIVE" | "PAUSED" | "CLOSED";
export type AllocationStatus =
  | "ACTIVE"
  | "PLANNED"
  | "ENDED"
  | "CANCELLED"
  | "INACTIVE";
export type SkillLevel = "BASIC" | "INTERMEDIATE" | "ADVANCED" | "SPECIALIST";

export interface ProjectSkillOption {
  id: string;
  name: string;
  category?: string;
}

export interface ProjectAllocationSkillItem {
  id: string;
  allocationId: string;
  skillId: string;
  skillName: string;
  skillCategory?: string;
  level?: SkillLevel;
  note?: string;
}

export interface ProjectClientOption {
  id: string;
  name: string;
}

export interface ProjectConsultantOption {
  id: string;
  name: string;
}

export interface ProjectManagerOption {
  id: string;
  name: string;
}

export interface ProjectBillingTypeOption {
  id: string;
  name: string;
  chargeType: string;
}

export interface ProjectAllocationItem {
  id: string;
  projectId: string;
  consultantId: string;
  consultantName: string;
  role: string;
  allocationPercent: number;
  startDate: string;
  endDate?: string;
  status: AllocationStatus;
  skills: ProjectAllocationSkillItem[];
}

export interface ProjectSaleRateItem {
  id: string;
  projectId: string;
  consultantId?: string;
  consultantName?: string;
  allocationId?: string;
  allocationLabel?: string;
  startsAt: string;
  endsAt?: string;
  hourlyRate?: number;
  currency: string;
  note?: string;
}

export type BillingPeriodicity = "MONTHLY" | "BIWEEKLY" | "WEEKLY" | "PER_EVENT";
export type BillingRoundingRule =
  | "NONE"
  | "NEAREST_15_MINUTES"
  | "NEAREST_30_MINUTES"
  | "NEAREST_HOUR"
  | "CEIL_15_MINUTES"
  | "CEIL_30_MINUTES"
  | "CEIL_HOUR";
export type OverageTreatment =
  | "BILL_EXTRA"
  | "BLOCK_AT_LIMIT"
  | "INCLUDE_FREE"
  | "CARRY_OVER";
export type AdjustmentIndex = "NONE" | "IPCA" | "IGPM" | "CDI" | "FIXED";

export interface ProjectBillingConfigItem {
  periodicity: BillingPeriodicity;
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
  withholdIss: boolean;
  withholdingPct?: number;
  closingDay?: number;
  dueDay?: number;
  requireApproval: boolean;
  notes?: string;
}

export interface ProjectItem {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  managerUserId?: string;
  managerName?: string;
  startDate: string;
  endDate?: string;
  billingTypeId?: string;
  billingTypeName?: string;
  billingChargeType?: string;
  billingConfig?: ProjectBillingConfigItem;
  billingHourlyRate?: number;
  budgetHours?: number;
  costCenter?: string;
  consumedHours: number;
  allocatedConsultants: number;
  allocations: ProjectAllocationItem[];
  saleRates: ProjectSaleRateItem[];
  /**
   * Presence flags for the per-area pending queues. These are non-sensitive
   * booleans (not values), so they are always populated — even when commercial
   * values are masked for the current role — letting Operação surface "sem
   * valor de venda" / "sem regra de cobrança" without exposing the amounts.
   * - `hasActiveSaleRate`: a project-level sale rate (no consultant/allocation)
   *   is currently in effect.
   * - `hasBillingConfig`: a billing rule (ProjectBillingConfig) exists.
   */
  hasActiveSaleRate: boolean;
  hasBillingConfig: boolean;
}

