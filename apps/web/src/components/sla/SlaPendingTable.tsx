"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { formatDeadlineShort } from "@/lib/sla/business-days";
import type { SlaItemStatus, SlaStageEvaluation } from "@/lib/sla/evaluate";
import { SLA_AREA_LABEL, type SlaAreaKey } from "@/lib/sla/types";
import { focusRing, focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { SlaStatusBadge } from "./SlaStatusBadge";

type StatusFilter = "open" | "OVERDUE" | "AT_RISK" | "late" | "all";

const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  open: "Pendentes (todos)",
  OVERDUE: "Atrasados",
  AT_RISK: "Em risco",
  late: "Concluídos com atraso",
  all: "Todos os itens",
};

const OPEN: ReadonlySet<SlaItemStatus> = new Set(["OVERDUE", "AT_RISK", "PENDING_OK"]);

const inputCls = cn(
  "rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-ink",
  focusRingInput,
);

const PAGE = 100;

/**
 * Drill-down das pendencias do processo: um item por linha com etapa, area,
 * responsavel, pendencia, status e link para a tela onde a acao acontece.
 */
export function SlaPendingTable({ stages }: { stages: SlaStageEvaluation[] }) {
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [areaFilter, setAreaFilter] = useState<SlaAreaKey | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    return stages.flatMap((s) =>
      s.items
        .filter((item) => {
          if (stageFilter !== "all" && s.stage.stageKey !== stageFilter) return false;
          if (areaFilter !== "all" && s.stage.area !== areaFilter) return false;
          if (statusFilter === "open" && !OPEN.has(item.status)) return false;
          if (statusFilter === "late" && item.status !== "LATE_DONE") return false;
          if ((statusFilter === "OVERDUE" || statusFilter === "AT_RISK") && item.status !== statusFilter) {
            return false;
          }
          if (statusFilter === "all" && item.status === "NOT_APPLICABLE") return false;
          if (q) {
            const hay = `${item.label} ${item.sublabel ?? ""} ${item.responsible ?? ""}`.toLocaleLowerCase("pt-BR");
            if (!hay.includes(q)) return false;
          }
          return true;
        })
        .map((item) => ({ stage: s, item })),
    );
  }, [stages, stageFilter, areaFilter, statusFilter, query]);

  const areas = [...new Set(stages.map((s) => s.stage.area))];
  const hiddenStages = stages.filter((s) => s.itemsHidden).map((s) => s.stage.label);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 border-b border-border px-5 py-3">
        <label className="grid gap-1 text-xs font-medium text-medium">
          Situação
          <select
            className={inputCls}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilter);
              setLimit(PAGE);
            }}
          >
            {(Object.keys(STATUS_FILTER_LABEL) as StatusFilter[]).map((k) => (
              <option key={k} value={k}>
                {STATUS_FILTER_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-medium">
          Etapa
          <select
            className={inputCls}
            value={stageFilter}
            onChange={(e) => {
              setStageFilter(e.target.value);
              setLimit(PAGE);
            }}
          >
            <option value="all">Todas</option>
            {stages.map((s) => (
              <option key={s.stage.stageKey} value={s.stage.stageKey}>
                {s.stage.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-medium">
          Área
          <select
            className={inputCls}
            value={areaFilter}
            onChange={(e) => {
              setAreaFilter(e.target.value as SlaAreaKey | "all");
              setLimit(PAGE);
            }}
          >
            <option value="all">Todas</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {SLA_AREA_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid flex-1 gap-1 text-xs font-medium text-medium sm:max-w-xs">
          Buscar
          <input
            type="search"
            className={inputCls}
            placeholder="Projeto, consultor ou responsável"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
          />
        </label>
        <p className="ml-auto text-xs text-soft" aria-live="polite">
          {rows.length} {rows.length === 1 ? "item" : "itens"}
        </p>
      </div>

      {hiddenStages.length > 0 ? (
        <p className="border-b border-border px-5 py-2 text-xs text-soft">
          Detalhes por consultor de {hiddenStages.join(", ")} são restritos a quem acessa
          Pagamentos; os totais aparecem no fluxo acima.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-soft">
          Nenhum item para os filtros selecionados.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Itens do SLA por etapa</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-soft">
                <th scope="col" className="px-5 py-3">Item</th>
                <th scope="col" className="px-3 py-3">Etapa</th>
                <th scope="col" className="hidden px-3 py-3 md:table-cell">Responsável</th>
                <th scope="col" className="hidden px-3 py-3 lg:table-cell">Pendência</th>
                <th scope="col" className="px-3 py-3">Situação</th>
                <th scope="col" className="px-5 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.slice(0, limit).map(({ stage, item }) => (
                <tr key={`${stage.stage.stageKey}:${item.id}`} className="hover:bg-surface-muted/60">
                  <td className="px-5 py-2.5">
                    <p className="font-medium text-strong">{item.label}</p>
                    {item.sublabel ? <p className="text-xs text-soft">{item.sublabel}</p> : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="text-medium">{stage.stage.label}</p>
                    <p className="text-xs text-soft">
                      {SLA_AREA_LABEL[stage.stage.area]} · prazo {formatDeadlineShort(stage.deadline)}
                    </p>
                  </td>
                  <td className="hidden px-3 py-2.5 text-medium md:table-cell">{item.responsible ?? "—"}</td>
                  <td className="hidden px-3 py-2.5 text-xs text-medium lg:table-cell">{item.detail ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <SlaStatusBadge status={item.status} />
                    {item.businessDaysLate > 0 ? (
                      <p className="mt-1 text-xs text-soft tabular-nums">
                        {item.businessDaysLate} {item.businessDaysLate === 1 ? "dia útil" : "dias úteis"} de atraso
                      </p>
                    ) : null}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <Link
                      href={item.href}
                      className={cn(
                        "inline-flex items-center gap-1 text-xs font-semibold text-brand-dark underline-offset-2 hover:underline",
                        focusRing,
                      )}
                    >
                      Abrir
                      <ArrowUpRight aria-hidden="true" className="size-3.5" />
                      <span className="sr-only"> {stage.stage.label} de {item.label}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > limit ? (
            <div className="border-t border-border px-5 py-3 text-center">
              <button
                type="button"
                onClick={() => setLimit((l) => l + PAGE)}
                className={cn("text-sm font-semibold text-brand-dark hover:underline", focusRing)}
              >
                Mostrar mais {Math.min(PAGE, rows.length - limit)} de {rows.length - limit}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
