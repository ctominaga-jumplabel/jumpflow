"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { ExternalLink, Plus, TriangleAlert } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { FilterChip } from "@/components/ui/FilterChip";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { Modal } from "@/components/ui/Modal";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { cn } from "@/lib/utils";
import { focusRingInput } from "@/lib/styles";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  attachReceipt,
  createExpense as createExpenseAction,
  deleteExpense as deleteExpenseAction,
  getReceiptUrl,
  replaceReceipt,
  submitExpense as submitExpenseAction,
  updateExpense as updateExpenseAction,
} from "@/app/app/despesas/actions";
import { projects as allProjects } from "@/lib/mock-data/projects";
import {
  createExpense as createMockExpense,
  expenses as seedExpenses,
} from "@/lib/mock-data/expenses";
import {
  expenseStatusLabels,
  filterExpenses,
  summarizeExpenses,
  type Expense,
  type ExpenseFilter,
  type ExpenseStatus,
} from "@/lib/expenses/types";
import { ExpenseSummaryCards } from "./ExpenseSummaryCards";
import { ExpenseList } from "./ExpenseList";
import {
  ExpenseForm,
  type ExpenseFormProject,
  type ExpenseFormValue,
  type ExpenseSubmitMode,
} from "./ExpenseForm";

const STATUS_FILTERS: (ExpenseStatus | "ALL")[] = [
  "ALL",
  "DRAFT",
  "SUBMITTED",
  "MANAGER_APPROVED",
  "FINANCE_APPROVED",
  "MANAGER_REJECTED",
  "FINANCE_REJECTED",
  "PAYMENT_SCHEDULED",
  "PAID",
];

const statusFilterLabel = (status: ExpenseStatus | "ALL") =>
  status === "ALL" ? "Todas" : expenseStatusLabels[status];

/** Demo-mode projects a consultant may log expenses to (not closed). */
const demoProjects: ExpenseFormProject[] = allProjects
  .filter((p) => p.status !== "CLOSED")
  .map((p) => ({ id: p.id, name: p.name, clientName: p.client.name }));

export interface ExpensesViewProps {
  /**
   * "demo": no database configured — all mutations stay in local state.
   * "db": data comes from Prisma and mutations call the server actions.
   */
  mode: "demo" | "db";
  consultantName: string;
  /** Today's date (yyyy-mm-dd), resolved on the server for determinism. */
  today: string;
  /** db mode: the consultant's expenses loaded on the server. */
  expenses?: Expense[];
  /** db mode: projects with an ACTIVE allocation (server-resolved). */
  projects?: ExpenseFormProject[];
  /** db mode: whether the receipt storage is configured. */
  storageAvailable?: boolean;
}

/**
 * Despesas module orchestrator. In db mode every mutation goes through the
 * server actions (revalidatePath re-renders the route); demo mode keeps the
 * original local-state behavior with an explicit banner. Every action reports
 * honestly through the feedback live region.
 */
