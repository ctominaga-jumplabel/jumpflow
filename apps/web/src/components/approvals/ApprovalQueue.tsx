"use client";

import { useMemo, useState, useTransition } from "react";
import { ClipboardCheck, TriangleAlert } from "lucide-react";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import { formatCurrency, formatHours } from "@/lib/format";
import { decideHours } from "@/app/app/horas/actions";
import {
  approvalItems as defaultItems,
  decidedApprovals,
  filterApprovalsByKind,
  pendingApprovals,
  summarizeApprovals,
  type ApprovalItem,
  type ApprovalKind,
} from "@/lib/mock-data/approvals";
import { ApprovalStatusBadge } from "./ApprovalStatusBadge";
import { ApprovalDecisionPanel } from "./ApprovalDecisionPanel";

type Tab = "PENDING" | "HISTORY";
type KindFilter = ApprovalKind | "ALL";

const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "HOURS", label: "Horas" },
  { value: "EXPENSE", label: "Despesas" },
];

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
  const counts = useMemo(() => summarizeApprovals(byKind), [byKind]);
  const pending = useMemo(() => pendingApprovals(byKind), [byKind]);
  const history = useMemo(() => decidedApprovals(byKind), [byKind]);

  const [selectedId, setSelectedId] = useState<string | null>(
    pendingApprovals(seed)[0]?.id ?? null,
  );

  const list = tab === "PENDING" ? pending : history;
  const selected = items.find((i) => i.id === selectedId) ?? null;

  function selectNextPending(decidedId: string) {
    const remaining = pending.filter((i) => i.id !== decidedId);
    setSelectedId(remaining[0]?.id ?? null);
  }

  function decide(id: string, status: "APPROVED" | "REJECTED", comment: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;

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
        ? "Item aprovado (local). Persistência de despesas virá em rodada futura."
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
                  const isActive = item.id === selectedId;
                  const isExpense = item.type === "EXPENSE";
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        aria-pressed={isActive}
                        className={cn(
                          "flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors",
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
