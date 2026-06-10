"use client";

import { useMemo, useRef, useState } from "react";
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
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { formatHours } from "@/lib/format";
import { projects as allProjects } from "@/lib/mock-data/projects";
import {
  cloneWeek,
  dayTotal,
  DEFAULT_WEEK_INDEX,
  deriveWeekStatus,
  isRowCopyable,
  isRowEditable,
  rowTotal,
  statusCounts,
  timeEntryStatusLabels,
  timesheetWeeks,
  weekTotal,
  type TimeEntryRow as TimeEntryRowData,
  type TimesheetWeek,
} from "@/lib/mock-data/timesheet";
import { TimeEntryRow } from "./TimeEntryRow";
import { TimeEntryStatusBadge } from "./TimeEntryStatusBadge";
import {
  TimeEntryForm,
  type TimeEntryFormProject,
  type TimeEntryFormValue,
} from "./TimeEntryForm";

const WEEKLY_TARGET = 40;

/** Projects a consultant may log to (not closed). */
const formProjects: TimeEntryFormProject[] = allProjects
  .filter((p) => p.status !== "CLOSED")
  .map((p) => ({ id: p.id, name: p.name, clientName: p.client.name }));

export interface TimesheetWeekViewProps {
  /** Override the navigable weeks (mainly for tests). */
  weeks?: TimesheetWeek[];
  /** Index of the week shown first. */
  initialIndex?: number;
}

/**
 * Weekly time-entry grid (Playful Productivity center per the visual identity).
 *
 * MVP scope: data is mocked and all mutations happen in LOCAL state — new entry,
 * edit, copy previous week, week navigation and submit-for-approval. Nothing is
 * persisted yet (no Prisma/server action); actions report honestly through the
 * feedback live region. The shapes mirror TimesheetPeriod/TimeEntry so wiring a
 * Server Action later is mechanical.
 */
