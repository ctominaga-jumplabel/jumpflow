"use client";

import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import {
  activityLabels,
  isRowEditable,
  rowTotal,
  type TimeEntryRow as TimeEntryRowData,
  type WeekDay,
} from "@/lib/timesheet/types";
import { formatHours } from "@/lib/format";
import { TimeEntryStatusBadge } from "./TimeEntryStatusBadge";

export interface TimeEntryRowProps {
  row: TimeEntryRowData;
  days: WeekDay[];
  /** Called to edit the row; only wired when the row is editable. */
  onEdit?: (row: TimeEntryRowData) => void;
}

/**
 * One project+activity line in the weekly timesheet grid. Editable rows (DRAFT
 * or REJECTED) expose an edit affordance; submitted/approved/closed rows render
 * as read-only so they never look editable to the consultant.
 */
export function TimeEntryRow({ row, days, onEdit }: TimeEntryRowProps) {
  const editable = isRowEditable(row) && Boolean(onEdit);

  return (
    <tr className="transition-colors hover:bg-surface-muted/60">
      <td className="px-4 py-3 align-middle">
        {editable ? (
          <button
            type="button"
            onClick={() => onEdit?.(row)}
            className={cn(
              "group flex items-center gap-1.5 rounded-md text-left",
              focusRing,
            )}
            aria-label={`Editar lançamento de ${row.projectName} · ${activityLabels[row.activity]}`}
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
          {activityLabels[row.activity]}
        </span>
        {!row.billable ? (
          <span className="ml-2 text-xs text-soft">(não faturável)</span>
        ) : null}
      </td>
      {days.map((day, index) => {
        const value = row.hours[index] ?? 0;
        return (
          <td
            key={day.date}
            className={cn(
              "px-2 py-3 text-center align-middle tabular-nums",
              day.weekend && "bg-surface-muted/40",
              value > 0 ? "text-strong" : "text-soft",
            )}
          >
            {value > 0 ? value.toLocaleString("pt-BR") : "–"}
          </td>
        );
      })}
      <td className="px-4 py-3 text-right align-middle text-sm font-semibold tabular-nums text-strong">
        {formatHours(rowTotal(row))}
      </td>
      <td className="px-4 py-3 align-middle">
        <TimeEntryStatusBadge status={row.status} />
      </td>
    </tr>
  );
}
