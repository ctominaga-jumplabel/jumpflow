export type BillingChargeType =
  | "HOURLY"
  | "MONTHLY"
  | "CONSULTANT_HOURLY"
  | "FIXED"
  | "HOURLY_PLUS_FIXED"
  | "HOUR_PACKAGE"
  | "PER_ALLOCATED_CONSULTANT"
  | "PER_PROJECT"
  | "MILESTONE"
  | "PER_SPRINT"
  | "TIME_AND_MATERIAL"
  | "ON_DEMAND"
  | "SUBSCRIPTION"
  | "PAY_AS_YOU_GO"
  | "SUCCESS_FEE"
  | "MIXED";

export type BillingRoundingRule =
  | "NONE"
  | "NEAREST_15_MINUTES"
  | "NEAREST_30_MINUTES"
  | "NEAREST_HOUR"
  | "CEIL_15_MINUTES"
  | "CEIL_30_MINUTES"
  | "CEIL_HOUR";

export type ClientStatus = "ACTIVE" | "INACTIVE";

export type InvoiceKind = "SERVICE" | "PRODUCT";

export interface BillingTypeItem {
  id: string;
  name: string;
  chargeType: BillingChargeType;
  roundingRule: BillingRoundingRule;
  description?: string;
  /** "Como funciona" — descricao curta do modelo de cobranca. */
  howItWorks?: string;
  /** "Exemplo" — exemplo ilustrativo do modelo de cobranca. */
  example?: string;
  active: boolean;
}

export interface ClientItem {
  id: string;
  name: string;
  document?: string;
  /** Contact e-mail used to send the pre-invoice to the client. */
  contactEmail?: string;
  /** Display URL: a signed URL for stored logos, or a plain pass-through URL. */
  logoUrl?: string;
  /** Raw persisted value of the logoUrl column (storage key OR plain URL). */
  logoRef?: string;
  billingTypeId?: string;
  billingTypeName?: string;
  defaultHourlyRate?: number;
  monthlyFee?: number;
  hourLimit?: number;
  roundingRule: BillingRoundingRule;
  billingDay?: number;
  dueDay?: number;
  invoiceKind: InvoiceKind;
  municipality?: string;
  issRate?: number;
  taxRules?: string;
  status: ClientStatus;
  projectCount: number;
}

export interface CnpjLookupResult {
  document: string;
  legalName: string;
  tradeName?: string;
  municipality?: string;
  state?: string;
  provider: string;
  raw?: unknown;
}
