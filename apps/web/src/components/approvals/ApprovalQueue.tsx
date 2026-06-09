"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import { formatHours } from "@/lib/format";
import {
  approvalItems as defaultItems,
  decidedApprovals,
  pendingApprovals,
  summarizeApprovals,
  type ApprovalItem,
} from "@/lib/mock-data/approvals";
import { ApprovalStatusBadge } from "./ApprovalStatusBadge";
import { ApprovalDecisionPanel } from "./ApprovalDecisionPanel";

type Tab = "PENDING" | "HISTORY";

export interface ApprovalQueueProps {
  items?: ApprovalItem[];
}

/** Triage queue: pending items on the left, decision panel on the right. */
export function ApprovalQueue({ items = defaultItems }: ApprovalQueueProps) {
  const counts = summarizeApprovals(items);
  const pending = useMemo(() => pendingApprovals(items), [items]);
  const history = useMemo(() => decidedApprovals(items), [items]);

  const [tab, setTab] = useState<Tab>("PENDING");
  const [selectedId, setSelectedId] = useState<string | null>(
    pending[0]?.id ?? null,
  );

  const list = tab === "PENDING" ? pending : history;
  const selected = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="warning">{counts.pending} pendentes</StatusBadge>
        <StatusBadge tone="success">{counts.approved} aprovadas</StatusBadge>
        <StatusBadge tone="danger">{counts.rejected} reprovadas</StatusBadge>
        <StatusBadge tone="info">{counts.automatic} automáticas</StatusBadge>
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
                ? "Lançamentos aguardando decisão."
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
                      ? "Tudo em dia: não há horas aguardando aprovação."
                      : "As decisões aparecerão aqui após a primeira aprovação ou reprovação."
                  }
                />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {list.map((item) => {
                  const isActive = item.id === selectedId;
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
                          <p className="text-sm font-medium text-strong">
                            {item.consultantName}
                          </p>
                          <p className="truncate text-xs text-soft">
                            {item.projectName} · {item.clientName} ·{" "}
                            {item.period}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-xs font-semibold tabular-nums text-medium">
                            {formatHours(item.hours)}
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

        <ApprovalDecisionPanel item={selected} />
      </div>
    </div>
  );
}
