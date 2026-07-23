import type { StatusTone } from "@/components/ui/StatusBadge";

/**
 * Shared expense types + pure helpers for the "Despesas" module.
 *
 * Lives outside `mock-data` so the real (database-backed) mode never imports
 * mock modules. `lib/mock-data/expenses.ts` re-exports everything from here,
 * keeping the demo mode working without duplication.
 *
 * Single status chain (mirrors `ExpenseStatus` in the Prisma schema):
 * DRAFT -> SUBMITTED -> MANAGER_APPROVED -> FINANCE_APPROVED ->
 * PAYMENT_SCHEDULED -> PAID, with MANAGER_REJECTED / FINANCE_REJECTED as
 * rejection branches. PAID is the only terminal status.
 */

export const EXPENSE_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "MANAGER_APPROVED",
  "MANAGER_REJECTED",
  "FINANCE_APPROVED",
  "FINANCE_REJECTED",
  "PAYMENT_SCHEDULED",
  "PAID",
] as const;

export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

/**
 * Código do tipo de lançamento (categoria) de uma despesa. Desde o item 12 os
 * tipos vivem no registro `ExpenseType` (banco), gerenciável na tela Política de
 * Reembolso — por isso a categoria é uma STRING (código), não mais um enum
 * fechado. As constantes abaixo são apenas os tipos NATIVOS (seed/fallback de
 * rótulo); a fonte de verdade em runtime é o registro no banco.
 */
export type ExpenseCategory = string;

/** Códigos dos tipos nativos (semeados como `system` no registro ExpenseType). */
export const EXPENSE_CATEGORIES = [
  "MILEAGE_REIMBURSEMENT",
  "AIR_TICKET",
  "BUS_TICKET",
  "CERTIFICATION",
  "ACCOUNTING",
  "RIDE_SHARE",
  "COURSES_TRAINING",
  "LODGING",
  "POSTAGE",
  "MEALS",
  "PERIPHERALS",
  "TOLL",
  "PARKING",
] as const;

/** Rótulos dos tipos nativos — fallback quando o registro não é consultado. */
export const expenseCategoryLabels: Record<string, string> = {
  MILEAGE_REIMBURSEMENT: "Reembolso Quilometragem",
  AIR_TICKET: "Passagem Aérea",
  BUS_TICKET: "Passagem Rodoviária",
  CERTIFICATION: "Certificação",
  ACCOUNTING: "Accountech/Contabilidade",
  RIDE_SHARE: "Transporte/Uber",
  COURSES_TRAINING: "Cursos / Capacitação",
  LODGING: "Hospedagem",
  POSTAGE: "Correio",
  MEALS: "Alimentação",
  PERIPHERALS: "Periféricos",
  TOLL: "Pedágio",
  PARKING: "Estacionamento",
};

/**
 * Opção de tipo de despesa vinda do registro (banco), para dropdowns e mapas de
 * rótulo. Puro (sem import de servidor) para ser reusável no cliente e nos testes.
 */
export interface ExpenseTypeOption {
  code: string;
  label: string;
  active: boolean;
}

