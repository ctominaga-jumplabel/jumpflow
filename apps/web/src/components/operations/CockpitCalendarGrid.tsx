"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  CalendarOff,
  CheckCircle2,
  Clock,
  FileText,
  Minus,
  Moon,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CockpitCalendar,
  CockpitCalendarDayKind,
} from "@/lib/operacao/cockpit";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

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

const KIND_META: Record<CockpitCalendarDayKind, KindMeta> = {
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
export function CockpitCalendarGrid({ calendar }: { calendar: CockpitCalendar }) {
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
              title={title}
              aria-label={title}
              className={cn(
                "flex min-h-12 flex-col justify-between rounded-md border px-1.5 py-1 text-right",
                meta.cell,
              )}
            >
              <span className="text-xs font-semibold tabular-nums">
                {day.day}
              </span>
              <span className="flex items-center justify-between gap-0.5">
                <Icon
                  aria-hidden="true"
                  className={cn("size-3 shrink-0", meta.iconClass)}
                />
                {day.hours > 0 ? (
                  <span className="text-[10px] font-medium tabular-nums opacity-80">
                    {day.hours}h
                  </span>
                ) : null}
              </span>
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
