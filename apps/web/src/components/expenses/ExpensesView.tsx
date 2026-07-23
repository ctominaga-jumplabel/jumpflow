"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Download, ExternalLink, Plus, TriangleAlert, X } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { ExportExcelButton } from "@/components/ui/ExportExcelButton";
import { FilterChip } from "@/components/ui/FilterChip";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { Modal } from "@/components/ui/Modal";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { cn } from "@/lib/utils";
import { focusRingInput } from "@/lib/styles";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  attachReceipt,
  createExpenseBatch as createExpenseBatchAction,
  deleteExpense as deleteExpenseAction,
  getReceiptUrl,
  replaceReceipt,
  submitExpense as submitExpenseAction,
  updateExpense as updateExpenseAction,
} from "@/app/app/despesas/actions";
import { projects as allProjects } from "@/lib/mock-data/projects";
import { expenses as seedExpenses } from "@/lib/mock-data/expenses";
import {
  EXPENSE_CATEGORIES,
  expenseCategoryLabels,
  expenseStatusLabels,
  filterExpenses,
  summarizeExpenses,
  type Expense,
  type ExpenseFilter,
  type ExpenseStatus,
  type ExpenseTypeOption,
} from "@/lib/expenses/types";
import type { PolicyRuleData } from "@/lib/expenses/reimbursement-policy";
import { ExpenseSummaryCards } from "./ExpenseSummaryCards";
import { ExpenseList } from "./ExpenseList";
import {
  ExpenseForm,
  type ExpenseBatchValue,
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

/** How a receipt should be rendered in-page, decided from its content type. */
type ReceiptRenderKind = "image" | "pdf" | "other";

function receiptRenderKind(contentType: string | undefined): ReceiptRenderKind {
  const type = (contentType ?? "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "pdf";
  return "other";
}

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
  /** db mode: regras ATIVAS da Politica de Reembolso (P13, alerta no form). */
  policyRules?: PolicyRuleData[];
  /**
   * Tipos de despesa do registro (item 12). Alimenta os dropdowns e os rótulos.
   * Ausente em demo mode → cai para os tipos nativos.
   */
  expenseTypes?: ExpenseTypeOption[];
}

/** Tipos nativos como opções — fallback para demo mode (sem banco/registro). */
const BUILTIN_EXPENSE_TYPES: ExpenseTypeOption[] = EXPENSE_CATEGORIES.map(
  (code) => ({ code, label: expenseCategoryLabels[code] ?? code, active: true }),
);

/**
 * Despesas module orchestrator. In db mode every mutation goes through the
 * server actions (revalidatePath re-renders the route); demo mode keeps the
 * original local-state behavior with an explicit banner. Every action reports
 * honestly through the feedback live region.
 */
export function ExpensesView(props: ExpensesViewProps) {
  const isDemo = props.mode === "demo";
  const storageAvailable = isDemo ? true : (props.storageAvailable ?? false);
  // Item 12: tipos do registro (ou nativos em demo). Opções ativas para o form,
  // mapa código→rótulo (todos, inclusive inativos) para exibir na lista.
  const allTypes = props.expenseTypes ?? BUILTIN_EXPENSE_TYPES;
  const activeTypeOptions = useMemo(
    () => allTypes.filter((t) => t.active),
    [allTypes],
  );
  const categoryLabels = useMemo(
    () => Object.fromEntries(allTypes.map((t) => [t.code, t.label])),
    [allTypes],
  );
  const [localItems, setLocalItems] = useState<Expense[]>(seedExpenses);
  const [status, setStatus] = useState<ExpenseStatus | "ALL">("ALL");
  const [projectId, setProjectId] = useState<string>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [attachmentOf, setAttachmentOf] = useState<Expense | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  /** Which expense the open preview belongs to (guards stale previews). */
  const [previewExpenseId, setPreviewExpenseId] = useState<string | null>(null);
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

  /**
   * `.xlsx` export (Onda 6) via the shared Relatorios endpoint, carrying the
   * current screen filter. The server recomputes the report scope from the real
   * user (a consultant only ever exports their own expenses), so this href can
   * never widen what is visible.
   */
  function expenseXlsxHref(): string {
    const params = new URLSearchParams();
    if (status !== "ALL") params.set("status", status);
    if (projectId !== "ALL") params.set("projectId", projectId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return `/api/relatorios/despesas/xlsx${qs ? `?${qs}` : ""}`;
  }

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

  /** EDIT submit (single expense). Create goes through handleBatchSubmit. */
  function handleFormSubmit(
    value: ExpenseFormValue,
    mode: ExpenseSubmitMode,
    file: File | null,
  ) {
    const editingId = editing?.id;
    if (!editingId) return;
    if (isDemo) {
      handleFormSubmitDemo(value, mode, file);
      return;
    }
    startTransition(async () => {
      const saved = await updateExpenseAction({ id: editingId, ...value });
      if (!saved.ok) {
        notify("warning", saved.message);
        return;
      }
      const expenseId = saved.data.id;
      const messages: string[] = ["Despesa atualizada"];

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

  /** CREATE submit: one NF/header with several items (each its own receipt). */
  function handleBatchSubmit(value: ExpenseBatchValue, mode: ExpenseSubmitMode) {
    if (isDemo) {
      handleBatchSubmitDemo(value, mode);
      return;
    }
    startTransition(async () => {
      const created = await createExpenseBatchAction({
        projectId: value.projectId,
        description: value.description,
        invoiceNumber: value.invoiceNumber,
        items: value.items.map((it) => ({
          date: it.date,
          amount: it.amount,
          category: it.category,
        })),
      });
      if (!created.ok) {
        notify("warning", created.message);
        return;
      }
      const { ids } = created.data;
      let attached = 0;
      let submitted = 0;
      for (let i = 0; i < ids.length; i += 1) {
        const expenseId = ids[i];
        const file = value.items[i]?.file ?? null;
        if (file && storageAvailable) {
          const formData = new FormData();
          formData.set("expenseId", expenseId);
          formData.set("file", file);
          const result = await attachReceipt(formData);
          if (result.ok) attached += 1;
        }
        if (mode === "SUBMITTED") {
          const result = await submitExpenseAction({ id: expenseId });
          if (result.ok) submitted += 1;
        }
      }
      setFormOpen(false);
      setEditing(null);
      const parts = [`${ids.length} lançamento(s) criado(s)`];
      if (attached > 0) parts.push(`${attached} comprovante(s) anexado(s)`);
      if (mode === "SUBMITTED") parts.push(`${submitted} enviado(s) para aprovação`);
      notify("success", `${parts.join(", ")}.`);
    });
  }

  function handleBatchSubmitDemo(
    value: ExpenseBatchValue,
    mode: ExpenseSubmitMode,
  ) {
    const project = formProjects.find((p) => p.id === value.projectId);
    if (!project) return;
    const groupId = `grp-local-${(idCounter.current += 1)}`;
    const submittedAt =
      mode === "SUBMITTED" ? `${props.today}T12:00:00Z` : undefined;
    const created: Expense[] = value.items.map((it, i) => ({
      id: `exp-local-${idCounter.current}-${i}`,
      projectId: value.projectId,
      projectName: project.name,
      clientName: project.clientName,
      consultantName: props.consultantName,
      date: it.date,
      amount: it.amount,
      description: value.description,
      invoiceNumber: value.invoiceNumber,
      category: it.category,
      groupId,
      attachment: it.file
        ? {
            fileName: it.file.name,
            contentType: it.file.type || "application/octet-stream",
            size: it.file.size,
          }
        : undefined,
      status: mode,
      submittedAt,
      source: "mock",
    }));
    setLocalItems((prev) => [...created, ...prev]);
    setFormOpen(false);
    setEditing(null);
    notify(
      "success",
      mode === "SUBMITTED"
        ? `${created.length} lançamento(s) enviado(s) para aprovação (local).`
        : `${created.length} rascunho(s) salvo(s) localmente.`,
    );
  }

  function handleFormSubmitDemo(
    value: ExpenseFormValue,
    mode: ExpenseSubmitMode,
    file: File | null,
  ) {
    const project = formProjects.find((p) => p.id === value.projectId);
    if (!project || !editing) return;
    const attachment = file
      ? {
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
        }
      : (editing.attachment ?? undefined);

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
              category: value.category,
              attachment,
              status: mode,
              submittedAt:
                mode === "SUBMITTED" ? `${props.today}T12:00:00Z` : undefined,
              rejectionReason: undefined,
            }
          : e,
      ),
    );
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

  /** Open the comprovante modal, always starting with a clean preview. */
  function openAttachment(expense: Expense) {
    setAttachmentOf(expense);
    setReceiptPreviewUrl(null);
    setPreviewExpenseId(null);
  }

  function closeAttachment() {
    setAttachmentOf(null);
    setReceiptPreviewUrl(null);
    setPreviewExpenseId(null);
  }

  function clearPreview() {
    setReceiptPreviewUrl(null);
    setPreviewExpenseId(null);
  }

  function handleViewReceipt(expense: Expense) {
    // Toggle: a second click on the already-open preview hides it.
    if (previewExpenseId === expense.id && receiptPreviewUrl) {
      clearPreview();
      return;
    }
    startTransition(async () => {
      const result = await getReceiptUrl({ expenseId: expense.id });
      if (result.ok) {
        setReceiptPreviewUrl(result.data.url);
        setPreviewExpenseId(expense.id);
      } else {
        notify("warning", result.message);
      }
    });
  }

  function handleDownloadReceipt(expense: Expense) {
    startTransition(async () => {
      const result = await getReceiptUrl({ expenseId: expense.id });
      if (result.ok) {
        const anchor = document.createElement("a");
        anchor.href = result.data.url;
        anchor.download = expense.attachment?.fileName ?? "comprovante";
        anchor.rel = "noopener noreferrer";
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
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
          <div className="flex items-center gap-2">
            {isDemo ? null : <ExportExcelButton href={expenseXlsxHref()} />}
            <ActionButton
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={openNew}
            >
              Nova despesa
            </ActionButton>
          </div>
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
        categoryLabels={categoryLabels}
        onViewAttachment={openAttachment}
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
        policyRules={props.policyRules ?? []}
        expenseTypes={activeTypeOptions}
        categoryLabels={categoryLabels}
        busy={isPending}
        onSubmit={handleFormSubmit}
        onSubmitBatch={handleBatchSubmit}
      />

      <Modal
        open={attachmentOf !== null}
        onClose={closeAttachment}
        title="Comprovante"
        description="Preview e download do anexo da despesa."
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
                (() => {
                  const kind = receiptRenderKind(
                    attachmentOf.attachment.contentType,
                  );
                  const canPreviewInPage = kind !== "other";
                  const previewOpen =
                    previewExpenseId === attachmentOf.id &&
                    receiptPreviewUrl !== null;
                  return (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {canPreviewInPage ? (
                          <ActionButton
                            variant="secondary"
                            size="sm"
                            icon={previewOpen ? X : ExternalLink}
                            disabled={isPending}
                            aria-expanded={previewOpen}
                            onClick={() => handleViewReceipt(attachmentOf)}
                          >
                            {previewOpen ? "Fechar preview" : "Visualizar"}
                          </ActionButton>
                        ) : null}
                        <ActionButton
                          variant="secondary"
                          size="sm"
                          icon={Download}
                          disabled={isPending}
                          onClick={() => handleDownloadReceipt(attachmentOf)}
                        >
                          Baixar
                        </ActionButton>
                      </div>

                      {!canPreviewInPage ? (
                        <p className="rounded-md border border-border bg-surface-muted/50 px-3 py-2 text-xs text-soft">
                          Este tipo de arquivo não pode ser exibido na tela. Use
                          o botão Baixar para abri-lo.
                        </p>
                      ) : null}

                      {previewOpen && receiptPreviewUrl ? (
                        kind === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={receiptPreviewUrl}
                            alt={`Comprovante: ${attachmentOf.attachment.fileName}`}
                            className="max-h-96 w-full rounded-md border border-border bg-surface object-contain"
                          />
                        ) : (
                          <iframe
                            title={`Preview de ${attachmentOf.attachment.fileName}`}
                            src={receiptPreviewUrl}
                            className="h-96 w-full rounded-md border border-border bg-surface"
                          />
                        )
                      ) : null}
                    </div>
                  );
                })()
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
