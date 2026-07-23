"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Check,
  ClipboardCheck,
  Download,
  ListChecks,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { ExportExcelButton } from "@/components/ui/ExportExcelButton";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import { formatCurrency, formatHours } from "@/lib/format";
import {
  attachBillableJustificationFile,
  decideHours,
  setEntryBillable,
} from "@/app/app/horas/actions";
import { decideAsFinance, decideAsManager } from "@/app/app/despesas/actions";
import {
  approvalItems as defaultItems,
  approvalStageLabels,
  decidedApprovals,
  filterApprovalsByKind,
  pendingApprovals,
  summarizeApprovals,
  type ApprovalItem,
  type ApprovalKind,
  type ApprovalStatus,
} from "@/lib/mock-data/approvals";
import { ApprovalStatusBadge } from "./ApprovalStatusBadge";
import { ApprovalDecisionPanel } from "./ApprovalDecisionPanel";

type Tab = "PENDING" | "HISTORY";
/** Bulk actions: the two decisions plus REOPEN (decided -> pending again). */
type BulkAction = "APPROVED" | "REJECTED" | "REOPEN";
type KindFilter = ApprovalKind | "ALL";
type StatusFilter = ApprovalStatus | "ALL";

const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "HOURS", label: "Horas" },
  { value: "EXPENSE", label: "Despesas" },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "PENDING", label: "Pendente" },
  { value: "APPROVED", label: "Aprovado" },
  { value: "REJECTED", label: "Reprovado" },
  { value: "AUTO_APPROVED", label: "Auto-aprovado" },
];

interface ApprovalFilters {
  status: StatusFilter;
  client: string;
  project: string;
  consultant: string;
  activity: string;
  startDate: string;
  endDate: string;
}

const emptyFilters: ApprovalFilters = {
  status: "ALL",
  client: "",
  project: "",
  consultant: "",
  activity: "",
  startDate: "",
  endDate: "",
};

