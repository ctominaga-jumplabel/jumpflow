"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  Check,
  ChevronDown,
  ClipboardCheck,
  Download,
  FileText,
  ListChecks,
  Paperclip,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { ExportExcelButton } from "@/components/ui/ExportExcelButton";
import { Modal } from "@/components/ui/Modal";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { cn } from "@/lib/utils";
import { focusRing, focusRingInput } from "@/lib/styles";
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
  type ApprovalHoursEntry,
  type ApprovalItem,
  type ApprovalKind,
  type ApprovalStatus,
} from "@/lib/mock-data/approvals";
import { ApprovalStatusBadge } from "./ApprovalStatusBadge";

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

/**
 * Pré-checagem client-side do anexo de justificativa (o SERVIDOR é a autoridade):
 * mesma whitelist e teto de 10 MB de Despesas/Horas.
 */
const ATTACH_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp";
const ATTACH_ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
const ATTACH_ACCEPTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
const ATTACH_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function isAcceptedAttachment(file: File): boolean {
  if (file.type) return ATTACH_ACCEPTED_TYPES.includes(file.type);
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  return ATTACH_ACCEPTED_EXTENSIONS.includes(ext);
}

/** Rótulo curto de data (dd/mm) a partir de um ISO yyyy-mm-dd. */
function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** ISO local (yyyy-mm-dd) de uma data — sem passar pelo UTC. */
function toLocalISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Primeiro e último dia do mês corrente (competência vigente) em ISO local. */
function currentMonthRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { startDate: toLocalISODate(first), endDate: toLocalISODate(last) };
}

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
   * Seeds the filter state on mount (deep-link). Absent ⇒ o período começa na
   * competência (mês) vigente (QW-1). Unknown statuses fall back to "ALL".
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
   * não faturável pode ser oferecido no detalhe. Absent/false ⇒ só o motivo textual.
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

/**
 * Build the initial filter state.
 *
 * QW-1: sem deep-link (`initialFilters` ausente), o período começa na
 * competência (mês) vigente para focar o gestor no fechamento atual, sem
 * esconder pendências de forma surpreendente — o botão "Limpar" zera o período.
 *
 * Com deep-link (Fechamento etc.), NUNCA sobrescrevemos o seed: respeitamos
 * exatamente as datas que vieram (mesmo vazias, para mostrar o item alvo
 * independentemente do mês).
 */
