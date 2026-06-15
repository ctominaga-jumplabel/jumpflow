import type { BillingTypeItem, ClientItem } from "./types";

export const demoBillingTypes: BillingTypeItem[] = [
  {
    id: "bt-hourly",
    name: "Hora por projeto",
    chargeType: "HOURLY",
    roundingRule: "NEAREST_15_MINUTES",
    description: "Cobranca por horas aprovadas no fechamento mensal.",
    active: true,
  },
  {
    id: "bt-monthly",
    name: "Mensalidade",
    chargeType: "MONTHLY",
    roundingRule: "NONE",
    description: "Valor mensal fixo com controle de limite de horas.",
    active: true,
  },
];

export const demoClients: ClientItem[] = [
  {
    id: "cli-atlas",
    name: "Atlas Energia",
    document: "12.345.678/0001-90",
    logoUrl: "",
    billingTypeId: "bt-hourly",
    billingTypeName: "Hora por projeto",
    defaultHourlyRate: 260,
    monthlyFee: undefined,
    hourLimit: 160,
    roundingRule: "NEAREST_15_MINUTES",
    billingDay: 25,
    dueDay: 10,
    invoiceKind: "SERVICE",
    municipality: "Sao Paulo",
    issRate: 2.9,
    taxRules: "Retencao conforme contrato vigente.",
    status: "ACTIVE",
    projectCount: 2,
  },
  {
    id: "cli-nova",
    name: "Nova Retail",
    document: "98.765.432/0001-10",
    logoUrl: "",
    billingTypeId: "bt-monthly",
    billingTypeName: "Mensalidade",
    defaultHourlyRate: undefined,
    monthlyFee: 42000,
    hourLimit: 220,
    roundingRule: "NONE",
    billingDay: 20,
    dueDay: 5,
    invoiceKind: "SERVICE",
    municipality: "Campinas",
    issRate: 3,
    taxRules: "",
    status: "ACTIVE",
    projectCount: 1,
  },
];

