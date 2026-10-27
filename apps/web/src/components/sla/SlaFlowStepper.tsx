import Link from "next/link";
import { formatDeadlineShort } from "@/lib/sla/business-days";
import type { SlaStageEvaluation } from "@/lib/sla/evaluate";
import { SLA_AREA_LABEL, SLA_STAGE_ACTION_HREF } from "@/lib/sla/types";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import { SlaProgressBar } from "./SlaProgressBar";
import { SLA_STATUS_TONE, SlaStatusBadge, countdownLabel } from "./SlaStatusBadge";

/**
 * Linha do tempo do processo: uma etapa por coluna (lista ordenada), com area,
 * prazo (dd/mm + dia da semana), contagem regressiva em dias uteis e % concluido.
 * Sem efeitos de scroll; em telas estreitas vira lista vertical.
 */
export function SlaFlowStepper({ stages }: { stages: SlaStageEvaluation[] }) {
  if (stages.length === 0) {
    return <p className="px-5 py-6 text-sm text-soft">Nenhuma etapa ativa neste processo.</p>;
  }
  return (
    <ol className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
      {stages.map((s, index) => {
        const tone = SLA_STATUS_TONE[s.status];
        const pending = s.total - s.done;
        return (
          <li
            key={s.stage.stageKey}
            className={cn(
              "relative flex flex-col gap-2 rounded-[var(--radius-card)] border bg-surface p-3",
              s.status === "OVERDUE"
                ? "border-danger/50"
                : s.status === "AT_RISK"
                  ? "border-warning/50"
                  : "border-border",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-soft">
                Etapa {index + 1} · {SLA_AREA_LABEL[s.stage.area]}
              </span>
            </div>
            <p className="text-sm font-semibold leading-snug text-strong">{s.stage.label}</p>
            <div className="text-xs text-medium">
              <p>
                Prazo <span className="font-semibold tabular-nums">{formatDeadlineShort(s.deadline)}</span>
              </p>
              {s.status === "ON_TIME_DONE" || s.status === "LATE_DONE" || s.status === "NOT_APPLICABLE" ? null : (
                <p
                  className={cn(
                    "font-semibold",
                    s.status === "OVERDUE" ? "text-danger" : s.status === "AT_RISK" ? "text-warning" : "text-soft",
                  )}
                >
                  {countdownLabel(s)}
                </p>
              )}
            </div>
            <SlaStatusBadge status={s.status} className="self-start" />
            <div className="mt-auto space-y-1">
              <SlaProgressBar
                value={s.percentDone}
                tone={tone}
                label={`Progresso de ${s.stage.label}`}
              />
              <p className="flex justify-between text-xs text-soft tabular-nums">
                <span>
                  {s.total === 0 ? "Sem itens" : `${s.done}/${s.total} concluídos`}
                </span>
                {s.percentDone !== null ? <span>{s.percentDone}%</span> : null}
              </p>
              {pending > 0 && !s.itemsHidden ? (
                <Link
                  href={SLA_STAGE_ACTION_HREF[s.stage.stageKey]}
                  className={cn("text-xs font-semibold text-brand-dark underline-offset-2 hover:underline", focusRing)}
                >
                  Resolver {pending} pendência{pending === 1 ? "" : "s"}
                </Link>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
