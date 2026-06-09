import { cn } from "@/lib/utils";
import {
  activityLabels,
  rowTotal,
  type TimeEntryRow as TimeEntryRowData,
  type WeekDay,
} from "@/lib/mock-data/timesheet";
import { formatHours } from "@/lib/format";
import { TimeEntryStatusBadge } from "./TimeEntryStatusBadge";

export interface TimeEntryRowProps {
  row: TimeEntryRowData;
  days: WeekDay[];
}

/**
 * One project+activity line in the weekly timesheet grid. Hours per weekday are
 * read-only cells in the MVP (editing is a prepared action). Kept as a plain
 * table row so it composes inside the week table.
 */
export function TimeEntryRow({ row, days }: TimeEntryRowProps) {
  return (
    <tr className="transition-colors hover:bg-surface-muted/60">
      <td className="px-4 py-3 align-middle">
        <p className="text-sm font-medium text-strong">{row.projectName}</p>
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