function resolveInitialFilters(
  seed: ApprovalQueueInitialFilters | undefined,
): ApprovalFilters {
  if (!seed) {
    const { startDate, endDate } = currentMonthRange();
    return { ...emptyFilters, startDate, endDate };
  }
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
 * Triage queue: full-width list with INLINE decisions per row (approve in one
 * click; reject opens an inline justification field) plus a bulk decision bar.
 * Progressive disclosure (QW-3): each row shows only the essentials and expands
 * on demand to reveal the day/activity breakdown, previous comment and — for
 * gestão on db-backed HOURS — the per-day "Faturável" editor with the optional
 * non-billable justification attachment.
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

  // QW-1 guardrail: o default de "mês vigente" filtra por data de SUBMISSÃO, o
  // que pode esconder pendências submetidas em meses anteriores (ex.: timesheet
  // de julho submetido em 31/jul, aberto em agosto) — e uma fila de aprovação
  // jamais pode esconder trabalho pendente em silêncio. Contamos quantas
  // pendências (mesmos filtros, exceto período) caem FORA do intervalo ativo,
  // para avisar o gestor e oferecer "ver todas". Zero quando não há período.
  const pendingHiddenByDate = useMemo(() => {
    if (!filters.startDate && !filters.endDate) return 0;
    return byKind.filter((item) => {
      if (item.status !== "PENDING") return false;
      if (filters.status !== "ALL" && item.status !== filters.status) return false;
      if (filters.client && item.clientName !== filters.client) return false;
      if (filters.project && item.projectName !== filters.project) return false;
      if (filters.consultant && item.consultantName !== filters.consultant) {
        return false;
      }
      if (filters.activity && item.activitySummary !== filters.activity) {
        return false;
      }
      const submittedDate = item.submittedAt.slice(0, 10);
      const outside =
        (Boolean(filters.startDate) && submittedDate < filters.startDate) ||
        (Boolean(filters.endDate) && submittedDate > filters.endDate);
      return outside;
    }).length;
  }, [byKind, filters]);

  /** Zera apenas o período (mantém os demais filtros) — usado pelo aviso QW-1. */
  function clearPeriod() {
    setFilters((current) => ({ ...current, startDate: "", endDate: "" }));
  }

  const list = tab === "PENDING" ? pending : history;
  // Bulk selection follows the active tab: PENDING -> decide; HISTORY
  // (Aprovados/Reprovados) -> reopen or switch the decision.
  const selectedItems = selectedIds
    .map((id) => list.find((item) => item.id === id))
    .filter((item): item is ApprovalItem => Boolean(item));

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
      });
      return;
    }

    setMockDecisions((prev) => ({
      ...prev,
      [id]: { status, comment: comment || undefined },
    }));
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

        {tab === "PENDING" && pendingHiddenByDate > 0 ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
            <span className="font-medium">
              {pendingHiddenByDate}{" "}
              {pendingHiddenByDate === 1
                ? "pendência está fora"
                : "pendências estão fora"}{" "}
              do período filtrado e não aparece{pendingHiddenByDate === 1 ? "" : "m"} na lista.
            </span>
            <button
              type="button"
              onClick={clearPeriod}
              className={cn(
                "ml-auto font-semibold underline underline-offset-2 hover:no-underline",
                focusRing,
              )}
            >
              Ver todas as pendências
            </button>
          </div>
        ) : null}

        {list.length > 0 ? (
          <SectionPanel
            id="aprovacoes-acoes"
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
              ? "Lançamentos de horas e despesas aguardando decisão. Expanda uma linha para ver o detalhe e decidir."
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
                    ? pendingHiddenByDate > 0
                      ? "Nenhuma pendência no período filtrado — mas há pendências fora dele. Use “Ver todas as pendências” acima."
                      : "Tudo em dia: não há itens aguardando aprovação."
                    : "As decisões aparecerão aqui após a primeira aprovação ou reprovação."
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {list.map((item) => (
                <ApprovalRow
                  key={item.id}
                  item={item}
                  demoBanner={demoBanner}
                  busy={isPending}
                  isSelected={selectedIds.includes(item.id)}
                  onToggleSelected={toggleSelected}
                  canDecide={tab === "PENDING"}
                  onApprove={(id, comment) => decide(id, "APPROVED", comment)}
                  onReject={(id, comment) => decide(id, "REJECTED", comment)}
                  canEditBillable={canEditBillable}
                  attachmentsAvailable={billableAttachmentsAvailable}
                  onSetBillable={setBillable}
                />
              ))}
            </ul>
          )}
        </SectionPanel>
      </div>
    </div>
  );
}

interface ApprovalRowProps {
  item: ApprovalItem;
  demoBanner: boolean;
  busy: boolean;
  isSelected: boolean;
  onToggleSelected: (id: string) => void;
  /** True on the PENDING tab: expose inline Aprovar/Reprovar. */
  canDecide: boolean;
  onApprove: (id: string, comment: string) => void;
  onReject: (id: string, comment: string) => void;
  canEditBillable: boolean;
  attachmentsAvailable: boolean;
  onSetBillable: (
    entryId: string,
    billable: boolean,
    reason: string,
    file?: File,
  ) => void;
}

/**
 * One queue row with inline decision + progressive disclosure (QW-3).
 *
 * - Approve is one click; reject opens an inline justification field (the
 *   justification stays REQUIRED to reject — the server enforces the same rule
 *   for db-backed items).
 * - The detail (day/activity breakdown, previous comment and — for gestão on
 *   db-backed HOURS — the per-day "Faturável" editor with the optional
 *   non-billable attachment) is revealed on demand, keyboard-accessible via a
 *   button with aria-expanded/aria-controls; expanding one row never expands
 *   the others (state is local to the row).
 */