function optionValues(items: ApprovalItem[], key: keyof ApprovalItem): string[] {
  return [
    ...new Set(
      items
        .map((item) => item[key])
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/**
 * Optional seed for the filter state, used by deep-links (e.g. the operational
 * closing sends consultant + project + status here). Names must match the queue
 * values exactly (clientName/projectName/consultantName) for the filter to bind.
 */
export interface ApprovalQueueInitialFilters {
  /** Kind tab (Horas/Despesas/Todos); unknown ⇒ "ALL". */
  kind?: KindFilter;
  status?: StatusFilter;
  client?: string;
  project?: string;
  consultant?: string;
  activity?: string;
  startDate?: string;
  endDate?: string;
}

export interface ApprovalQueueProps {
  items?: ApprovalItem[];
  /** Show the "no database" warning banner (demo mode). */
  demoBanner?: boolean;
  /**
   * Seeds the filter state on mount (deep-link). Absent ⇒ current behavior
   * (no filters). Unknown statuses fall back to "ALL".
   */
  initialFilters?: ApprovalQueueInitialFilters;
  /**
   * Scoped client/consultant options (name → id) used to build the CSV export
   * link to the shared Relatorios endpoint. Present only in db mode; when
   * absent (demo) the export button is hidden.
   */
  reportFilterOptions?: {
    clients: { id: string; name: string }[];
    consultants: { id: string; name: string }[];
  };
  /**
   * Whether the current user (gestão/financeiro) may flag "Faturável" per day on
   * HOURS items. Server (setEntryBillable) is the authority; this only shows the
   * control. Absent/false ⇒ no billable toggles.
   */
  canEditBillable?: boolean;
  /**
   * Object storage está configurado, então o anexo opcional da justificativa de
   * não faturável pode ser oferecido no modal. Absent/false ⇒ só o motivo textual.
   */
  billableAttachmentsAvailable?: boolean;
}

const STATUS_VALUES: ReadonlySet<StatusFilter> = new Set(
  STATUS_FILTERS.map((option) => option.value),
);

const KIND_VALUES: ReadonlySet<KindFilter> = new Set(
  KIND_FILTERS.map((option) => option.value),
);

/** Seed the kind tab from a deep-link (unknown ⇒ "ALL"). */
function resolveInitialKind(
  seed: ApprovalQueueInitialFilters | undefined,
): KindFilter {
  return seed?.kind && KIND_VALUES.has(seed.kind) ? seed.kind : "ALL";
}

/** Build the initial filter state from a deep-link seed (falls back to empty). */
function resolveInitialFilters(
  seed: ApprovalQueueInitialFilters | undefined,
): ApprovalFilters {
  if (!seed) return emptyFilters;
  const status =
    seed.status && STATUS_VALUES.has(seed.status) ? seed.status : "ALL";
  return {
    status,
    client: seed.client ?? "",
    project: seed.project ?? "",
    consultant: seed.consultant ?? "",
    activity: seed.activity ?? "",
    startDate: seed.startDate ?? "",
    endDate: seed.endDate ?? "",
  };
}

/**
 * Triage queue: pending items on the left, decision panel on the right.
 *
 * Items with `source: "db"` are decided through the decideHours server action
 * (Approval + AuditEvent in one transaction; the route revalidates after).
 * Items with `source: "mock"` (expenses, or hours without a database) keep the
 * original local behavior with honest "(local)" feedback.
 *
 * Bulk actions work on both tabs: PENDING decides (approve/reject), HISTORY
 * reopens a decided item to the pending queue or switches its decision. CLOSED
 * is terminal and is never surfaced as an approval item (the server also
 * refuses it).
 */
export function ApprovalQueue({
  items: seed = defaultItems,
  demoBanner = false,
  initialFilters,
  reportFilterOptions,
  canEditBillable = false,
  billableAttachmentsAvailable = false,
}: ApprovalQueueProps) {
  // Local decisions apply only to mock items; db items refresh via the server.
  // PENDING here is a reopen (a decided item sent back to the pending queue).
  const [mockDecisions, setMockDecisions] = useState<
    Record<
      string,
      { status: "APPROVED" | "REJECTED" | "PENDING"; comment?: string }
    >
  >({});
  const [tab, setTab] = useState<Tab>("PENDING");
  const [kind, setKind] = useState<KindFilter>(() =>
    resolveInitialKind(initialFilters),
  );
  const [filters, setFilters] = useState<ApprovalFilters>(() =>
    resolveInitialFilters(initialFilters),
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkComment, setBulkComment] = useState("");
  const { feedback, notify } = useFeedback();
  const [isPending, startTransition] = useTransition();

  const items = useMemo(
    () =>
      seed.map((item) => {
        const decision = mockDecisions[item.id];
        return decision && item.source === "mock"
          ? {
              ...item,
              status: decision.status,
              comment: decision.comment || item.comment,
            }
          : item;
      }),
    [seed, mockDecisions],
  );

  const byKind = useMemo(
    () => filterApprovalsByKind(items, kind),
    [items, kind],
  );
  const filterOptions = useMemo(
    () => ({
      clients: optionValues(byKind, "clientName"),
      projects: optionValues(byKind, "projectName"),
      consultants: optionValues(byKind, "consultantName"),
      activities: optionValues(byKind, "activitySummary"),
    }),
    [byKind],
  );
  const filtered = useMemo(
    () =>
      byKind.filter((item) => {
        if (filters.status !== "ALL" && item.status !== filters.status) {
          return false;
        }
        if (filters.client && item.clientName !== filters.client) return false;
        if (filters.project && item.projectName !== filters.project) return false;
        if (filters.consultant && item.consultantName !== filters.consultant) {
          return false;
        }
        if (filters.activity && item.activitySummary !== filters.activity) {
          return false;
        }
        const submittedDate = item.submittedAt.slice(0, 10);
        if (filters.startDate && submittedDate < filters.startDate) return false;
        if (filters.endDate && submittedDate > filters.endDate) return false;
        return true;
      }),
    [byKind, filters],
  );
  // CSV export reuses the shared Relatorios hours endpoint (RBAC + financial
  // masking recomputed server-side). The queue carries client/consultant NAMES,
  // so resolve them to ids via the scoped options; date filters map to the
  // report's period. Null in demo mode (no options ⇒ the button is hidden).
  const csvHref = useMemo<string | null>(() => {
    if (!reportFilterOptions) return null;
    const params = new URLSearchParams();
    if (filters.startDate) params.set("from", filters.startDate);
    if (filters.endDate) params.set("to", filters.endDate);
    if (filters.client) {
      const id = reportFilterOptions.clients.find(
        (c) => c.name === filters.client,
      )?.id;
      if (id) params.set("clientId", id);
    }
    if (filters.consultant) {
      const id = reportFilterOptions.consultants.find(
        (c) => c.name === filters.consultant,
      )?.id;
      if (id) params.set("consultantId", id);
    }
    const qs = params.toString();
    return `/api/relatorios/horas${qs ? `?${qs}` : ""}`;
  }, [reportFilterOptions, filters]);

  // Excel export (Onda 6) of the WHOLE queue the user sees (hours + expenses),
  // via the dedicated /api/aprovacoes/export route. The route rebuilds the same
  // scoped queue server-side and reapplies these filters by NAME (no id
  // resolution needed), so it mirrors the visible list exactly. Hidden in demo.
  const xlsxHref = useMemo<string | null>(() => {
    if (demoBanner) return null;
    const params = new URLSearchParams();
    if (kind !== "ALL") params.set("kind", kind);
    if (filters.status !== "ALL") params.set("status", filters.status);
    if (filters.client) params.set("client", filters.client);
    if (filters.project) params.set("project", filters.project);
    if (filters.consultant) params.set("consultant", filters.consultant);
    if (filters.activity) params.set("activity", filters.activity);
    if (filters.startDate) params.set("from", filters.startDate);
    if (filters.endDate) params.set("to", filters.endDate);
    const qs = params.toString();
    return `/api/aprovacoes/export${qs ? `?${qs}` : ""}`;
  }, [demoBanner, kind, filters]);

  const counts = useMemo(() => summarizeApprovals(filtered), [filtered]);
  const pending = useMemo(() => pendingApprovals(filtered), [filtered]);
  const history = useMemo(() => decidedApprovals(filtered), [filtered]);

  const [selectedId, setSelectedId] = useState<string | null>(
    pendingApprovals(seed)[0]?.id ?? null,
  );

  const list = tab === "PENDING" ? pending : history;
  const selected = list.find((i) => i.id === selectedId) ?? list[0] ?? null;
  const activeId = selected?.id ?? null;
  // Bulk selection follows the active tab: PENDING -> decide; HISTORY
  // (Aprovados/Reprovados) -> reopen or switch the decision.
  const selectedItems = selectedIds
    .map((id) => list.find((item) => item.id === id))
    .filter((item): item is ApprovalItem => Boolean(item));

  function selectNextPending(decidedId: string) {
    const remaining = pending.filter((i) => i.id !== decidedId);
    setSelectedId(remaining[0]?.id ?? null);
  }

  function switchTab(next: Tab) {
    // Selections never carry across tabs (a pending pick must not become a
    // reopen target by accident, and vice-versa).
    setTab(next);
    setSelectedIds([]);
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleAllVisible() {
    const ids = list.map((item) => item.id);
    setSelectedIds((current) =>
      ids.every((id) => current.includes(id))
        ? current.filter((id) => !ids.includes(id))
        : [...new Set([...current, ...ids])],
    );
  }

  // A bulk action is the SUBMITTED reopen plus the two decisions. REOPEN maps
  // to decideHours({ decision: "SUBMITTED" }) for db hours and to a local
  // PENDING status for mock items.
  function decideMany(action: BulkAction) {
    const comment = bulkComment.trim();
    if (action === "REJECTED" && comment.length === 0) {
      notify("warning", "Informe uma justificativa para reprovar em massa.");
      return;
    }
    if (selectedItems.length === 0) {
      notify("info", "Selecione ao menos um item.");
      return;
    }

    const decision = action === "REOPEN" ? "SUBMITTED" : action;

    startTransition(async () => {
      const successfulIds = new Set<string>();
      const errors: string[] = [];
      const hourItems = selectedItems.filter(
        (item) => item.source === "db" && item.type === "HOURS",
      );
      const hourEntryIds = hourItems.flatMap((item) => item.entryIds ?? []);
      let decided = 0;
      let alreadyDecided = 0;

      if (hourEntryIds.length > 0) {
        const result = await decideHours({
          entryIds: hourEntryIds,
          decision,
          comment,
        });
        if (!result.ok) {
          errors.push(result.message);
        } else {
          decided += result.data.decided;
          alreadyDecided += result.data.alreadyDecided;
          for (const item of hourItems) successfulIds.add(item.id);
        }
      }

      // Expenses run their own two-stage chain and have no reopen; only
      // decisions route through the expense actions.
      const expenseItems = selectedItems.filter(
        (item) =>
          item.source === "db" && item.type === "EXPENSE" && item.expenseId,
      );
      if (action === "REOPEN" && expenseItems.length > 0) {
        errors.push("Reabertura não disponível para despesas.");
      } else {
        for (const item of expenseItems) {
          const decideExpense =
            item.stage === "FINANCE" ? decideAsFinance : decideAsManager;
          const result = await decideExpense({
            expenseId: item.expenseId!,
            decision: decision as "APPROVED" | "REJECTED",
            comment,
          });
          if (!result.ok) {
            errors.push(result.message);
            continue;
          }
          decided += 1;
          successfulIds.add(item.id);
        }
      }

      const mockIds = selectedItems
        .filter((item) => item.source === "mock")
        .map((item) => item.id);
      if (mockIds.length > 0) {
        const mockStatus = action === "REOPEN" ? "PENDING" : action;
        setMockDecisions((current) => {
          const next = { ...current };
          for (const id of mockIds) {
            next[id] = { status: mockStatus, comment: comment || undefined };
          }
          return next;
        });
        decided += mockIds.length;
        for (const id of mockIds) successfulIds.add(id);
      }

      setSelectedIds((current) => current.filter((id) => !successfulIds.has(id)));
      setBulkComment("");
      const nextPending = pending.filter((item) => !successfulIds.has(item.id));
      setSelectedId(nextPending[0]?.id ?? null);
      const suffix =
        alreadyDecided > 0 ? ` ${alreadyDecided} já processado(s).` : "";
      if (errors.length > 0) {
        notify(
          "warning",
          `${decided} item(ns) aplicado(s). ${errors.length} falha(s): ${errors[0]}`,
        );
        return;
      }
      const verb =
        action === "APPROVED"
          ? "aprovado(s)"
          : action === "REJECTED"
            ? "reprovado(s) com justificativa"
            : "reaberto(s) para a fila pendente";
      notify(
        action === "REJECTED" ? "info" : "success",
        `${decided} item(ns) ${verb}.${suffix}`,
      );
    });
  }

  function decide(id: string, status: "APPROVED" | "REJECTED", comment: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    if (item.source === "db" && item.type === "EXPENSE" && item.expenseId) {
      // Two-stage chain: the stage label tells which action decides the item.
      const decideExpense =
        item.stage === "FINANCE" ? decideAsFinance : decideAsManager;
      const expenseId = item.expenseId;
      const stageLabel = approvalStageLabels[item.stage ?? "MANAGER"];
      startTransition(async () => {
        const result = await decideExpense({
          expenseId,
          decision: status,
          comment,
        });
        if (!result.ok) {
          notify("warning", result.message);
          return;
        }
        notify(
          status === "APPROVED" ? "success" : "info",
          status === "APPROVED"
            ? `Despesa aprovada na etapa ${stageLabel}.`
            : `Despesa reprovada na etapa ${stageLabel} com justificativa.`,
        );
        selectNextPending(id);
      });
      return;
    }

    if (item.source === "db" && item.entryIds && item.entryIds.length > 0) {
      const entryIds = item.entryIds;
      startTransition(async () => {
        const result = await decideHours({ entryIds, decision: status, comment });
        if (!result.ok) {
          notify("warning", result.message);
          return;
        }
        const { decided, alreadyDecided } = result.data;
        if (decided === 0) {
          notify(
            "info",
            "Nenhum lançamento decidido: já havia(m) sido decidido(s) por outro aprovador.",
          );
        } else {
          const suffix =
            alreadyDecided > 0
              ? ` ${alreadyDecided} já havia(m) sido decidido(s).`
              : "";
          notify(
            status === "APPROVED" ? "success" : "info",
            status === "APPROVED"
              ? `${decided} lançamento(s) aprovado(s).${suffix}`
              : `${decided} lançamento(s) reprovado(s) com justificativa.${suffix}`,
          );
        }
        selectNextPending(id);
      });
      return;
    }

    setMockDecisions((prev) => ({
      ...prev,
      [id]: { status, comment: comment || undefined },
    }));
    selectNextPending(id);
    notify(
      status === "APPROVED" ? "success" : "info",
      status === "APPROVED"
        ? "Item aprovado (local). Nada é persistido sem banco configurado."
        : "Item reprovado com justificativa (local).",
    );
  }

  /**
   * Define "Faturável" de UM lançamento (por dia). Autorização/regra vivem no
   * servidor (setEntryBillable); ao marcar NÃO faturável com anexo, sobe o
   * comprovante APÓS a mudança (mesmo padrão do apontamento). A rota revalida no
   * servidor, então a lista reflete o novo estado.
   */
  function setBillable(
    entryId: string,
    billable: boolean,
    reason: string,
    file?: File,
  ) {
    startTransition(async () => {
      const result = await setEntryBillable({
        entryId,
        billable,
        nonBillableReason: reason || undefined,
      });
      if (!result.ok) {
        notify("warning", result.message);
        return;
      }
      if (!billable && file) {
        const formData = new FormData();
        formData.set("id", entryId);
        formData.set("file", file);
        const upload = await attachBillableJustificationFile(formData);
        if (!upload.ok) {
          notify(
            "warning",
            `Dia marcado como não faturável, mas o anexo falhou: ${upload.message}`,
          );
          return;
        }
      }
      notify(
        billable ? "success" : "info",
        billable
          ? "Dia marcado como faturável."
          : "Dia marcado como não faturável com justificativa.",
      );
    });
  }

  return (
    <div className="space-y-4">
      {demoBanner ? (
        <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          <span>
            Modo demonstração: banco não configurado. Nada será persistido.
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="warning">{counts.pending} pendentes</StatusBadge>
        <StatusBadge tone="success">{counts.approved} aprovadas</StatusBadge>
        <StatusBadge tone="danger">{counts.rejected} reprovadas</StatusBadge>
        <StatusBadge tone="info">{counts.automatic} automáticas</StatusBadge>
      </div>

      <FeedbackBanner message={feedback} />

      <div className="flex flex-wrap items-center gap-2">
        {KIND_FILTERS.map((f) => (
          <FilterChip
            key={f.value}
            label={f.label}
            active={kind === f.value}
            onClick={() => setKind(f.value)}
          />
        ))}
      </div>

      <SectionPanel
        title="Filtros"
        description="Combine período, status, projeto, consultor e atividade."
      >
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label htmlFor="approval-start" className="mb-1 block text-xs font-semibold text-medium">
              Início
            </label>
            <input
              id="approval-start"
              type="date"
              value={filters.startDate}
              onChange={(event) =>
                setFilters((current) => ({ ...current, startDate: event.target.value }))
              }
              className={cn(
                "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-strong",
                focusRing,
              )}
            />
          </div>
          <div>
            <label htmlFor="approval-end" className="mb-1 block text-xs font-semibold text-medium">
              Fim
            </label>
            <input
              id="approval-end"
              type="date"
              value={filters.endDate}
              onChange={(event) =>
                setFilters((current) => ({ ...current, endDate: event.target.value }))
              }
              className={cn(
                "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-strong",
                focusRing,
              )}
            />
          </div>
          <div>
            <label htmlFor="approval-status" className="mb-1 block text-xs font-semibold text-medium">
              Status
            </label>
            <select
              id="approval-status"
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as StatusFilter,
                }))
              }
              className={cn(
                "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-strong",
                focusRing,
              )}
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="approval-client" className="mb-1 block text-xs font-semibold text-medium">
              Cliente
            </label>
            <select
              id="approval-client"
              value={filters.client}
              onChange={(event) =>
                setFilters((current) => ({ ...current, client: event.target.value }))
              }
              className={cn(
                "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-strong",
                focusRing,
              )}
            >
              <option value="">Todos</option>
              {filterOptions.clients.map((client) => (
                <option key={client} value={client}>
                  {client}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="approval-project" className="mb-1 block text-xs font-semibold text-medium">
              Projeto
            </label>
            <select
              id="approval-project"
              value={filters.project}
              onChange={(event) =>
                setFilters((current) => ({ ...current, project: event.target.value }))
              }
              className={cn(
                "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-strong",
                focusRing,
              )}
            >
              <option value="">Todos</option>
              {filterOptions.projects.map((project) => (
                <option key={project} value={project}>
                  {project}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="approval-consultant" className="mb-1 block text-xs font-semibold text-medium">
              Consultor
            </label>
            <select
              id="approval-consultant"
              value={filters.consultant}
              onChange={(event) =>
                setFilters((current) => ({ ...current, consultant: event.target.value }))
              }
              className={cn(
                "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-strong",
                focusRing,
              )}
            >
              <option value="">Todos</option>
              {filterOptions.consultants.map((consultant) => (
                <option key={consultant} value={consultant}>
                  {consultant}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label htmlFor="approval-activity" className="mb-1 block text-xs font-semibold text-medium">
              Atividade
            </label>
            <select
              id="approval-activity"
              value={filters.activity}
              onChange={(event) =>
                setFilters((current) => ({ ...current, activity: event.target.value }))
              }
              className={cn(
                "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-strong",
                focusRing,
              )}
            >
              <option value="">Todas</option>
              {filterOptions.activities.map((activity) => (
                <option key={activity} value={activity}>
                  {activity}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <ActionButton
              variant="secondary"
              size="sm"
              disabled={
                filters.status === "ALL" &&
                !filters.client &&
                !filters.project &&
                !filters.consultant &&
                !filters.activity &&
                !filters.startDate &&
                !filters.endDate
              }
              onClick={() => setFilters(emptyFilters)}
            >
              Limpar
            </ActionButton>
            {csvHref ? (
              <a
                href={csvHref}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-semibold text-medium hover:bg-surface-muted",
                  focusRing,
                )}
              >
                <Download aria-hidden="true" className="size-3.5" />
                Exportar CSV
              </a>
            ) : null}
            {xlsxHref ? <ExportExcelButton href={xlsxHref} /> : null}
          </div>
        </div>
      </SectionPanel>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <FilterChip
              label="Pendentes"
              count={pending.length}
              active={tab === "PENDING"}
              onClick={() => switchTab("PENDING")}
            />
            <FilterChip
              label="Histórico"
              count={history.length}
              active={tab === "HISTORY"}
              onClick={() => switchTab("HISTORY")}
            />
          </div>

          {list.length > 0 ? (
            <SectionPanel
              title={tab === "PENDING" ? "Decisão em massa" : "Revisão em massa"}
              description={
                tab === "PENDING"
                  ? "A decisão usa as mesmas regras e auditoria do fluxo individual."
                  : "Reabra para a fila ou troque a decisão; cada item gera Approval e auditoria. Itens fechados não podem ser alterados."
              }
              action={
                <StatusBadge tone="info">
                  {selectedItems.length} selecionado(s)
                </StatusBadge>
              }
            >
              <div className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_auto] lg:items-end">
                <div>
                  <label
                    htmlFor="approval-bulk-comment"
                    className="mb-1 block text-xs font-semibold text-medium"
                  >
                    Justificativa de massa
                  </label>
                  <textarea
                    id="approval-bulk-comment"
                    value={bulkComment}
                    onChange={(event) => setBulkComment(event.target.value)}
                    rows={2}
                    placeholder="Obrigatória para reprovar; opcional para aprovar ou reabrir."
                    className={cn(
                      "w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong placeholder:text-soft",
                      focusRing,
                    )}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    variant="secondary"
                    size="sm"
                    icon={ListChecks}
                    disabled={isPending}
                    onClick={toggleAllVisible}
                  >
                    Selecionar visíveis
                  </ActionButton>
                  {tab === "HISTORY" ? (
                    <ActionButton
                      variant="secondary"
                      size="sm"
                      icon={Undo2}
                      disabled={isPending || selectedItems.length === 0}
                      onClick={() => decideMany("REOPEN")}
                    >
                      Reabrir seleção
                    </ActionButton>
                  ) : null}
                  <ActionButton
                    variant="success"
                    size="sm"
                    icon={Check}
                    disabled={isPending || selectedItems.length === 0}
                    onClick={() => decideMany("APPROVED")}
                  >
                    Aprovar seleção
                  </ActionButton>
                  <ActionButton
                    variant="danger"
                    size="sm"
                    icon={X}
                    disabled={isPending || selectedItems.length === 0}
                    onClick={() => decideMany("REJECTED")}
                  >
                    Reprovar seleção
                  </ActionButton>
                </div>
              </div>
            </SectionPanel>
          ) : null}

          <SectionPanel
            id="aprovacoes-fila"
            title={tab === "PENDING" ? "Fila de aprovação" : "Decisões recentes"}
            description={
              tab === "PENDING"
                ? "Lançamentos de horas e despesas aguardando decisão."
                : "Aprovações e reprovações já registradas."
            }
          >
            {list.length === 0 ? (
              <div className="px-5 py-10">
                <EmptyState
                  icon={ClipboardCheck}
                  title={
                    tab === "PENDING"
                      ? "Nenhuma pendência"
                      : "Sem decisões registradas"
                  }
                  description={
                    tab === "PENDING"
                      ? "Tudo em dia: não há itens aguardando aprovação."
                      : "As decisões aparecerão aqui após a primeira aprovação ou reprovação."
                  }
                />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {list.map((item) => {
                  const isActive = item.id === activeId;
                  const isExpense = item.type === "EXPENSE";
                  const isSelected = selectedIds.includes(item.id);
                  return (
                    <li key={item.id}>
                      <div className="flex items-start">
                        <label className="flex h-full px-5 py-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelected(item.id)}
                            aria-label={`Selecionar ${item.consultantName}`}
                            className="size-4 rounded border-border text-brand focus:ring-brand"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setSelectedId(item.id)}
                          aria-pressed={isActive}
                          className={cn(
                            "flex min-w-0 flex-1 items-start gap-3 py-3.5 pr-5 text-left transition-colors",
                            focusRing,
                            isActive
                              ? "bg-brand-soft/50"
                              : "hover:bg-surface-muted/60",
                          )}
                        >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-strong">
                              {item.consultantName}
                            </p>
                            <StatusBadge tone={isExpense ? "warning" : "info"}>
                              {isExpense ? "Despesa" : "Horas"}
                            </StatusBadge>
                            {isExpense && item.stage ? (
                              <StatusBadge tone="neutral">
                                Etapa: {approvalStageLabels[item.stage]}
                              </StatusBadge>
                            ) : null}
                            {!demoBanner && item.source === "mock" ? (
                              // Mixed queue: flag fictitious items so decisions
                              // on real data are never confused with demo ones.
                              <StatusBadge tone="neutral">Demo</StatusBadge>
                            ) : null}
                          </div>
                          <p className="truncate text-xs text-soft">
                            {item.projectName} · {item.clientName} ·{" "}
                            {item.period}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-xs font-semibold tabular-nums text-medium">
                            {isExpense
                              ? formatCurrency(item.amount ?? 0)
                              : formatHours(item.hours)}
                          </span>
                          <ApprovalStatusBadge status={item.status} />
                        </div>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionPanel>
        </div>

        <ApprovalDecisionPanel
          item={selected}
          busy={isPending}
          onApprove={(id, comment) => decide(id, "APPROVED", comment)}
          onReject={(id, comment) => decide(id, "REJECTED", comment)}
          canEditBillable={canEditBillable}
          attachmentsAvailable={billableAttachmentsAvailable}
          onSetBillable={setBillable}
        />
      </div>
    </div>
  );
}
