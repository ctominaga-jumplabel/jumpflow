"use client";

import { useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { FilterChip } from "@/components/ui/FilterChip";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { Modal } from "@/components/ui/Modal";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { cn } from "@/lib/utils";
import { focusRingInput } from "@/lib/styles";
import { formatCurrency, formatDate } from "@/lib/format";
import { projects as allProjects } from "@/lib/mock-data/projects";
import {
  createExpense,
  expenses as seedExpenses,
  expenseStatusLabels,
  filterExpenses,
  summarizeExpenses,
  type Expense,
  type ExpenseFilter,
  type ExpensePaymentStatus,
  type ExpenseStatus,
} from "@/lib/mock-data/expenses";
import { ExpenseSummaryCards } from "./ExpenseSummaryCards";
import { ExpenseList } from "./ExpenseList";
import {
  ExpenseForm,
  type ExpenseFormProject,
  type ExpenseSubmitMode,
} from "./ExpenseForm";

const STATUS_FILTERS: (ExpenseStatus | "ALL")[] = [
  "ALL",
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
];

const statusFilterLabel = (status: ExpenseStatus | "ALL") =>
  status === "ALL" ? "Todas" : expenseStatusLabels[status];

/** Projects a consultant may log expenses to (not closed). */
const formProjects: ExpenseFormProject[] = allProjects
  .filter((p) => p.status !== "CLOSED")
  .map((p) => ({ id: p.id, name: p.name, clientName: p.client.name }));

export interface ExpensesViewProps {
  consultantName: string;
  /** Financial roles may change the payment status of approved expenses. */
  canManagePayments: boolean;
  /** Today's date (yyyy-mm-dd), resolved on the server for determinism. */
  today: string;
}

/**
 * Despesas module orchestrator. Holds the expense list in LOCAL state (mock,
 * not persisted) and wires the MVP actions: new expense (draft/submit), filter
 * by status/project/period, view comprovante metadata, and — for financial
 * roles — change the payment status. Every action reports honestly through the
 * feedback live region; nothing fakes a server round-trip.
 */
export function ExpensesView({
  consultantName,
  canManagePayments,
  today,
}: ExpensesViewProps) {
  const [items, setItems] = useState<Expense[]>(seedExpenses);
  const [status, setStatus] = useState<ExpenseStatus | "ALL">("ALL");
  const [projectId, setProjectId] = useState<string>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [attachmentOf, setAttachmentOf] = useState<Expense | null>(null);
  const { feedback, notify } = useFeedback();
  const idCounter = useRef(0);

  const filter: ExpenseFilter = useMemo(
    () => ({ status, projectId, from: from || undefined, to: to || undefined }),
    [status, projectId, from, to],
  );

  const filtered = useMemo(() => filterExpenses(items, filter), [items, filter]);
  const totals = useMemo(() => summarizeExpenses(filtered), [filtered]);

  const projectOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of items) if (!seen.has(e.projectId)) seen.set(e.projectId, e.projectName);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [items]);

  function handleCreate(
    input: Parameters<typeof createExpense>[0],
    mode: ExpenseSubmitMode,
  ) {
    const project = formProjects.find((p) => p.id === input.projectId);
    if (!project) return;
    idCounter.current += 1;
    const expense = createExpense(input, {
      id: `exp-local-${idCounter.current}-${input.projectId}`,
      projectName: project.name,
      clientName: project.clientName,
      consultantName,
      status: mode,
      submittedAt: mode === "SUBMITTED" ? `${today}T12:00:00Z` : undefined,
    });
    setItems((prev) => [expense, ...prev]);
    setFormOpen(false);
    notify(
      "success",
      mode === "SUBMITTED"
        ? `Despesa de ${formatCurrency(expense.amount)} enviada para aprovação (rascunho local).`
        : `Rascunho de ${formatCurrency(expense.amount)} salvo localmente.`,
    );
  }

  function handleChangePayment(id: string, paymentStatus: ExpensePaymentStatus) {
    setItems((prev) =>
      prev.map((e) => (e.id === id ? { ...e, paymentStatus } : e)),
    );
    notify("info", "Status de pagamento atualizado (local).");
  }

  return (
    <div className="space-y-6">
      <ExpenseSummaryCards totals={totals} />

      <FeedbackBanner message={feedback} />

      <SectionPanel
        title="Filtros"
        description="Refine por status, projeto e período."
        action={
          <ActionButton
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setFormOpen(true)}
          >
            Nova despesa
          </ActionButton>
        }
      >
        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map((s) => (
              <FilterChip
                key={s}
                label={statusFilterLabel(s)}
                active={status === s}
                onClick={() => setStatus(s)}
              />
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label
                htmlFor="filter-project"
                className="mb-1 block text-xs font-semibold text-medium"
              >
                Projeto
              </label>
              <select
                id="filter-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={cn(
                  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong",
                  focusRingInput,
                )}
              >
                <option value="ALL">Todos os projetos</option>
                {projectOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="filter-from"
                className="mb-1 block text-xs font-semibold text-medium"
              >
                De
              </label>
              <input
                id="filter-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={cn(
                  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong",
                  focusRingInput,
                )}
              />
            </div>
            <div>
              <label
                htmlFor="filter-to"
                className="mb-1 block text-xs font-semibold text-medium"
              >
                Até
              </label>
              <input
                id="filter-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={cn(
                  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong",
                  focusRingInput,
                )}
              />
            </div>
          </div>
        </div>
      </SectionPanel>

      <ExpenseList
        expenses={filtered}
        canManagePayments={canManagePayments}
        onViewAttachment={setAttachmentOf}
        onChangePayment={handleChangePayment}
      />

      <ExpenseForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        projects={formProjects}
        consultantName={consultantName}
        defaultDate={today}
        onSubmit={handleCreate}
      />

      <Modal
        open={attachmentOf !== null}
        onClose={() => setAttachmentOf(null)}
        title="Comprovante"
        description="Metadados do anexo (visualização mockada no MVP)."
      >
        {attachmentOf?.attachment ? (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-soft">Arquivo</dt>
              <dd className="font-medium text-strong">
                {attachmentOf.attachment.name}
              </dd>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-soft">Tamanho</dt>
                <dd className="text-medium">{attachmentOf.attachment.sizeKb} KB</dd>
              </div>
              <div>
                <dt className="text-xs text-soft">Tipo</dt>
                <dd className="text-medium">{attachmentOf.attachment.type}</dd>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-soft">Despesa</dt>
                <dd className="text-medium">
                  {formatCurrency(attachmentOf.amount)} ·{" "}
                  {formatDate(attachmentOf.date)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-soft">Projeto</dt>
                <dd className="text-medium">{attachmentOf.projectName}</dd>
              </div>
            </div>
            <p className="rounded-md border border-border bg-surface-muted/50 px-3 py-2 text-xs text-soft">
              O download real do comprovante será habilitado quando o upload for
              integrado (Supabase Storage / Vercel Blob).
            </p>
          </dl>
        ) : null}
      </Modal>
    </div>
  );
}
