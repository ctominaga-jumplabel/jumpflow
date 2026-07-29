"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  CalendarOff,
  CheckCircle2,
  Clock,
  FileText,
  Minus,
  Moon,
  Paperclip,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import type {
  CockpitCalendar,
  CockpitCalendarDayKind,
} from "@/lib/operacao/cockpit";

export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface KindMeta {
  label: string;
  /** Classe da célula do dia. */
  cell: string;
  /** Classe do ponto/legenda. */
  swatch: string;
  /** Ícone semântico — reforça o estado sem depender só da cor. */
  icon: LucideIcon;
  /** Cor do ícone dentro da célula/legenda. */
  iconClass: string;
}

export const KIND_META: Record<CockpitCalendarDayKind, KindMeta> = {
  APPROVED: {
    label: "Aprovado",
    cell: "border-success/40 bg-success-soft text-success",
    swatch: "bg-success-soft border border-success/40",
    icon: CheckCircle2,
    iconClass: "text-success",
  },
  PENDING: {
    label: "Pendente",
    cell: "border-warning/40 bg-warning-soft text-warning",
    swatch: "bg-warning-soft border border-warning/40",
    icon: Clock,
    iconClass: "text-warning",
  },
  DRAFT: {
    label: "Rascunho",
    cell: "border-brand/30 bg-brand-soft text-brand-dark",
    swatch: "bg-brand-soft border border-brand/30",
    icon: FileText,
    iconClass: "text-brand-dark",
  },
  REJECTED: {
    label: "Rejeitado",
    cell: "border-danger/40 bg-danger-soft text-danger",
    swatch: "bg-danger-soft border border-danger/40",
    icon: XCircle,
    iconClass: "text-danger",
  },
  EMPTY: {
    label: "Sem lançamento",
    cell: "border-dashed border-ink/30 bg-surface text-medium",
    swatch: "bg-surface border border-dashed border-ink/40",
    icon: Minus,
    iconClass: "text-soft",
  },
  HOLIDAY: {
    label: "Feriado",
    cell: "border-border bg-surface-muted text-soft",
    swatch: "bg-surface-muted border border-border",
    icon: CalendarOff,
    iconClass: "text-soft",
  },
  WEEKEND: {
    label: "Fim de semana",
    cell: "border-transparent bg-surface-muted/50 text-soft",
    swatch: "bg-surface-muted/50 border border-border",
    icon: Moon,
    iconClass: "text-soft",
  },
};

/**
 * Grade mensal do calendário de um consultor (proposta item 1.1.1.1). Cada dia
 * útil é pintado pelo estado (aprovado / pendente / rascunho / rejeitado /
 * vazio) e os não úteis por feriado / fim de semana. Sem scroll effects — grade
 * estática, coerente com fluxos operacionais.
 */
export function CockpitCalendarGrid({
  calendar,
  onOpenAttachment,
}: {
  calendar: CockpitCalendar;
  /** Abre o anexo de um lançamento (clip) — item 4. */
  onOpenAttachment?: (entryId: string) => void;
}) {
  const reduce = useReducedMotion();
  const days = calendar.days;
  // Espaços em branco antes do dia 1 para alinhar na coluna do dia da semana.
  const leading = days.length > 0 ? days[0].weekday : 0;

  // Estados presentes no mês, para uma legenda enxuta.
  const present = new Set(days.map((d) => d.kind));
  const legendOrder: CockpitCalendarDayKind[] = [
    "APPROVED",
    "PENDING",
    "DRAFT",
    "REJECTED",
    "EMPTY",
    "HOLIDAY",
    "WEEKEND",
  ];

  return (
    <motion.div
      className="space-y-3"
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface-muted/40 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-medium">
          <Clock aria-hidden="true" className="size-3.5 text-soft" />
          Total lançado no mês
        </span>
        <span className="text-sm font-semibold tabular-nums text-strong">
          {calendar.totalHoras.toLocaleString("pt-BR", {
            maximumFractionDigits: 2,
          })}
          h
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
          const title =
            day.holidayName != null
              ? `Dia ${day.day} — ${meta.label} — ${day.holidayName}`
              : day.hours > 0
                ? `Dia ${day.day} — ${meta.label} — ${day.hours}h`
                : `Dia ${day.day} — ${meta.label}`;
          return (
            <div
              key={day.date}
              aria-label={title}
              className={cn(
                "flex min-h-16 flex-col gap-0.5 rounded-md border px-1.5 py-1",
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
                <Icon
                  aria-hidden="true"
                  className={cn("size-3 shrink-0", meta.iconClass)}
                />
              </div>
              {/* Atividades do dia (item 4): rótulo + clip do anexo. */}
              {day.activities.length > 0 ? (
                <ul className="space-y-0.5 text-left">
                  {day.activities.map((a) => (
                    <li
                      key={a.entryId}
                      className="flex items-center gap-0.5 leading-tight"
                    >
                      <span
                        className="min-w-0 flex-1 truncate text-[10px] font-medium"
                        title={`${a.activityLabel} — ${a.hours}h`}
                      >
                        {a.activityLabel}
                      </span>
                      {a.hasAttachment ? (
                        onOpenAttachment ? (
                          <button
                            type="button"
                            onClick={() => onOpenAttachment(a.entryId)}
                            title="Ver anexo"
                            aria-label={`Ver anexo de ${a.activityLabel}`}
                            className={cn(
                              "shrink-0 rounded p-0.5 hover:bg-ink/10",
                              focusRing,
                            )}
                          >
                            <Paperclip className="size-3" />
                          </button>
                        ) : (
                          <Paperclip
                            aria-label="Com anexo"
                            className="size-3 shrink-0"
                          />
                        )
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {day.hours > 0 ? (
                <span className="mt-auto text-right text-[10px] font-medium tabular-nums opacity-80">
                  {day.hours}h
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-3">
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
