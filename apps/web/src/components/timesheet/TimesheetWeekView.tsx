"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  Plus,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ActionButton } from "@/components/ui/ActionButton";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatHours } from "@/lib/format";
import {
  currentWeek,
  dayTotal,
  statusCounts,
  timeEntryStatusLabels,
  weekTotal,
  type TimesheetWeek,
} from "@/lib/mock-data/timesheet";
import { TimeEntryRow } from "./TimeEntryRow";
import { TimeEntryStatusBadge } from "./TimeEntryStatusBadge";

const WEEKLY_TARGET = 40;

export interface TimesheetWeekViewProps {
  week?: TimesheetWeek;
}

/**
 * Weekly time-entry grid (Playful Productivity center per the visual identity).
 *
 * MVP scope: the data is mocked (lib/mock-data/timesheet) and the actions —
 * "novo lançamento", "copiar semana anterior", "enviar para aprovação" — are
 * prepared, inert buttons. Wiring them to server actions (Prisma + the
 * approval flow) is the next step and is intentionally NOT faked in the UI.
 */
export function TimesheetWeekView({ week = currentWeek }: TimesheetWeekViewProps) {
  const counts = statusCounts(week);
  const total = weekTotal(week);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md border-2 border-ink bg-marker text-ink shadow-[2px_2px_0_0_var(--color-ink)]">
            <CalendarDays aria-hidden="true" className="size-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-strong">
                {week.label}
              </h2>
              <TimeEntryStatusBadge status={week.status} />
            </div>
            <p className="text-xs text-soft">
              {formatHours(total)} de {formatHours(WEEKLY_TARGET)} previstas
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Week navigation — visual only in the MVP. */}
          <ActionButton variant="secondary" size="sm" aria-label="Semana anterior">
            <ChevronLeft aria-hidden="true" className="size-4" />
          </ActionButton>
          <ActionButton variant="secondary" size="sm" aria-label="Próxima semana">
            <ChevronRight aria-hidden="true" className="size-4" />
          </ActionButton>
          <ActionButton variant="secondary" size="sm" icon={CopyPlus}>
            Copiar semana anterior
          </ActionButton>
          <ActionButton variant="primary" size="sm" icon={Plus}>
            Novo lançamento
          </ActionButton>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] as const).map(
          (status) =>
            counts[status] > 0 ? (
              <StatusBadge
                key={status}
                tone={
                  status === "APPROVED"
                    ? "success"
                    : status === "REJECTED"
                      ? "danger"
                      : status === "SUBMITTED"
                        ? "info"
                        : "neutral"
                }
              >
                {counts[status]} {timeEntryStatusLabels[status].toLowerCase()}
              </StatusBadge>
            ) : null,
        )}
      </div>

      <SectionPanel
        title="Lançamentos da semana"
        description="Horas por projeto, atividade e dia."
        action={
          <ActionButton variant="primary" size="sm" icon={Send}>
            Enviar para aprovação
          </ActionButton>
        }
      >
        {week.rows.length === 0 ? (
          <div className="px-5 py-10">
            <EmptyState
              icon={CalendarDays}
              title="Nenhum lançamento nesta semana"
              description="Comece um novo lançamento ou copie a semana anterior para acelerar o apontamento."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Grade semanal de lançamento de horas
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-soft"
                  >
                    Projeto
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-soft"
                  >
                    Atividade
                  </th>
                  {week.days.map((day) => (
                    <th
                      key={day.date}
                      scope="col"
                      className={cn(
                        "px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-soft",
                        day.weekend && "bg-surface-muted/40",
                      )}
                    >
                      {day.label}
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-soft"
                  >
                    Total
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-soft"
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {week.rows.map((row) => (
                  <TimeEntryRow key={row.id} row={row} days={week.days} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink bg-surface-muted/40 font-semibold text-strong">
                  <td className="px-4 py-3" colSpan={2}>
                    Total da semana
                  </td>
                  {week.days.map((day, index) => (
                    <td
                      key={day.date}
                      className="px-2 py-3 text-center tabular-nums"
                    >
                      {dayTotal(week, index) || "–"}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatHours(total)}
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionPanel>
    </div>
  );
}
