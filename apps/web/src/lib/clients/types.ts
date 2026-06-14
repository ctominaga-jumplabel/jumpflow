export type BillingChargeType =
  | "HOURLY"
  | "MONTHLY"
  | "CONSULTANT_HOURLY"
  | "FIXED";

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
  active: boolean;
}

export interface ClientItem {
  id: string;
  name: string;
  document?: string;
  logoUrl?: string;
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