export function ExpensesView(props: ExpensesViewProps) {
  const isDemo = props.mode === "demo";
  const storageAvailable = isDemo ? true : (props.storageAvailable ?? false);
  const [localItems, setLocalItems] = useState<Expense[]>(seedExpenses);
  const [status, setStatus] = useState<ExpenseStatus | "ALL">("ALL");
  const [projectId, setProjectId] = useState<string>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [attachmentOf, setAttachmentOf] = useState<Expense | null>(null);
  const { feedback, notify } = useFeedback();
  const [isPending, startTransition] = useTransition();
  const idCounter = useRef(0);

  const dbItems = props.expenses;
  const items = useMemo(
    () => (isDemo ? localItems : (dbItems ?? [])),
    [isDemo, localItems, dbItems],
  );
  const formProjects = isDemo ? demoProjects : (props.projects ?? []);

  const filter: ExpenseFilter = useMemo(
    () => ({ status, projectId, from: from || undefined, to: to || undefined }),
    [status, projectId, from, to],
  );

  const filtered = useMemo(() => filterExpenses(items, filter), [items, filter]);
  const totals = useMemo(() => summarizeExpenses(filtered), [filtered]);

  const projectOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of items) {
      if (!seen.has(e.projectId)) seen.set(e.projectId, e.projectName);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [items]);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(expense: Expense) {
    setEditing(expense);
    setFormOpen(true);
  }

  function handleFormSubmit(
    value: ExpenseFormValue,
    mode: ExpenseSubmitMode,
    file: File | null,
  ) {
    if (isDemo) {
      handleFormSubmitDemo(value, mode, file);
      return;
    }
    const editingId = editing?.id ?? null;
    startTransition(async () => {
      const saved = editingId
        ? await updateExpenseAction({ id: editingId, ...value })
        : await createExpenseAction(value);
      if (!saved.ok) {
        notify("warning", saved.message);
        return;
      }
      const expenseId = saved.data.id;
      const messages: string[] = [
        editingId ? "Despesa atualizada" : "Despesa criada",
      ];

      if (file && storageAvailable) {
        const formData = new FormData();
        formData.set("expenseId", expenseId);
        formData.set("file", file);
        const hadAttachment = Boolean(editing?.attachment);
        const attached = hadAttachment
          ? await replaceReceipt(formData)
          : await attachReceipt(formData);
        if (attached.ok) {
          messages.push("comprovante anexado");
        } else {
          notify(
            "warning",
            `Despesa salva, mas o comprovante falhou: ${attached.message}`,
          );
          setFormOpen(false);
          setEditing(null);
          return;
        }
      }

      if (mode === "SUBMITTED") {
        const submitted = await submitExpenseAction({ id: expenseId });
        if (submitted.ok) {
          messages.push("enviada para aprovação");
        } else {
          notify("warning", `Despesa salva, mas não enviada: ${submitted.message}`);
          setFormOpen(false);
          setEditing(null);
          return;
        }
      }

      setFormOpen(false);
      setEditing(null);
      notify("success", `${messages.join(", ")}.`);
    });
  }

  function handleFormSubmitDemo(
    value: ExpenseFormValue,
    mode: ExpenseSubmitMode,
    file: File | null,
  ) {
    const project = formProjects.find((p) => p.id === value.projectId);
    if (!project) return;
    const attachment = file
      ? {
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
        }
      : (editing?.attachment ?? undefined);

    if (editing) {
      const editingId = editing.id;
      setLocalItems((prev) =>
        prev.map((e) =>
          e.id === editingId
            ? {
                ...e,
                ...value,
                projectName: project.name,
                clientName: project.clientName,
                invoiceNumber: value.invoiceNumber,
                attachment,
                status: mode,
                submittedAt:
                  mode === "SUBMITTED" ? `${props.today}T12:00:00Z` : undefined,
                rejectionReason: undefined,
              }
            : e,
        ),
      );
    } else {
      idCounter.current += 1;
      const expense = createMockExpense(
        { ...value, attachment },
        {
          id: `exp-local-${idCounter.current}-${value.projectId}`,
          projectName: project.name,
          clientName: project.clientName,
          consultantName: props.consultantName,
          status: mode,
          submittedAt:
            mode === "SUBMITTED" ? `${props.today}T12:00:00Z` : undefined,
        },
      );
      setLocalItems((prev) => [expense, ...prev]);
    }
    setFormOpen(false);
    setEditing(null);
    notify(
      "success",
      mode === "SUBMITTED"
        ? `Despesa de ${formatCurrency(value.amount)} enviada para aprovação (local).`
        : `Rascunho de ${formatCurrency(value.amount)} salvo localmente.`,
    );
  }

  function handleDelete(expense: Expense) {
    if (isDemo) {
      setLocalItems((prev) => prev.filter((e) => e.id !== expense.id));
      notify("info", "Despesa excluída (local).");
      return;
    }
    startTransition(async () => {
      const result = await deleteExpenseAction({ id: expense.id });
      if (result.ok) notify("success", "Despesa excluída.");
      else notify("warning", result.message);
    });
  }

  function handleSubmitExpense(expense: Expense) {
    if (isDemo) {
      setLocalItems((prev) =>
        prev.map((e) =>
          e.id === expense.id
            ? {
                ...e,
                status: "SUBMITTED",
                submittedAt: `${props.today}T12:00:00Z`,
              }
            : e,
        ),
      );
      notify("success", "Despesa enviada para aprovação (local).");
      return;
    }
    startTransition(async () => {
      const result = await submitExpenseAction({ id: expense.id });
      if (result.ok) notify("success", "Despesa enviada para aprovação.");
      else notify("warning", result.message);
    });
  }

  function handleViewReceipt(expense: Expense) {
    startTransition(async () => {
      const result = await getReceiptUrl({ expenseId: expense.id });
      if (result.ok) {
        window.open(result.data.url, "_blank", "noopener,noreferrer");
      } else {
        notify("warning", result.message);
      }
    });
  }

  return (
    <div className="space-y-6">
      {isDemo ? (
        <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          <span>
            Modo demonstração: banco não configurado. Nada será persistido.
          </span>
        </div>
      ) : null}

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
            onClick={openNew}
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
        onViewAttachment={setAttachmentOf}
        onEdit={openEdit}
        onDelete={handleDelete}
        onSubmitExpense={handleSubmitExpense}
        busy={isPending}
      />

      <ExpenseForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        projects={formProjects}
        consultantName={props.consultantName}
        defaultDate={props.today}
        initial={editing}
        attachmentUnavailable={!isDemo && !storageAvailable}
        busy={isPending}
        onSubmit={handleFormSubmit}
      />

      <Modal
        open={attachmentOf !== null}
        onClose={() => setAttachmentOf(null)}
        title="Comprovante"
        description="Metadados do anexo da despesa."
      >
        {attachmentOf?.attachment ? (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-soft">Arquivo</dt>
              <dd className="font-medium text-strong">
                {attachmentOf.attachment.fileName}
              </dd>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-soft">Tamanho</dt>
                <dd className="text-medium">
                  {Math.max(1, Math.round(attachmentOf.attachment.size / 1024))}{" "}
                  KB
                </dd>
              </div>
              <div>
                <dt className="text-xs text-soft">Tipo</dt>
                <dd className="text-medium">
                  {attachmentOf.attachment.contentType}
                </dd>
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
            {!isDemo ? (
              storageAvailable ? (
                <ActionButton
                  variant="secondary"
                  size="sm"
                  icon={ExternalLink}
                  disabled={isPending}
                  onClick={() => handleViewReceipt(attachmentOf)}
                >
                  Visualizar
                </ActionButton>
              ) : (
                <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
                  Anexos indisponíveis: storage não configurado.
                </p>
              )
            ) : (
              <p className="rounded-md border border-border bg-surface-muted/50 px-3 py-2 text-xs text-soft">
                Visualização disponível apenas com banco e storage configurados.
              </p>
            )}
          </dl>
        ) : null}
      </Modal>
    </div>
  );
}