function ApprovalRow({
  item,
  demoBanner,
  busy,
  isSelected,
  onToggleSelected,
  canDecide,
  onApprove,
  onReject,
  canEditBillable,
  attachmentsAvailable,
  onSetBillable,
}: ApprovalRowProps) {
  const [expanded, setExpanded] = useState(false);
  // Inline rejection: the "Reprovar" button reveals this field; confirming
  // without a justification surfaces an inline message (never silently no-ops).
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [rejectError, setRejectError] = useState(false);

  // Modal de justificativa ao marcar um DIA como NÃO faturável (padrão P9:
  // motivo obrigatório + anexo opcional quando há storage). Guarda o dia alvo.
  const [nonBillableEntry, setNonBillableEntry] =
    useState<ApprovalHoursEntry | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const [justificationFile, setJustificationFile] = useState<File | null>(null);
  const [justificationAttachError, setJustificationAttachError] = useState<
    string | null
  >(null);
  const justificationInputRef = useRef<HTMLInputElement>(null);

  const detailId = `approval-detail-${item.id}`;
  const rejectFieldId = `approval-reject-${item.id}`;
  const isExpense = item.type === "EXPENSE";
  const hasEntries = !isExpense && Boolean(item.entries?.length);
  // Marcação de "Faturável" por dia: só para HOURS reais (db), com gestão. Cada
  // lançamento (dia) tem seu próprio toggle; o servidor é a autoridade.
  const billableEntries =
    hasEntries && item.source === "db" && canEditBillable
      ? item.entries!
      : null;

  function handleApprove() {
    onApprove(item.id, "");
  }

  function openReject() {
    setRejectOpen(true);
    setExpanded(true);
  }

  function confirmReject() {
    if (rejectComment.trim().length === 0) {
      setRejectError(true);
      return;
    }
    setRejectError(false);
    onReject(item.id, rejectComment.trim());
    setRejectOpen(false);
    setRejectComment("");
  }

  function cancelReject() {
    setRejectOpen(false);
    setRejectComment("");
    setRejectError(false);
  }

  /** Toggle de "Faturável" de um dia. Marcar NÃO faturável abre o modal de motivo. */
  function toggleEntryBillable(entry: ApprovalHoursEntry, nextBillable: boolean) {
    if (nextBillable) {
      // Voltar a faturável: sem justificativa (limpa motivo no servidor).
      onSetBillable(entry.id, true, "");
      return;
    }
    // Marcar NÃO faturável: exige justificativa → abre o modal.
    setNonBillableEntry(entry);
    setReason(entry.nonBillableReason ?? "");
    setReasonError(false);
    setJustificationFile(null);
    setJustificationAttachError(null);
  }

  /** Pré-checagem do arquivo de justificativa (mesma whitelist/teto do anexo). */
  function handleJustificationFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!isAcceptedAttachment(file)) {
      setJustificationAttachError("Formato não aceito. Use PDF, JPG, PNG ou WEBP.");
      return;
    }
    if (file.size > ATTACH_MAX_SIZE_BYTES) {
      setJustificationAttachError("Arquivo acima de 10 MB.");
      return;
    }
    setJustificationAttachError(null);
    setJustificationFile(file);
  }

  /** Confirma o motivo (obrigatório) e dispara a mudança para NÃO faturável. */
  function confirmNonBillable() {
    if (!nonBillableEntry) return;
    if (reason.trim().length === 0) {
      setReasonError(true);
      return;
    }
    onSetBillable(
      nonBillableEntry.id,
      false,
      reason.trim(),
      justificationFile ?? undefined,
    );
    setNonBillableEntry(null);
    setReason("");
    setReasonError(false);
    setJustificationFile(null);
    setJustificationAttachError(null);
  }

  function cancelNonBillable() {
    setNonBillableEntry(null);
    setReason("");
    setReasonError(false);
    setJustificationFile(null);
    setJustificationAttachError(null);
  }

  return (
    <li>
      <div className="flex items-start gap-3 px-5 py-4">
        <label className="mt-0.5 flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelected(item.id)}
            aria-label={`Selecionar ${item.consultantName}`}
            className="size-4 rounded border-border text-brand focus:ring-brand"
          />
        </label>

        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={detailId}
          className={cn(
            "flex min-w-0 flex-1 items-start gap-2.5 rounded-md text-left transition-colors",
            focusRing,
          )}
        >
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "mt-0.5 size-4 shrink-0 text-soft transition-transform duration-150",
              expanded && "rotate-180",
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
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
                // Mixed queue: flag fictitious items so decisions on real data
                // are never confused with demo ones.
                <StatusBadge tone="neutral">Demo</StatusBadge>
              ) : null}
            </div>
            <p className="truncate text-xs text-soft">
              {item.projectName} · {item.clientName} · {item.period}
            </p>
          </div>
        </button>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tabular-nums text-medium">
              {isExpense
                ? formatCurrency(item.amount ?? 0)
                : formatHours(item.hours)}
            </span>
            <ApprovalStatusBadge status={item.status} />
          </div>
          {canDecide ? (
            <div className="flex gap-1.5">
              <ActionButton
                variant="success"
                size="sm"
                icon={Check}
                disabled={busy}
                onClick={handleApprove}
              >
                Aprovar
              </ActionButton>
              <ActionButton
                variant="danger"
                size="sm"
                icon={X}
                disabled={busy}
                aria-expanded={rejectOpen}
                aria-controls={rejectOpen ? rejectFieldId : undefined}
                onClick={() => (rejectOpen ? cancelReject() : openReject())}
              >
                Reprovar
              </ActionButton>
            </div>
          ) : null}
        </div>
      </div>

      {canDecide && rejectOpen ? (
        <div id={rejectFieldId} className="pb-4 pl-12 pr-5">
          <label
            htmlFor={`${rejectFieldId}-input`}
            className="mb-1 block text-xs font-semibold text-medium"
          >
            Justificativa da reprovação{" "}
            <span className="font-normal text-soft">(obrigatória)</span>
          </label>
          <textarea
            id={`${rejectFieldId}-input`}
            value={rejectComment}
            onChange={(event) => {
              setRejectComment(event.target.value);
              if (rejectError && event.target.value.trim().length > 0) {
                setRejectError(false);
              }
            }}
            rows={2}
            aria-invalid={rejectError}
            placeholder="Descreva o motivo da reprovação (fica na trilha de auditoria)."
            className={cn(
              "w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong placeholder:text-soft",
              focusRingInput,
              rejectError && "border-danger",
            )}
          />
          {rejectError ? (
            <p className="mt-1 text-xs font-medium text-danger">
              Informe uma justificativa para reprovar.
            </p>
          ) : null}
          <div className="mt-2 flex gap-2">
            <ActionButton
              variant="danger"
              size="sm"
              icon={X}
              disabled={busy}
              onClick={confirmReject}
            >
              Confirmar reprovação
            </ActionButton>
            <ActionButton
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={cancelReject}
            >
              Cancelar
            </ActionButton>
          </div>
        </div>
      ) : null}

      {/* Progressive disclosure: detail expands on demand. Kept mounted (inert
          while collapsed) so the grid-rows transition animates both ways and
          collapsed content stays out of the tab order / accessibility tree.
          prefers-reduced-motion neutralizes the transition globally. */}
      <div
        id={detailId}
        role="region"
        aria-label={`Detalhe de ${item.consultantName}`}
        inert={!expanded ? true : undefined}
        className={cn(
          "grid transition-[grid-template-rows] duration-150 ease-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 pb-4 pl-12 pr-5">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2">
                <dt className="text-xs text-soft">
                  {isExpense ? "Descrição" : "Atividade"}
                </dt>
                <dd className="text-medium">{item.activitySummary}</dd>
              </div>
              <div>
                <dt className="text-xs text-soft">Enviado em</dt>
                <dd className="font-medium text-strong">
                  {new Date(item.submittedAt).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-soft">Origem</dt>
                <dd className="font-medium text-strong">
                  {item.source === "db" ? "Banco" : "Demo"}
                </dd>
              </div>
              {item.comment ? (
                <div className="col-span-2">
                  <dt className="text-xs text-soft">Justificativa anterior</dt>
                  <dd className="text-medium">{item.comment}</dd>
                </div>
              ) : null}
            </dl>

            {billableEntries ? (
              <div className="rounded-md border border-border bg-surface-muted/30 p-3">
                <p className="mb-1 text-xs font-semibold text-medium">
                  Faturável por dia
                </p>
                <p className="mb-2 text-xs text-soft">
                  Definição de gestão: marque ou desmarque cada dia. Ao desmarcar,
                  informe o motivo (fica na trilha de auditoria).
                </p>
                <ul className="divide-y divide-border">
                  {billableEntries.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-strong">
                          {shortDate(entry.date)} ·{" "}
                          <span className="tabular-nums">
                            {formatHours(entry.hours)}
                          </span>
                        </p>
                        <p className="truncate text-xs text-soft">
                          {entry.activityLabel}
                        </p>
                        {!entry.billable && entry.nonBillableReason ? (
                          <p className="mt-0.5 truncate text-xs text-medium">
                            Motivo: {entry.nonBillableReason}
                          </p>
                        ) : null}
                      </div>
                      <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-medium">
                        <input
                          type="checkbox"
                          checked={entry.billable}
                          disabled={busy}
                          onChange={(e) =>
                            toggleEntryBillable(entry, e.target.checked)
                          }
                          className="size-4 rounded border-border text-brand focus:ring-brand"
                        />
                        {entry.billable ? "Faturável" : "Não faturável"}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ) : hasEntries ? (
              // Sem permissão de edição: quebra por dia em modo leitura.
              <div className="rounded-md border border-border bg-surface-muted/30 p-3">
                <p className="mb-2 text-xs font-semibold text-medium">
                  Detalhamento por dia
                </p>
                <ul className="divide-y divide-border">
                  {item.entries!.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-strong">
                          {shortDate(entry.date)} ·{" "}
                          <span className="tabular-nums">
                            {formatHours(entry.hours)}
                          </span>
                        </p>
                        <p className="truncate text-xs text-soft">
                          {entry.activityLabel}
                        </p>
                      </div>
                      <StatusBadge tone={entry.billable ? "info" : "neutral"}>
                        {entry.billable ? "Faturável" : "Não faturável"}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Justificativa obrigatória ao marcar um DIA como NÃO faturável (padrão
          P9): motivo obrigatório + anexo opcional quando há storage. */}
      <Modal
        open={Boolean(nonBillableEntry)}
        onClose={cancelNonBillable}
        title="Marcar dia como não faturável"
        description={
          nonBillableEntry
            ? `Informe o motivo pelo qual ${shortDate(nonBillableEntry.date)} não será faturado. O motivo fica registrado na trilha de auditoria.`
            : "Informe o motivo. O motivo fica registrado na trilha de auditoria."
        }
        footer={
          <>
            <ActionButton
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={cancelNonBillable}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              variant="primary"
              size="sm"
              icon={Check}
              disabled={busy}
              onClick={confirmNonBillable}
            >
              Confirmar não faturável
            </ActionButton>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label
              htmlFor={`non-billable-reason-${item.id}`}
              className="mb-1 block text-xs font-semibold text-medium"
            >
              Motivo <span className="font-normal text-soft">(obrigatório)</span>
            </label>
            <textarea
              id={`non-billable-reason-${item.id}`}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (e.target.value.trim().length > 0) setReasonError(false);
              }}
              rows={3}
              placeholder="Ex.: Retrabalho não cobrável; cortesia acordada com o cliente."
              aria-invalid={reasonError}
              className={cn(
                "w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong placeholder:text-soft",
                focusRingInput,
                reasonError && "border-danger",
              )}
            />
            {reasonError ? (
              <p className="mt-1 text-xs text-danger">O motivo é obrigatório.</p>
            ) : null}
          </div>

          {attachmentsAvailable ? (
            <div>
              <span className="mb-1 block text-xs font-semibold text-medium">
                Anexo{" "}
                <span className="font-normal text-soft">
                  (opcional · PDF, JPG, PNG ou WEBP, até 10 MB)
                </span>
              </span>
              {justificationFile ? (
                <div className="flex items-center gap-3 rounded-md border border-border bg-surface-muted/50 px-3 py-2">
                  <FileText
                    aria-hidden="true"
                    className="size-4 shrink-0 text-medium"
                  />
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-strong">
                    {justificationFile.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setJustificationFile(null);
                      setJustificationAttachError(null);
                      if (justificationInputRef.current) {
                        justificationInputRef.current.value = "";
                      }
                    }}
                    aria-label="Remover arquivo selecionado"
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-md text-medium transition-colors hover:bg-surface hover:text-strong",
                      focusRing,
                    )}
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor={`non-billable-attachment-${item.id}`}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-surface px-3 py-2.5 text-sm text-medium transition-colors hover:border-brand hover:text-strong",
                    focusRing,
                  )}
                >
                  <Paperclip aria-hidden="true" className="size-4" />
                  Anexar comprovante
                </label>
              )}
              <input
                ref={justificationInputRef}
                id={`non-billable-attachment-${item.id}`}
                type="file"
                accept={ATTACH_ACCEPT}
                className="sr-only"
                onChange={(e) => handleJustificationFiles(e.target.files)}
              />
              {justificationAttachError ? (
                <p role="alert" className="mt-1 text-xs font-medium text-danger">
                  {justificationAttachError}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-soft">
              Anexo indisponível (armazenamento não configurado): o motivo textual
              é registrado assim mesmo.
            </p>
          )}
        </div>
      </Modal>
    </li>
  );
}