/** Whether a code is one of the native (built-in) types. */
export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return (
    typeof value === "string" &&
    (EXPENSE_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * Rótulo de exibição de uma categoria. Resolve pelo mapa do registro (`labels`,
 * passado pela tela quando disponível), caindo para os rótulos nativos e, por
 * fim, para o próprio código — nunca quebra em tipos customizados ou legados.
 */
export function expenseCategoryLabel(
  category?: string | null,
  labels: Record<string, string> = expenseCategoryLabels,
): string {
  if (!category) return "Sem categoria";
  return labels[category] ?? expenseCategoryLabels[category] ?? category;
}

export const expenseStatusLabels: Record<ExpenseStatus, string> = {
  DRAFT: "Rascunho",
  SUBMITTED: "Enviada",
  MANAGER_APPROVED: "Aprovada pelo gestor",
  MANAGER_REJECTED: "Reprovada pelo gestor",
  FINANCE_APPROVED: "Aprovada pelo financeiro",
  FINANCE_REJECTED: "Reprovada pelo financeiro",
  PAYMENT_SCHEDULED: "Pagamento agendado",
  PAID: "Paga",
};

/** Badge tone per status (used by ExpenseStatusBadge). */
export const expenseStatusTones: Record<ExpenseStatus, StatusTone> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  MANAGER_APPROVED: "info",
  MANAGER_REJECTED: "danger",
  FINANCE_APPROVED: "success",
  FINANCE_REJECTED: "danger",
  PAYMENT_SCHEDULED: "warning",
  PAID: "success",
};

/** Statuses the owner may edit/delete/attach to (rework path). */
export const EDITABLE_EXPENSE_STATUSES: readonly ExpenseStatus[] = [
  "DRAFT",
  "MANAGER_REJECTED",
  "FINANCE_REJECTED",
];

export function isExpenseEditable(status: ExpenseStatus): boolean {
  return EDITABLE_EXPENSE_STATUSES.includes(status);
}

export function isExpenseRejected(status: ExpenseStatus): boolean {
  return status === "MANAGER_REJECTED" || status === "FINANCE_REJECTED";
}

/** Receipt metadata shown in the UI (the file lives in object storage). */
export interface ExpenseAttachmentMeta {
  fileName: string;
  contentType: string;
  /** File size in bytes. */
  size: number;
}

/** UI shape of an expense (db rows and demo items share it). */
export interface Expense {
  id: string;
  projectId: string;
  projectName: string;
  clientName: string;
  consultantName: string;
  /** ISO date yyyy-mm-dd of the expense. */
  date: string;
  /** Amount in BRL. */
  amount: number;
  description: string;
  /** Nota fiscal number (optional). */
  invoiceNumber?: string;
  /** Tipo de lançamento. Optional for legacy rows created before categories. */
  category?: ExpenseCategory;
  /** Grouping key shared by items launched together under one NF/lote. */
  groupId?: string;
  attachment?: ExpenseAttachmentMeta;
  status: ExpenseStatus;
  /** ISO datetime when submitted for approval, when applicable. */
  submittedAt?: string;
  /** Comment of the latest REJECTED approval, when rejected. */
  rejectionReason?: string;
  /** Where the item lives: real database row or local demo data. */
  source: "db" | "mock";
}

export interface ExpenseFilter {
  status?: ExpenseStatus | "ALL";
  projectId?: string | "ALL";
  /** Inclusive ISO date range (yyyy-mm-dd). */
  from?: string;
  to?: string;
}

/** Pure filter for the expense list (status, project and date range). */
export function filterExpenses(
  list: Expense[],
  filter: ExpenseFilter,
): Expense[] {
  return list.filter((e) => {
    if (filter.status && filter.status !== "ALL" && e.status !== filter.status) {
      return false;
    }
    if (
      filter.projectId &&
      filter.projectId !== "ALL" &&
      e.projectId !== filter.projectId
    ) {
      return false;
    }
    if (filter.from && e.date < filter.from) return false;
    if (filter.to && e.date > filter.to) return false;
    return true;
  });
}

export interface ExpenseTotals {
  /** Count awaiting a decision (SUBMITTED + MANAGER_APPROVED). */
  awaiting: number;
  /** Count rejected at any stage (rework needed). */
  rejected: number;
  /** FINANCE_APPROVED — approved by finance, payment not scheduled yet. */
  toPay: number;
  toPayAmount: number;
  /** PAYMENT_SCHEDULED. */
  scheduled: number;
  scheduledAmount: number;
  /** PAID. */
  paid: number;
  paidAmount: number;
  /** Sum of all amounts in the provided list (BRL). */
  totalAmount: number;
}

/** Aggregate totals for the summary cards and the financial panel. */
export function summarizeExpenses(list: Expense[]): ExpenseTotals {
  return list.reduce<ExpenseTotals>(
    (acc, e) => {
      acc.totalAmount += e.amount;
      if (e.status === "SUBMITTED" || e.status === "MANAGER_APPROVED") {
        acc.awaiting += 1;
      }
      if (isExpenseRejected(e.status)) acc.rejected += 1;
      if (e.status === "FINANCE_APPROVED") {
        acc.toPay += 1;
        acc.toPayAmount += e.amount;
      }
      if (e.status === "PAYMENT_SCHEDULED") {
        acc.scheduled += 1;
        acc.scheduledAmount += e.amount;
      }
      if (e.status === "PAID") {
        acc.paid += 1;
        acc.paidAmount += e.amount;
      }
      return acc;
    },
    {
      awaiting: 0,
      rejected: 0,
      toPay: 0,
      toPayAmount: 0,
      scheduled: 0,
      scheduledAmount: 0,
      paid: 0,
      paidAmount: 0,
      totalAmount: 0,
    },
  );
}

/** Distinct projects present in the list, for the filter dropdown. */
export function expenseProjects(
  list: Expense[],
): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const e of list) {
    if (!seen.has(e.projectId)) seen.set(e.projectId, e.projectName);
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name }));
}
