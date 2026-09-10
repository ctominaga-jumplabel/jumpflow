"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { focusRing, opsLabel, opsNum } from "@/lib/styles";
import { formatHours } from "@/lib/format";
import {
  timeEntryStatusLabels,
  type TimeEntryStatus,
} from "@/lib/timesheet/types";
import type { PeriodCalendarDay } from "@/lib/db/timesheet";

const statusToneClass: Record<TimeEntryStatus, string> = {
  DRAFT: "border-border bg-surface-muted text-medium",
  SUBMITTED: "border-info/30 bg-info-soft text-info",
  APPROVED: "border-success/30 bg-success-soft text-success",
  REJECTED: "border-danger/30 bg-danger-soft text-danger",
  CLOSED: "border-border bg-surface-muted text-strong",
};

const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Índice 0=Seg … 6=Dom para uma data ISO, sem depender do fuso local. */
function mondayIndexOf(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return 0;
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

export interface PeriodDayGridProps {
  days: PeriodCalendarDay[];
  /**
   * Alinha o primeiro dia à sua coluna de semana, com células vazias antes.
   * Ligado para um período de mês; desligado para uma semana fechada, que já
   * começa na segunda.
   */
  padToWeekday?: boolean;
  /** Hoje em ISO, resolvido no servidor. Marca a célula do dia corrente. */
  todayIso?: string;
  /** Abre a semana daquele dia na grade de lançamento. */
  onOpenWeek?: (dateIso: string) => void;
  className?: string;
}

/**
 * Calendário de dias do período, com detalhe do dia selecionado.
 *
 * Antes as células eram `<div>` com `title`: informação disponível só no hover,
 * invisível para teclado e leitor de tela, e sem para onde levar. Aqui cada dia
 * é um botão que revela o que foi lançado — total, número de lançamentos,
 * projetos e situação — e oferece o atalho para abrir aquela semana na grade.
 */
export function PeriodDayGrid({
  days,
  padToWeekday = false,
  todayIso,
  onOpenWeek,
  className,
}: PeriodDayGridProps) {
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const selected = days.find((day) => day.date === selectedIso) ?? null;

  const leading =
    padToWeekday && days[0] ? mondayIndexOf(days[0].date) : 0;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className={cn(opsLabel, "text-center")}>
            {label}
          </span>
        ))}

        {Array.from({ length: leading }, (_, index) => (
          <span key={`blank-${index}`} aria-hidden="true" />
        ))}

        {days.map((day) => {
          const dominant = day.entries[0]?.status ?? "DRAFT";
          const isSelected = day.date === selectedIso;
          const isToday = day.date === todayIso;
          const dayNumber = day.date.slice(8, 10);
          const summary =
            day.totalHours > 0
              ? `${formatHours(day.totalHours)} · ${timeEntryStatusLabels[dominant]}`
              : "sem lançamento";
          return (
            <button
              key={day.date}
              type="button"
              aria-pressed={isSelected}
              aria-label={`Dia ${dayNumber}: ${summary}${
                day.holidayName ? ` · feriado: ${day.holidayName}` : ""
              }`}
              onClick={() =>
                setSelectedIso((current) =>
                  current === day.date ? null : day.date,
                )
              }
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-1.5 text-xs transition-colors",
                focusRing,
                day.totalHours > 0
                  ? statusToneClass[dominant]
                  : "border-border bg-surface text-soft",
                day.holidayName && "ring-1 ring-inset ring-warning/40",
                isToday &&
                  "outline outline-2 outline-offset-[-2px] outline-ops-accent",
                isSelected && "border-ink",
              )}
            >
              <span className={cn("font-semibold", opsNum)}>{dayNumber}</span>
              <span className={opsNum}>
                {day.totalHours > 0 ? formatHours(day.totalHours) : "–"}
              </span>
              {day.holidayName ? (
                <span className="w-full truncate text-[10px] font-medium text-warning">
                  Feriado
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {selected ? (
        <div className="rounded-[var(--radius-panel)] border border-border bg-surface-muted/40 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-strong">
              {selected.date.slice(8, 10)}/{selected.date.slice(5, 7)}
              {selected.holidayName ? (
                <span className="ml-2 text-xs font-medium text-warning">
                  feriado · {selected.holidayName}
                </span>
              ) : null}
            </h4>
            {onOpenWeek ? (
              <button
                type="button"
                onClick={() => onOpenWeek(selected.date)}
                className={cn(
                  "text-xs font-semibold text-brand hover:underline",
                  focusRing,
                )}
              >
                Abrir esta semana na grade
              </button>
            ) : null}
          </div>

          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Horas no dia", value: formatHours(selected.totalHours) },
              { label: "Lançamentos", value: String(selected.entries.length) },
              {
                label: "Projetos",
                value: String(
                  new Set(selected.entries.map((e) => e.projectName)).size,
                ),
              },
              {
                label: "Situação",
                value: selected.entries[0]
                  ? timeEntryStatusLabels[selected.entries[0].status]
                  : "—",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-md border border-border bg-surface px-3 py-2 text-center"
              >
                <dt className={opsLabel}>{item.label}</dt>
                <dd className={cn("mt-0.5 text-sm font-semibold text-strong", opsNum)}>
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>

          {selected.entries.length > 0 ? (
            <ul className="mt-3 divide-y divide-border">
              {selected.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 py-1.5 text-xs"
                >
                  <span className="min-w-0 truncate text-medium">
                    {entry.projectName} · {entry.activityLabel}
                  </span>
                  <span className={cn("shrink-0 font-semibold text-strong", opsNum)}>
                    {formatHours(entry.hours)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-soft">
              Nenhum lançamento neste dia.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-soft">
          Selecione um dia para ver o que foi lançado.
        </p>
      )}
    </div>
  );
}
