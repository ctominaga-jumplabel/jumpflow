import type { SlaAreaSummary } from "@/lib/sla/evaluate";
import { SLA_AREA_LABEL } from "@/lib/sla/types";
import { cn } from "@/lib/utils";
import { opsLabel } from "@/lib/styles";

/**
 * KPIs por area responsavel (Operacao, DP, Financeiro, Consultores) somando as
 * etapas do processo selecionado. Contagens com rotulo textual — a cor apenas
 * reforca.
 */
export function SlaAreaCards({ areas }: { areas: SlaAreaSummary[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {areas.map((a) => {
        const hasItems = a.pendingOk + a.atRisk + a.overdue + a.onTime + a.late > 0;
        return (
          <section
            key={a.area}
            aria-label={`Área ${SLA_AREA_LABEL[a.area]}`}
            className={cn(
              "rounded-[var(--radius-card)] border-2 border-ink bg-surface p-4 shadow-[3px_3px_0_0_var(--color-ink)]",
              !hasItems && "opacity-70",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-strong">{SLA_AREA_LABEL[a.area]}</h3>
              <span className="text-xs text-soft">
                {a.onTimePct === null ? "sem desfecho" : `${a.onTimePct}% no prazo`}
              </span>
            </div>
            {hasItems ? (
              <dl className="mt-3 grid grid-cols-3 gap-2">
                <div>
                  <dt className={opsLabel}>No prazo</dt>
                  <dd className="text-xl font-semibold tabular-nums text-strong">{a.pendingOk}</dd>
                </div>
                <div>
                  <dt className={opsLabel}>Em risco</dt>
                  <dd className={cn("text-xl font-semibold tabular-nums", a.atRisk ? "text-warning" : "text-strong")}>
                    {a.atRisk}
                  </dd>
                </div>
                <div>
                  <dt className={opsLabel}>Atrasados</dt>
                  <dd className={cn("text-xl font-semibold tabular-nums", a.overdue ? "text-danger" : "text-strong")}>
                    {a.overdue}
                  </dd>
                </div>
                <div className="col-span-3 text-xs text-soft">
                  Concluídos: {a.onTime} no prazo · {a.late} com atraso
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-xs text-soft">Nenhuma etapa desta área no processo.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