export function TimesheetWeekView({
  weeks = timesheetWeeks,
  initialIndex = DEFAULT_WEEK_INDEX,
}: TimesheetWeekViewProps) {
  const [localWeeks, setLocalWeeks] = useState<TimesheetWeek[]>(() =>
    weeks.map(cloneWeek),
  );
  const [index, setIndex] = useState(initialIndex);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editInitial, setEditInitial] = useState<TimeEntryFormValue | null>(null);
  const { feedback, notify } = useFeedback();
  const idCounter = useRef(0);

  const week = localWeeks[index];
  const counts = useMemo(() => statusCounts(week), [week]);
  const total = useMemo(() => weekTotal(week), [week]);

  /** Immutably update the currently displayed week. */
  function updateWeek(fn: (w: TimesheetWeek) => TimesheetWeek) {
    setLocalWeeks((prev) => prev.map((w, i) => (i === index ? fn(w) : w)));
  }

  function navigate(delta: number) {
    const target = index + delta;
    if (target < 0 || target >= localWeeks.length) {
      notify("info", "Não há mais semanas disponíveis nesta demonstração.");
      return;
    }
    setIndex(target);
  }

  function openNew() {
    setEditingRowId(null);
    setEditInitial(null);
    setFormOpen(true);
  }

  function openEdit(row: TimeEntryRowData) {
    const dayIndex = Math.max(
      0,
      row.hours.findIndex((h) => h > 0),
    );
    setEditingRowId(row.id);
    setEditInitial({
      projectId: row.projectId,
      activity: row.activity,
      dayIndex,
      hours: row.hours[dayIndex] ?? 0,
      description: row.description ?? "",
      billable: row.billable,
    });
    setFormOpen(true);
  }

  function handleSubmitEntry(value: TimeEntryFormValue) {
    const project = formProjects.find((p) => p.id === value.projectId);
    if (!project) return;

    updateWeek((w) => {
      let rows = w.rows;

      if (editingRowId) {
        // Update the row being edited (only DRAFT/REJECTED reach here).
        rows = rows.map((r) =>
          r.id === editingRowId
            ? {
                ...r,
                status: "DRAFT" as const,
                description: value.description,
                billable: value.billable,
                hours: r.hours.map((h, i) =>
                  i === value.dayIndex ? value.hours : h,
                ),
              }
            : r,
        );
      } else {
        // New entry: merge into an existing editable row for the same
        // project+activity, or create a fresh DRAFT row.
        const existing = rows.find(
          (r) =>
            r.projectId === value.projectId &&
            r.activity === value.activity &&
            isRowEditable(r),
        );
        if (existing) {
          rows = rows.map((r) =>
            r === existing
              ? {
                  ...r,
                  status: "DRAFT" as const,
                  description: value.description || r.description,
                  billable: value.billable,
                  hours: r.hours.map((h, i) =>
                    i === value.dayIndex ? value.hours : h,
                  ),
                }
              : r,
          );
        } else {
          idCounter.current += 1;
          const hours = Array.from({ length: w.days.length }, (_, i) =>
            i === value.dayIndex ? value.hours : 0,
          );
          rows = [
            ...rows,
            {
              id: `te-local-${idCounter.current}`,
              projectId: value.projectId,
              projectName: project.name,
              clientName: project.clientName,
              activity: value.activity,
              billable: value.billable,
              status: "DRAFT",
              description: value.description || undefined,
              hours,
            },
          ];
        }
      }

      const next = { ...w, rows };
      return { ...next, status: deriveWeekStatus(next) };
    });

    setFormOpen(false);
    notify(
      "success",
      editingRowId
        ? "Lançamento atualizado (rascunho local)."
        : "Lançamento adicionado como rascunho (local).",
    );
  }

  function copyPreviousWeek() {
    if (index === 0) {
      notify("info", "Não há semana anterior para copiar nesta demonstração.");
      return;
    }
    const source = localWeeks[index - 1];
    const copyable = source.rows.filter(isRowCopyable);
    if (copyable.length === 0) {
      notify("info", "A semana anterior não tem lançamentos elegíveis para cópia.");
      return;
    }

    updateWeek((w) => {
      const existingKeys = new Set(
        w.rows.map((r) => `${r.projectId}:${r.activity}`),
      );
      const additions: TimeEntryRowData[] = [];
      for (const row of copyable) {
        const key = `${row.projectId}:${row.activity}`;
        if (existingKeys.has(key)) continue;
        idCounter.current += 1;
        additions.push({
          ...row,
          id: `te-copy-${idCounter.current}`,
          status: "DRAFT",
          hours: [...row.hours],
        });
      }
      const next = { ...w, rows: [...w.rows, ...additions] };
      return { ...next, status: deriveWeekStatus(next) };
    });

    notify("success", "Lançamentos elegíveis copiados como rascunho.");
  }

  function submitWeek() {
    const submittable = week.rows.filter(
      (r) => r.status === "DRAFT" && rowTotal(r) > 0,
    );
    if (submittable.length === 0) {
      notify(
        "warning",
        "Nenhum lançamento válido para enviar. Adicione horas em um rascunho.",
      );
      return;
    }

    updateWeek((w) => {
      const rows = w.rows.map((r) =>
        r.status === "DRAFT" && rowTotal(r) > 0
          ? { ...r, status: "SUBMITTED" as const }
          : r,
      );
      const next = { ...w, rows };
      return { ...next, status: deriveWeekStatus(next) };
    });

    notify(
      "success",
      `${submittable.length} lançamento(s) enviado(s) para aprovação.`,
    );
  }

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
          <ActionButton
            variant="secondary"
            size="sm"
            aria-label="Semana anterior"
            onClick={() => navigate(-1)}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </ActionButton>
          <ActionButton
            variant="secondary"
            size="sm"
            aria-label="Próxima semana"
            onClick={() => navigate(1)}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </ActionButton>
          <ActionButton
            variant="secondary"
            size="sm"
            icon={CopyPlus}
            onClick={copyPreviousWeek}
          >
            Copiar semana anterior
          </ActionButton>
          <ActionButton variant="primary" size="sm" icon={Plus} onClick={openNew}>
            Novo lançamento
          </ActionButton>
        </div>
      </div>

      <FeedbackBanner message={feedback} />

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
          <ActionButton
            variant="primary"
            size="sm"
            icon={Send}
            onClick={submitWeek}
          >
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
                  <TimeEntryRow
                    key={row.id}
                    row={row}
                    days={week.days}
                    onEdit={openEdit}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink bg-surface-muted/40 font-semibold text-strong">
                  <td className="px-4 py-3" colSpan={2}>
                    Total da semana
                  </td>
                  {week.days.map((day, dayIndex) => (
                    <td
                      key={day.date}
                      className="px-2 py-3 text-center tabular-nums"
                    >
                      {dayTotal(week, dayIndex) || "–"}
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

      <TimeEntryForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        projects={formProjects}
        days={week.days}
        initial={editInitial}
        onSubmit={handleSubmitEntry}
      />
    </div>
  );
}
