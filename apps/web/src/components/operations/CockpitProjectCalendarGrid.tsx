"use client";

import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CockpitProjectCalendar } from "@/lib/operacao/cockpit";
import { KIND_META, WEEKDAY_LABELS } from "./CockpitCalendarGrid";

/**
 * Resumo textual das exceções de um dia (item 2), para o hover do alerta:
 * "Consultor — Atividade (com anexo) · …". Um "Dia Útil" só entra quando tem
 * anexo.
 */
function exceptionSummary(
  exceptions: CockpitProjectCalendar["days"][number]["exceptions"],
): string {
  return exceptions
    .map((e) => {
      const label = e.activityType !== "WORKDAY" ? e.activityLabel : "Dia Útil";
      return `${e.consultantName} — ${label}${
        e.hasAttachment ? " (com anexo)" : ""
      }`;
    })
    .join(" · ");
}

/**
 * Grade mensal do calendário a NÍVEL DE PROJETO (proposta item 2). Cada dia é
 * pintado pelo status agregado (pior status entre os consultores) e recebe um
 * sinal de alerta quando há lançamento de exceção (não-"Dia Útil" ou "Dia Útil"
 * com anexo); o hover do alerta lista as situações. Sem scroll effects — grade
 * estática, coerente com fluxos operacionais.
 */
export function CockpitProjectCalendarGrid({
  calendar,
}: {
  calendar: CockpitProjectCalendar;
}) {
  const reduce = useReducedMotion();
  const days = calendar.days;
  const leading = days.length > 0 ? days[0].weekday : 0;

  const present = new Set(days.map((d) => d.kind));
  const legendOrder = [
    "APPROVED",
    "PENDING",
    "DRAFT",
    "REJECTED",
    "EMPTY",
    "HOLIDAY",
    "WEEKEND",
  ] as const;

  return (
    <motion.div
      className="space-y-3"
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-muted/40 px-3 py-2">
        <span className="text-xs font-medium text-medium">
          Todos os consultores · status agregado do dia
        </span>
        <span className="text-sm font-semibold tabular-nums text-strong">
          {calendar.totalHoras.toLocaleString("pt-BR", {
            maximumFractionDigits: 2,
          })}
          h no mês
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-soft"
          >
            {label}
          </div>
        ))}
        {Array.from({ length: leading }).map((_, i) => (
          <div key={`lead-${i}`} aria-hidden="true" />
        ))}
        {days.map((day) => {
          const meta = KIND_META[day.kind];
          const Icon = meta.icon;
          const hasAlert = day.exceptions.length > 0;
          const summary = hasAlert ? exceptionSummary(day.exceptions) : "";
          const title =
            day.holidayName != null
              ? `Dia ${day.day} — ${meta.label} — ${day.holidayName}`
              : `Dia ${day.day} — ${meta.label}${
                  day.hours > 0 ? ` — ${day.hours}h` : ""
                }`;
          return (
            <div
              key={day.date}
              aria-label={hasAlert ? `${title} — exceções: ${summary}` : title}
              className={cn(
                "flex min-h-14 flex-col justify-between rounded-md border px-1.5 py-1",
                meta.cell,
              )}
            >
              <div className="flex items-center justify-between gap-0.5">
                <span
                  className="text-xs font-semibold tabular-nums"
                  title={title}
                >
                  {day.day}
                </span>
                {hasAlert ? (
                  <span
                    title={summary}
                    aria-hidden="true"
                    className="inline-flex items-center gap-0.5 rounded bg-warning-soft px-1 text-[10px] font-semibold text-warning"
                  >
                    <AlertTriangle className="size-3" />
                    {day.exceptions.length}
                  </span>
                ) : (
                  <Icon
                    aria-hidden="true"
                    className={cn("size-3 shrink-0", meta.iconClass)}
                  />
                )}
              </div>
              {day.hours > 0 ? (
                <span className="text-right text-[10px] font-medium tabular-nums opacity-80">
                  {day.hours}h
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-warning">
          <span className="grid size-4 place-items-center rounded-sm bg-warning-soft">
            <AlertTriangle className="size-2.5" />
          </span>
          Exceção (passe o mouse p/ detalhes)
        </span>
        {legendOrder
          .filter((kind) => present.has(kind))
          .map((kind) => {
            const Icon = KIND_META[kind].icon;
            return (
              <span
                key={kind}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-medium"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-4 place-items-center rounded-sm",
                    KIND_META[kind].swatch,
                  )}
                >
                  <Icon className={cn("size-2.5", KIND_META[kind].iconClass)} />
                </span>
                {KIND_META[kind].label}
              </span>
            );
          })}
      </div>
    </motion.div>
  );
}
