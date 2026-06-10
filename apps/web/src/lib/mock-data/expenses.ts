/**
 * Centralized mock data for the MVP "Despesas" module.
 *
 * NOTE: not connected to the database yet. Shapes mirror the proposed `Expense`
 * entity in docs/backlog-correcoes-e-modulos-consultor.md (EP-DES) so swapping
 * for Prisma later is mechanical: replace the in-memory list + factory below
 * with queries/Server Actions, keep the pure helpers and component contracts.
 *
 * Financial visibility: amounts are operational (consultant sees own), but the
 * PAYMENT status is only mutable by financial roles — enforced on the server
 * (page reads the role and passes `canManagePayments` down). The mock never
 * decides authorization.
 */

export type ExpenseStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "CLOSED";

export type ExpensePaymentStatus =
  | "NOT_SCHEDULED"
  | "SCHEDULED"
  | "PAID"
  | "CANCELLED";

export const expenseStatusLabels: Record<ExpenseStatus, string> = {
  DRAFT: "Rascunho",
  SUBMITTED: "Enviada",
  APPROVED: "Aprovada",
  REJECTED: "Reprovada",
  CLOSED: "Fechada",
};

export const expensePaymentStatusLabels: Record<ExpensePaymentStatus, string> = {
  NOT_SCHEDULED: "Não agendada",
  SCHEDULED: "Agendada",
  PAID: "Paga",
  CANCELLED: "Cancelada",
};

/** Mocked attachment metadata. A real upload swaps this for a stored file ref. */
export interface ExpenseAttachment {
  name: string;
  /** File size in kilobytes (for the metadata display). */
  sizeKb: number;
  /** MIME-ish type label, e.g. "application/pdf". */
  type: string;
}

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
  attachment?: ExpenseAttachment;
  status: ExpenseStatus;
  paymentStatus: ExpensePaymentStatus;
  /** ISO datetime when submitted for approval, when applicable. */
  submittedAt?: string;
  /** Justification — required on rejection. */
  rejectionReason?: string;
}

export const expenses: Expense[] = [
  {
    id: "exp-1",
    projectId: "prj-atlas",
    projectName: "Atlas",
    clientName: "Vix Energia",
    consultantName: "Carlos Nunes",
    date: "2026-06-03",
    amount: 184.9,
    description: "Deslocamento para workshop no cliente (app de transporte).",
    invoiceNumber: "NF-20493",
    attachment: { name: "corrida-atlas.pdf", sizeKb: 142, type: "application/pdf" },
    status: "SUBMITTED",
    paymentStatus: "NOT_SCHEDULED",
    submittedAt: "2026-06-04T13:10:00Z",
  },
  {
    id: "exp-2",
    projectId: "prj-orion",
    projectName: "Órion",
    clientName: "Banco Sul",
    consultantName: "Marina Alves",
    date: "2026-05-28",
    amount: 320,
    description: "Almoço de alinhamento com stakeholders do projeto.",
    invoiceNumber: "NF-19877",
    attachment: { name: "almoco-orion.jpg", sizeKb: 980, type: "image/jpeg" },
    status: "APPROVED",
    paymentStatus: "SCHEDULED",
    submittedAt: "2026-05-29T09:00:00Z",
  },
  {
    id: "exp-3",
    projectId: "prj-vega",
    projectName: "Vega",
    clientName: "Loja Norte",
    consultantName: "Carlos Nunes",
    date: "2026-05-20",
    amount: 56.4,
    description: "Estacionamento durante visita técnica.",
    attachment: { name: "estacionamento.pdf", sizeKb: 88, type: "application/pdf" },
    status: "APPROVED",
    paymentStatus: "PAID",
    submittedAt: "2026-05-21T17:45:00Z",
  },
  {
    id: "exp-4",
    projectId: "prj-atlas",
    projectName: "Atlas",
    clientName: "Vix Energia",
    consultantName: "Pedro Santana",
    date: "2026-05-15",
    amount: 1240,
    description: "Hospedagem (2 diárias) para imersão presencial.",
    invoiceNumber: "NF-18540",
    attachment: { name: "hotel-atlas.pdf", sizeKb: 210, type: "application/pdf" },
    status: "REJECTED",
    paymentStatus: "NOT_SCHEDULED",
    submittedAt: "2026-05-16T11:20:00Z",
    rejectionReason: "Falta o comprovante fiscal detalhado; reenviar com a NF.",
  },
  {
    id: "exp-5",
    projectId: "prj-orion",
    projectName: "Órion",
    clientName: "Banco Sul",
    consultantName: "Rafael Moreira",
    date: "2026-06-08",
    amount: 73.5,
    description: "Material de apoio para oficina de discovery.",
    status: "DRAFT",
    paymentStatus: "NOT_SCHEDULED",
  },
];

export interface NewExpenseInput {
  projectId: string;
  date: string;
  amount: number;
  description: string;
  invoiceNumber?: string;
  attachment?: ExpenseAttachment;
}

/**
 * Build a new local (unpersisted) expense. The caller supplies the consultant
 * name (current user) and resolves the project label. `status` lets the form
 * save a draft or submit in one step.
 */
export function createExpense(
  input: NewExpenseInput,
  context: {
    id: string;
    projectName: string;
    clientName: string;
    consultantName: string;
    status: Extract<ExpenseStatus, "DRAFT" | "SUBMITTED">;
    submittedAt?: string;
  },
): Expense {
  return {
    id: context.id,
    projectId: input.projectId,
    projectName: context.projectName,
    clientName: context.clientName,
    consultantName: context.consultantName,
    date: input.date,
    amount: input.amount,
    description: input.description,
    invoiceNumber: input.invoiceNumber?.trim() || undefined,
    attachment: input.attachment,
    status: context.status,
    paymentStatus: "NOT_SCHEDULED",
    submittedAt: context.status === "SUBMITTED" ? context.submittedAt : undefined,
  };
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
  /** Count of expenses awaiting approval. */
  submitted: number;
  approved: number;
  rejected: number;
  /** Sum of all amounts in the provided list (BRL). */
  totalAmount: number;
  /** Sum of approved (+ closed) amounts — what reaches finance. */
  approvedAmount: number;
  /** Sum of amounts already paid. */
  paidAmount: number;
}

/** Aggregate totals for the summary cards and the financial panel. */
export function summarizeExpenses(list: Expense[]): ExpenseTotals {
  return list.reduce<ExpenseTotals>(
    (acc, e) => {
      acc.totalAmount += e.amount;
      if (e.status === "SUBMITTED") acc.submitted += 1;
      if (e.status === "APPROVED" || e.status === "CLOSED") {
        acc.approved += 1;
        acc.approvedAmount += e.amount;
      }
      if (e.status === "REJECTED") acc.rejected += 1;
      if (e.paymentStatus === "PAID") acc.paidAmount += e.amount;
      return acc;
    },
    {
      submitted: 0,
      approved: 0,
      rejected: 0,
      totalAmount: 0,
      approvedAmount: 0,
      paidAmount: 0,
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
