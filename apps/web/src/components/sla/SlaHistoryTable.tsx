import { formatMonth } from "@/lib/format";
import { parseCompetenceKey } from "@/lib/sla/business-days";
import type { SlaHistory } from "@/lib/sla/evaluate";
import { SLA_AREA_LABEL } from "@/lib/sla/types";
import { cn } from "@/lib/utils";

function toneFor(pct: number | null): string {
  if (pct === null) return "bg-ink/10";
  if (pct >= 90) return "bg-success";
  if (pct >= 70) return "bg-warning";
  return "bg-danger";
}

function shortMonth(key: string): string {
  const c = parseCompetenceKey(key);
  return c ? formatMonth(c.month, c.year) : key;
}

/**
 * Historico "% concluido no prazo" por etapa nas ultimas competencias. Celula =
 * numero + mini barra (o numero carrega a informacao; a cor so reforca).
 */
export function SlaHistoryTable({ history }: { history: SlaHistory }) {
  if (history.rows.length === 0) {
    return <p className="px-5 py-6 text-sm text-soft">Sem histórico para exibir.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Percentual de itens concluídos no prazo por etapa e competência</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-soft">
              Etapa
            </th>
            {history.competences.map((c) => (
              <th key={c} scope="col" className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-soft">
                {shortMonth(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {history.rows.map((row) => (
            <tr key={row.stageKey}>
              <th scope="row" className="px-5 py-2.5 text-left font-normal">
                <span className="block font-medium text-strong">{row.label}</span>
                <span className="text-xs text-soft">{SLA_AREA_LABEL[row.area]}</span>
              </th>
              {row.onTimePct.map((pct, i) => (
                <td key={i} className="px-3 py-2.5 text-right align-middle">
                  <span className="block tabular-nums text-medium">{pct === null ? "—" : `${pct}%`}</span>
                  <span aria-hidden="true" className="ml-auto mt-1 block h-1 w-14 overflow-hidden rounded-full bg-surface-muted">
                    <span className={cn("block h-full", toneFor(pct))} style={{ width: `${pct ?? 0}%` }} />
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-5 py-3 text-xs text-soft">
        % no prazo = concluídos no prazo ÷ (no prazo + com atraso + atrasados). “—” = sem itens com desfecho.
      </p>
    </div>
  );
}
