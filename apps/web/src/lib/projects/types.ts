export type ProjectStatus =
  | "PROPOSAL"
  | "ACTIVE"
  | "PAUSED"
  | "CLOSED"
  | "CANCELLED";
export type ProjectPaymentType =
  | "ONE_TIME"
  | "INSTALLMENTS"
  | "MONTHLY"
  | "ON_MILESTONE";
/**
 * Tipo de oportunidade de origem (espelha o OpportunityType do CRM-Jumplabel).
 * Só preenchido em projetos vindos da ingestão; projetos criados a mão ficam
 * nulos até um perfil comercial classificar manualmente (sobrescrevível).
 */
export type ProjectOpportunityType =
  | "PROJECT"
  | "ALLOCATION"
  | "SQUAD"
  | "LICENSING"
  | "BPO"
  | "SUPPORT"
  | "OTHER";
export type ReceivableStatus = "FORECAST" | "RECEIVED" | "CANCELLED";
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

/**
 * Recebimento previsto do cliente (lado receita — ProjectReceivableSchedule).
 * `amount` é um VALOR DE RECEITA (D1): fica `undefined` (mascarado) para perfis
 * sem permissão comercial/financeira, espelhando `ProjectSaleRateItem.hourlyRate`.
 */
export interface ProjectReceivableItem {
  id: string;
  projectId: string;
  dueAt: string;
  amount?: number;
  label: string;
  status: ReceivableStatus;
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
  overtimeAppliesTo: OvertimeAppliesTo;
  overtimeBillingPct?: number;
  overtimeExcessHours?: number;
  overtimeExcessRate?: number;
  billDuringVacation: boolean;
  notes?: string;
}

export type OvertimeAppliesTo = "NONE" | "CLT" | "PJ" | "BOTH";

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
  /**
   * P4: anexar a planilha de horas por consultor ao e-mail de cobrança da
   * pré-fatura deste projeto. Editado pelo Financeiro. Opcional na borda
   * (mock/otimista); o loader sempre popula com boolean.
   */
  billingAttachHours?: boolean;
  budgetHours?: number;
  costCenter?: string;
  commercialContractRef?: string;
  /** Condição de pagamento do cliente (comercial). Opcional. */
  paymentType?: ProjectPaymentType;
  /**
   * Tipo de oportunidade de origem (do CRM). Classificação informativa do
   * projeto; nula em projetos manuais até ser classificada. Sobrescrevível
   * manualmente por perfil comercial.
   */
  opportunityType?: ProjectOpportunityType;
  /**
   * Flag INFORMATIVA de termo de aceite (não bloqueia lançamento/faturamento).
   * Opcional na borda (mock/otimista); o loader sempre popula com boolean.
   */
  requiresAcceptanceTerm?: boolean;
  /** Quando/por quem o termo foi marcado como aceito (referência solta ao User). */
  acceptanceTermAcceptedAt?: string;
  acceptanceTermAcceptedByUserId?: string;
  /**
   * Recebimentos previstos do cliente (lado receita). Vazio para quem não tem
   * permissão comercial/financeira (mesmo gate dos valores de venda).
   */
  receivables?: ProjectReceivableItem[];
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
  /** Regra de aprovação automática do projeto (undefined = não configurada). */
  autoApprovalRule?: ProjectAutoApprovalRuleItem;
  /**
   * Regras de aprovação automática por consultor. Se houver QUALQUER uma, o
   * projeto entra em modo exclusivo (a regra do projeto deixa de valer).
   * Opcional na borda (mock/otimista); o loader sempre popula com um array.
   */
  autoApprovalConsultantRules?: ProjectConsultantAutoApprovalRuleItem[];
}

export interface ProjectAutoApprovalRuleItem {
  active: boolean;
  weekendEnabled: boolean;
  hoursRangeEnabled: boolean;
  minMinutes: number;
  maxMinutes: number;
}

export interface ProjectConsultantAutoApprovalRuleItem
  extends ProjectAutoApprovalRuleItem {
  id: string;
  consultantId: string;
  consultantName: string;
}

