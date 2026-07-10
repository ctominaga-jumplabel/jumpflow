"use client";

import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import {
  activityLabelOf,
  isRowEditable,
  rowTotal,
  timeEntryStatusLabels,
  type TimeEntryRow as TimeEntryRowData,
  type WeekDay,
} from "@/lib/timesheet/types";
import { formatHours } from "@/lib/format";
import {
  EMPTY_HOLIDAY_LOOKUP,
  resolveProjectHoliday,
  type HolidayLookup,
} from "@/lib/timesheet/holidays";
import { TimeEntryStatusBadge } from "./TimeEntryStatusBadge";

export interface TimeEntryRowProps {
  row: TimeEntryRowData;
  days: WeekDay[];
  /**
   * Project-aware holiday lookup. Uma célula só é marcada como feriado se o
   * feriado for GLOBAL ou estiver vinculado ao projeto DESTA linha.
   */
  holidays?: HolidayLookup;
  /** Called to edit the row; only wired when the row is editable. */
  onEdit?: (row: TimeEntryRowData) => void;
}

/**
 * One project+activity line in the weekly timesheet grid. Editable rows (DRAFT,
 * REJECTED or SUBMITTED) expose an edit affordance; approved/closed rows render
 * as read-only so they never look editable to the consultant.
 */
export function TimeEntryRow({
  row,
  days,
  holidays = EMPTY_HOLIDAY_LOOKUP,
  onEdit,
}: TimeEntryRowProps) {
  const editable = isRowEditable(row) && Boolean(onEdit);
  const total = rowTotal(row);
  // Hover tooltip mirroring PeriodOverview's day cards: total hours of the row
  // plus the readable status, so the consultant gets the same at-a-glance
  // context on the main grid without opening the entry.
  const rowTitle = `${row.projectName} · ${activityLabelOf(row.activity)} · ${formatHours(
    total,
  )} · ${timeEntryStatusLabels[row.status]}`;

  return (
    <tr title={rowTitle} className="transition-colors hover:bg-surface-muted/60">
      <td className="px-4 py-3 align-middle">
        {editable ? (
          <button
            type="button"
            onClick={() => onEdit?.(row)}
            className={cn(
              "group flex items-center gap-1.5 rounded-md text-left",
              focusRing,
            )}
            aria-label={`Editar lançamento de ${row.projectName} · ${activityLabelOf(row.activity)}`}
          >
            <span className="text-sm font-medium text-strong group-hover:text-brand">
              {row.projectName}
            </span>
            <Pencil
              aria-hidden="true"
              className="size-3.5 text-soft group-hover:text-brand"
            />
          </button>
        ) : (
          <p className="text-sm font-medium text-strong">{row.projectName}</p>
        )}
        <p className="text-xs text-soft">{row.clientName}</p>
      </td>
      <td className="px-4 py-3 align-middle">
        <span className="text-sm text-medium">
          {activityLabelOf(row.activity)}
        </span>
        {!row.billable ? (
          <span className="ml-2 text-xs text-soft">(não faturável)</span>
        ) : null}
      </td>
      {days.map((day, index) => {
        const value = row.hours[index] ?? 0;
        // Project-aware: global OU vinculado a ESTE projeto.
        const holidayName = resolveProjectHoliday(
          holidays,
          row.projectId,
          day.date,
        );
        return (
          <td
            key={day.date}
            title={holidayName ? `Feriado: ${holidayName}` : undefined}
            className={cn(
              "px-2 py-3 text-center align-middle tabular-nums",
              day.weekend && "bg-surface-muted/40",
              holidayName && "bg-warning-soft/40",
              value > 0 ? "text-strong" : "text-soft",
            )}
          >
            {value > 0 ? value.toLocaleString("pt-BR") : "–"}
          </td>
        );
      })}
      <td className="px-4 py-3 text-right align-middle text-sm font-semibold tabular-nums text-strong">
        {formatHours(total)}
      </td>
      <td className="px-4 py-3 align-middle">
        <TimeEntryStatusBadge status={row.status} />
      </td>
    </tr>
  );
}
