"use client";

import { useState, useTransition } from "react";
import { Plus, TrendingUp } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { formatCurrency, formatHours, MASKED_VALUE } from "@/lib/format";
import { createCostRate } from "@/app/app/projetos/actions";
import type { AllocationMarginRow, ProjectMarginRow } from "@/lib/db/margin";

const inputCls =
  "rounded-md border border-[#d7d8cf] bg-white px-2 py-1 text-sm text-ink w-24";

function marginColor(pct: number | null): string {
  if (pct == null) return "text-soft";
  if (pct < 0) return "text-[#b91c1c]";
  if (pct < 20) return "text-[#92400e]";
  return "text-[#166534]";
}

export function MarginPanel({
  today,
  projects,
}: {
  today: string;
  projects: ProjectMarginRow[];
}) {
  const { feedback, notify } = useFeedback();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [cost, setCost] = useState("");

  function submitCost(allocationId: string) {
    const value = Number(cost);
    if (!value || value <= 0) {
      notify("warning", "Informe um custo/hora válido.");
      return;
    }
    startTransition(async () => {
      const r = await createCostRate({
        allocationId,
        startsAt: today,
        endsAt: undefined,
        hourlyCost: value,
        currency: "BRL",
        note: undefined,
      });
      if (r.ok) {
        notify("success", "Custo registrado.");
        setEditing(null);
        setCost("");
      } else {
        notify("warning", r.message);
      }
    });
  }

  if (projects.length === 0) {
    return (
      <SectionPanel title="Margem por projeto (PR)" description="Receita prevista × custo por consultor.">
        <p className="text-sm text-soft">Nenhum projeto ativo com alocações.</p>
      </SectionPanel>
    );
  }

  const columns: DataTableColumn<AllocationMarginRow>[] = [
    {
      key: "consultant",
      header: "Consultor",
      cell: (a) => (
        <div>
          <p className="font-medium text-strong">{a.consultantName}</p>
          <p className="text-xs text-soft">
            {a.role} · {a.allocationPercent}% · {formatHours(a.monthlyHours)}/mês
          </p>
        </div>
      ),
    },
    {
      key: "sale",
      header: "Venda/h",
      align: "right",
      cell: (a) => (
        <span className="text-sm tabular-nums">
          {a.saleRate != null ? formatCurrency(a.saleRate) : MASKED_VALUE}
        </span>
      ),
    },
    {
      key: "cost",
      header: "Custo/h",
      align: "right",
      cell: (a) =>
        a.costRate != null ? (
          <span className="text-sm tabular-nums">{formatCurrency(a.costRate)}</span>
        ) : editing === a.allocationId ? (
          <span className="inline-flex items-center gap-1">
            <input
              type="number"
              min="0"
              step="0.01"
              autoFocus
              className={inputCls}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
            <button
              className="text-[#2457ff] disabled:opacity-50"
              disabled={isPending}
              onClick={() => submitCost(a.allocationId)}
            >
              OK
            </button>
          </span>
        ) : (
          <button
            className="inline-flex items-center gap-1 text-sm text-accent underline"
            onClick={() => {
              setEditing(a.allocationId);
              setCost("");
            }}
          >
            <Plus size={13} /> definir
          </button>
        ),
    },
    {
      key: "revenue",
      header: "Receita prev.",
      align: "right",
      cell: (a) => (
        <span className="text-sm tabular-nums text-medium">
          {a.revenue != null ? formatCurrency(a.revenue) : MASKED_VALUE}
        </span>
      ),
      className: "hidden sm:table-cell",
    },
    {
      key: "margin",
      header: "Margem",
      align: "right",
      cell: (a) => (
        <span className={`text-sm font-semibold tabular-nums ${marginColor(a.marginPct)}`}>
          {a.margin != null ? formatCurrency(a.margin) : "—"}
          {a.marginPct != null ? ` (${a.marginPct}%)` : ""}
        </span>
      ),
    },
  ];

  return (
    <SectionPanel
      title="Margem por projeto (PR)"
      description="Receita prevista mensal (alocação × 160h × valor de venda) menos o custo por consultor."
    >
      <FeedbackBanner message={feedback} />
      <div className="space-y-5">
        {projects.map((project) => (
          <div key={project.projectId} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-strong">
                {project.projectName}{" "}
                <span className="font-normal text-soft">· {project.clientName}</span>
              </h3>
              <p className="text-sm text-medium">
                <TrendingUp size={14} className="mr-1 inline" />
                Margem prevista:{" "}
                <span className={`font-semibold ${marginColor(project.totals.marginPct)}`}>
                  {formatCurrency(project.totals.margin)}
                  {project.totals.marginPct != null
                    ? ` (${project.totals.marginPct}%)`
                    : ""}
                </span>
                {project.totals.hasMissingCost ? (
                  <span className="ml-2 text-xs text-[#92400e]">
                    custo incompleto
                  </span>
                ) : null}
              </p>
            </div>
            <DataTable
              columns={columns}
              rows={project.allocations}
              rowKey={(a) => a.allocationId}
              caption={`Margem — ${project.projectName}`}
            />
          </div>
        ))}
      </div>
    </SectionPanel>
  );
}
