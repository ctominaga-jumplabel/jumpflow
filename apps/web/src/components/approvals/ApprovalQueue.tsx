"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, ClipboardCheck, ListChecks, TriangleAlert, X } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import { formatCurrency, formatHours } from "@/lib/format";
import { decideHours } from "@/app/app/horas/actions";
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
  project: string;
  consultant: string;
  activity: string;
  startDate: string;
  endDate: string;
}

const emptyFilters: ApprovalFilters = {
  status: "ALL",
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

export interface ApprovalQueueProps {
  items?: ApprovalItem[];
  /** Show the "no database" warning banner (demo mode). */
  demoBanner?: boolean;
}

/**
 * Triage queue: pending items on the left, decision panel on the right.
 *
 * Items with `source: "db"` are decided through the decideHours server action
 * (Approval + AuditEvent in one transaction; the route revalidates after).
 * Items with `source: "mock"` (expenses, or hours without a database) keep the
 * original local behavior with honest "(local)" feedback.
 */
export function ApprovalQueue({
  items: seed = defaultItems,
  demoBanner = false,
}: ApprovalQueueProps) {
  // Local decisions apply only to mock items; db items refresh via the server.
  const [mockDecisions, setMockDecisions] = useState<
    Record<string, { status: "APPROVED" | "REJECTED"; comment?: string }>
  >({});
  const [tab, setTab] = useState<Tab>("PENDING");
  const [kind, setKind] = useState<KindFilter>("ALL");
  const [filters, setFilters] = useState<ApprovalFilters>(emptyFilters);
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
  const counts = useMemo(() => summarizeApprovals(filtered), [filtered]);
  const pending = useMemo(() => pendingApprovals(filtered), [filtered]);
  const history = useMemo(() => decidedApprovals(filtered), [filtered]);

  const [selectedId, setSelectedId] = useState<string | null>(
    pendingApprovals(seed)[0]?.id ?? null,
  );

  const list = tab === "PENDING" ? pending : history;
  const selected = list.find((i) => i.id === selectedId) ?? list[0] ?? null;
  const activeId = selected?.id ?? null;
  const selectedPending = selectedIds
    .map((id) => pending.find((item) => item.id === id))
    .filter((item): item is ApprovalItem => Boolean(item));

  function selectNextPending(decidedId: string) {
    const remaining = pending.filter((i) => i.id !== decidedId);
    setSelectedId(remaining[0]?.id ?? null);
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleAllVisiblePending() {
    const ids = pending.map((item) => item.id);
    setSelectedIds((current) =>
      ids.every((id) => current.includes(id))
        ? current.filter((id) => !ids.includes(id))
        : [...new Set([...current, ...ids])],
    );
  }

  function decideMany(status: "APPROVED" | "REJECTED") {
    const comment = bulkComment.trim();
    if (status === "REJECTED" && comment.length === 0) {
      notify("warning", "Informe uma justificativa para reprovar em massa.");
      return;
    }
    if (selectedPending.length === 0) {
      notify("info", "Selecione ao menos uma pendencia.");
      return;
    }

    startTransition(async () => {
      const successfulIds = new Set<string>();
      const errors: string[] = [];
      const hourEntryIds = selectedPending
        .filter((item) => item.source === "db" && item.type === "HOURS")
        .flatMap((item) => item.entryIds ?? []);
      let decided = 0;
      let alreadyDecided = 0;

      if (hourEntryIds.length > 0) {
        const result = await decideHours({
          entryIds: hourEntryIds,
          decision: status,
          comment,
        });
        if (!result.ok) {
          errors.push(result.message);
        } else {
          decided += result.data.decided;
          alreadyDecided += result.data.alreadyDecided;
          for (const item of selectedPending) {
            if (item.source === "db" && item.type === "HOURS") {
              successfulIds.add(item.id);
            }
          }
        }
      }

      for (const item of selectedPending) {
        if (item.source !== "db" || item.type !== "EXPENSE" || !item.expenseId) {
          continue;
        }
        const decideExpense =
          item.stage === "FINANCE" ? decideAsFinance : decideAsManager;
        const result = await decideExpense({
          expenseId: item.expenseId,
          decision: status,
          comment,
        });
        if (!result.ok) {
          errors.push(result.message);
          continue;
        }
        decided += 1;
        successfulIds.add(item.id);
      }

      const mockIds = selectedPending
        .filter((item) => item.source === "mock")
        .map((item) => item.id);
      if (mockIds.length > 0) {
        setMockDecisions((current) => {
          const next = { ...current };
          for (const id of mockIds) {
            next[id] = { status, comment: comment || undefined };
          }
          return next;
        });
        decided += mockIds.length;
        for (const id of mockIds) successfulIds.add(id);
      }

      const remaining = pending.filter((item) => !successfulIds.has(item.id));
      setSelectedIds((current) => current.filter((id) => !successfulIds.has(id)));
      setBulkComment("");
      setSelectedId(remaining[0]?.id ?? null);
      const suffix =
        alreadyDecided > 0 ? ` ${alreadyDecided} ja decidido(s).` : "";
      if (errors.length > 0) {
        notify(
          "warning",
          `${decided} item(ns) aplicado(s). ${errors.length} falha(s): ${errors[0]}`,
        );
        return;
      }
      notify(
        status === "APPROVED" ? "success" : "info",
        status === "APPROVED"
          ? `${decided} item(ns) aprovado(s).${suffix}`
          : `${decided} item(ns) reprovado(s) com justificativa.${suffix}`,
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
        description="Combine periodo, status, projeto, consultor e atividade."
      >
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label htmlFor="approval-start" className="mb-1 block text-xs font-semibold text-medium">
              Inicio
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
          <div className="flex items-end">
            <ActionButton
              variant="secondary"
              size="sm"
              disabled={
                filters.status === "ALL" &&
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
              onClick={() => setTab("PENDING")}
            />
            <FilterChip
              label="Histórico"
              count={history.length}
              active={tab === "HISTORY"}
              onClick={() => setTab("HISTORY")}
            />
          </div>

          {tab === "PENDING" && pending.length > 0 ? (
            <SectionPanel
              title="Decisao em massa"
              description="A decisao usa as mesmas regras e auditoria do fluxo individual."
              action={
                <StatusBadge tone="info">
                  {selectedPending.length} selecionado(s)
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
                    placeholder="Obrigatoria para reprovar; opcional para aprovar."
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
                    onClick={toggleAllVisiblePending}
                  >
                    Selecionar visiveis
                  </ActionButton>
                  <ActionButton
                    variant="success"
                    size="sm"
                    icon={Check}
                    disabled={isPending || selectedPending.length === 0}
                    onClick={() => decideMany("APPROVED")}
                  >
                    Aprovar selecao
                  </ActionButton>
                  <ActionButton
                    variant="danger"
                    size="sm"
                    icon={X}
                    disabled={
                      isPending ||
                      selectedPending.length === 0 ||
                      bulkComment.trim().length === 0
                    }
                    onClick={() => decideMany("REJECTED")}
                  >
                    Reprovar selecao
                  </ActionButton>
                </div>
              </div>
            </SectionPanel>
          ) : null}

          <SectionPanel
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
                        {tab === "PENDING" ? (
                          <label className="flex h-full px-5 py-4">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelected(item.id)}
                              aria-label={`Selecionar ${item.consultantName}`}
                              className="size-4 rounded border-border text-brand focus:ring-brand"
                            />
                          </label>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setSelectedId(item.id)}
                          aria-pressed={isActive}
                          className={cn(
                            "flex min-w-0 flex-1 items-start gap-3 py-3.5 pr-5 text-left transition-colors",
                            tab !== "PENDING" && "pl-5",
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
        />
      </div>
    </div>
  );
}
