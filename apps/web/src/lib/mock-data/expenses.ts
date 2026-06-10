import type {
  Expense,
  ExpenseAttachmentMeta,
  ExpenseStatus,
} from "@/lib/expenses/types";

/**
 * Demo data for the "Despesas" module — used ONLY when no database is
 * configured (demo mode banner visible). Types and pure helpers moved to
 * `lib/expenses/types.ts` (single source for db + demo); this module
 * re-exports them so existing imports keep working.
 *
 * Every item is flagged `source: "mock"` so a mixed context (e.g. the
 * approvals queue) can badge fictitious data as "Demo".
 */

export type {
  Expense,
  ExpenseAttachmentMeta,
  ExpenseFilter,
  ExpenseStatus,
  ExpenseTotals,
} from "@/lib/expenses/types";
export {
  expenseProjects,
  expenseStatusLabels,
  filterExpenses,
  isExpenseEditable,
  summarizeExpenses,
} from "@/lib/expenses/types";

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
    attachment: {
      fileName: "corrida-atlas.pdf",
      contentType: "application/pdf",
      size: 142 * 1024,
    },
    status: "SUBMITTED",
    submittedAt: "2026-06-04T13:10:00Z",
    source: "mock",
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
    attachment: {
      fileName: "almoco-orion.jpg",
      contentType: "image/jpeg",
      size: 980 * 1024,
    },
    status: "PAYMENT_SCHEDULED",
    submittedAt: "2026-05-29T09:00:00Z",
    source: "mock",
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
    attachment: {
      fileName: "estacionamento.pdf",
      contentType: "application/pdf",
      size: 88 * 1024,
    },
    status: "PAID",
    submittedAt: "2026-05-21T17:45:00Z",
    source: "mock",
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
    attachment: {
      fileName: "hotel-atlas.pdf",
      contentType: "application/pdf",
      size: 210 * 1024,
    },
    status: "MANAGER_REJECTED",
    submittedAt: "2026-05-16T11:20:00Z",
    rejectionReason: "Falta o comprovante fiscal detalhado; reenviar com a NF.",
    source: "mock",
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
    source: "mock",
  },
  {
    id: "exp-6",
    projectId: "prj-vega",
    projectName: "Vega",
    clientName: "Loja Norte",
    consultantName: "Marina Alves",
    date: "2026-06-01",
    amount: 412.3,
    description: "Passagem rodoviária para visita à loja matriz.",
    invoiceNumber: "NF-20011",
    status: "FINANCE_APPROVED",
    submittedAt: "2026-06-02T08:30:00Z",
    source: "mock",
  },
];

export interface NewExpenseInput {
  projectId: string;
  date: string;
  amount: number;
  description: string;
  invoiceNumber?: string;
  attachment?: ExpenseAttachmentMeta;
}

/**
 * Build a new local (unpersisted) expense for the demo mode. The caller
 * supplies the consultant name (current user) and resolves the project label.
 * `status` lets the form save a draft or submit in one step.
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
    submittedAt:
      context.status === "SUBMITTED" ? context.submittedAt : undefined,
    source: "mock",
  };
}
