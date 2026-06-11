"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  Plus,
  Send,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ActionButton } from "@/components/ui/ActionButton";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { formatHours } from "@/lib/format";
import {
  copyPreviousWeek as copyPreviousWeekAction,
  createTimeEntry,
  deleteTimeEntry,
  submitWeek as submitWeekAction,
  updateTimeEntry,
} from "@/app/app/horas/actions";
import { projects as allProjects } from "@/lib/mock-data/projects";
import {
  DEFAULT_WEEK_INDEX,
  timesheetWeeks,
} from "@/lib/mock-data/timesheet";
import {
  cloneWeek,
  dayTotal,
  deriveWeekStatus,
  isRowCopyable,
  isRowEditable,
  rowTotal,
  statusCounts,
  timeEntryStatusLabels,
  weekTotal,
  type TimeEntryRow as TimeEntryRowData,
  type TimesheetWeek,
} from "@/lib/timesheet/types";
import {
  addDays,
  parseIsoDateUtc,
  toIsoDate,
  weekStartOf,
} from "@/lib/timesheet/week";
import {
  hasActiveTimesheetFilter,
  type TimesheetFilter,
} from "@/lib/timesheet/filters";
import { activityLabelOf, type ActivityType } from "@/lib/timesheet/types";
import { TimeEntryRow } from "./TimeEntryRow";
import { TimeEntryStatusBadge } from "./TimeEntryStatusBadge";
import { TimesheetFilters } from "./TimesheetFilters";
import {
  TimeEntryForm,
  type TimeEntryFormProject,
  type TimeEntryFormValue,
} from "./TimeEntryForm";

const WEEKLY_TARGET = 40;

/** Demo-mode projects a consultant may log to (not closed). */
const demoProjects: TimeEntryFormProject[] = allProjects
  .filter((p) => p.status !== "CLOSED")
  .map((p) => ({ id: p.id, name: p.name, clientName: p.client.name }));

/** Project id -> status, for the demo project-status filter. */
const demoProjectStatus = new Map(allProjects.map((p) => [p.id, p.status]));

/**
 * Apply the operational filters to a week's rows in DEMO mode, mirroring the
 * server-side reduction + ordering of `getWeekForConsultant`. Pure: returns a
 * new week object so the original mock is never mutated.
 */
function applyDemoFilter(
  week: TimesheetWeek,
  filter: TimesheetFilter,
): TimesheetWeek {
  const rows = week.rows.filter((row) => {
    if (filter.status && row.status !== filter.status) return false;
    if (filter.activity && row.activity !== filter.activity) return false;
    if (filter.billable !== undefined && row.billable !== filter.billable) {
      return false;
    }
    if (filter.projectId && row.projectId !== filter.projectId) return false;
    if (
      filter.projectStatus &&
      demoProjectStatus.get(row.projectId) !== filter.projectStatus
    ) {
      return false;
    }
    return true;
  });

  const sort = filter.sort ?? "project";
  const direction = filter.direction ?? "asc";
  const factor = direction === "desc" ? -1 : 1;
  const keyOf = (row: TimesheetWeek["rows"][number]): string => {
    switch (sort) {
      case "activity":
        return activityLabelOf(row.activity);
      case "status":
        return row.status;
      case "date": {
        const idx = row.hours.findIndex((h) => h > 0);
        return String(idx < 0 ? 99 : idx).padStart(2, "0");
      }
      case "project":
      default:
        return row.projectName;
    }
  };
  const sorted = [...rows].sort((a, b) => {
    const primary = keyOf(a).localeCompare(keyOf(b), "pt-BR") * factor;
    if (primary !== 0) return primary;
    return (
      a.projectName.localeCompare(b.projectName, "pt-BR") ||
      activityLabelOf(a.activity).localeCompare(
        activityLabelOf(b.activity),
        "pt-BR",
      ) ||
      a.status.localeCompare(b.status)
    );
  });

  return { ...week, rows: sorted };
}

export interface TimesheetWeekViewProps {
  /**
   * "demo": no database configured — all mutations stay in local state.
   * "db": data comes from Prisma and mutations call the server actions.
   */
  mode: "demo" | "db";
  /** db mode: the week loaded on the server. */
  week?: TimesheetWeek;
  /** db mode: projects with an active allocation in the week. */
  projects?: TimeEntryFormProject[];
  /**
   * Current filter values (Rodada 4.2). In db mode these are applied on the
   * server and reflected back in the filter form; in demo mode they seed the
   * client-side local filter state.
   */
  filter?: TimesheetFilter;
  /** demo mode: override the navigable weeks (mainly for tests). */
  weeks?: TimesheetWeek[];
  /** demo mode: index of the week shown first. */
  initialIndex?: number;
}

/**
 * Weekly time-entry grid (Playful Productivity center per the visual identity).
 *
 * In db mode every mutation goes through the Horas server actions and the
 * server re-renders the route (revalidatePath); week navigation is
 * server-driven via `?semana=`. Demo mode keeps the original local-state
 * behavior so the app works without a database.
 */
export function TimesheetWeekView(props: TimesheetWeekViewProps) {
  const isDemo = props.mode === "demo";
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [localWeeks, setLocalWeeks] = useState<TimesheetWeek[]>(() =>
    (props.weeks ?? timesheetWeeks).map(cloneWeek),
  );
  const [index, setIndex] = useState(props.initialIndex ?? DEFAULT_WEEK_INDEX);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<TimeEntryRowData | null>(null);
  const [editInitial, setEditInitial] = useState<TimeEntryFormValue | null>(null);
  const { feedback, notify } = useFeedback();
  const idCounter = useRef(0);

  // Demo mode applies the SAME filters client-side; db mode receives an
  // already-filtered week from the server (query string is the source of truth).
  const [demoFilter, setDemoFilter] = useState<TimesheetFilter>(
    props.filter ?? {},
  );
  const activeFilter = isDemo ? demoFilter : (props.filter ?? {});

  const rawWeek = isDemo ? localWeeks[index] : (props.week as TimesheetWeek);
  const week = useMemo(
    () => (isDemo ? applyDemoFilter(rawWeek, demoFilter) : rawWeek),
    [isDemo, rawWeek, demoFilter],
  );
  const dbProjects = props.projects ?? [];
  const formProjects = isDemo ? demoProjects : dbProjects;
  // Demo project dropdown: narrow by the chosen project status (db mode gets the
  // already-narrowed list from the server via listAllowedProjects).
  const demoFilterProjects = useMemo(() => {
    if (!demoFilter.projectStatus) return demoProjects;
    const allowed = new Set(
      allProjects
        .filter((p) => p.status === demoFilter.projectStatus)
        .map((p) => p.id),
    );
    return demoProjects.filter((p) => allowed.has(p.id));
  }, [demoFilter.projectStatus]);
  const filterProjects = isDemo ? demoFilterProjects : dbProjects;
  const counts = useMemo(() => statusCounts(week), [week]);
  const total = useMemo(() => weekTotal(week), [week]);

  /** Immutably update the currently displayed week (demo mode only). */
  function updateWeek(fn: (w: TimesheetWeek) => TimesheetWeek) {
    setLocalWeeks((prev) => prev.map((w, i) => (i === index ? fn(w) : w)));
  }

  function navigate(delta: number) {
    if (isDemo) {
      const target = index + delta;
      if (target < 0 || target >= localWeeks.length) {
        notify("info", "Não há mais semanas disponíveis nesta demonstração.");
        return;
      }
      setIndex(target);
      return;
    }
    const start = parseIsoDateUtc(week.startDate);
    if (!start) return;
    const target = toIsoDate(addDays(start, delta * 7));
    router.push(`/app/horas?semana=${target}`);
  }

  /** "Ir para data": jump to the week containing the chosen date. */
  function goToDate(isoDate: string) {
    const parsed = parseIsoDateUtc(isoDate);
    if (!parsed) return;
    const target = toIsoDate(weekStartOf(parsed));
    if (isDemo) {
      const found = localWeeks.findIndex((w) => w.startDate === target);
      if (found === -1) {
        notify("info", "Esta semana não está disponível na demonstração.");
        return;
      }
      setIndex(found);
      return;
    }
    router.push(`/app/horas?semana=${target}`);
  }

  function dayIndexOf(date: string): number {
    return week.days.findIndex((d) => d.date === date);
  }

  function openNew() {
    setEditingRow(null);
    setEditInitial(null);
    setFormOpen(true);
  }

  function openEdit(row: TimeEntryRowData) {
    const dayIndex = Math.max(
      0,
      row.hours.findIndex((h) => h > 0),
    );
    setEditingRow(row);
    setEditInitial({
      projectId: row.projectId,
      activity: row.activity,
      date: week.days[dayIndex]?.date ?? week.startDate,
      hours: row.hours[dayIndex] ?? 0,
      description: row.description ?? "",
      billable: row.billable,
    });
    setFormOpen(true);
  }

  function handleSubmitEntry(value: TimeEntryFormValue) {
    if (isDemo) {
      handleSubmitEntryDemo(value);
      return;
    }
    startTransition(async () => {
      const dayIndex = dayIndexOf(value.date);
      const existingId = editingRow?.entryIds?.[dayIndex] ?? null;
      const result = existingId
        ? await updateTimeEntry({
            id: existingId,
            hours: value.hours,
            description: value.description,
            billable: value.billable,
            date: value.date,
          })
        : await createTimeEntry({
            projectId: editingRow?.projectId ?? value.projectId,
            // New entries only: the activity comes from the canonical-only
            // select. The server re-validates the catalog on write.
            activityType: (editingRow?.activity ??
              value.activity) as ActivityType,
            date: value.date,
            hours: value.hours,
            description: value.description,
            billable: value.billable,
          });
      if (result.ok) {
        setFormOpen(false);
        notify(
          "success",
          existingId
            ? "Lançamento atualizado como rascunho."
            : "Lançamento salvo como rascunho.",
        );
      } else {
        notify("warning", result.message);
      }
    });
  }

  function handleDeleteEntry(value: TimeEntryFormValue) {
    if (isDemo || !editingRow) return;
    const entryId = editingRow.entryIds?.[dayIndexOf(value.date)] ?? null;
    if (!entryId) {
      notify("info", "Não há lançamento salvo neste dia para excluir.");
      return;
    }
    startTransition(async () => {
      const result = await deleteTimeEntry({ id: entryId });
      if (result.ok) {
        setFormOpen(false);
        notify("success", "Lançamento excluído.");
      } else {
        notify("warning", result.message);
      }
    });
  }

  function handleSubmitEntryDemo(value: TimeEntryFormValue) {
    const project = formProjects.find((p) => p.id === value.projectId);
    if (!project) return;
    const valueDayIndex = Math.max(0, dayIndexOf(value.date));
    const editingRowId = editingRow?.id ?? null;

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
                  i === valueDayIndex ? value.hours : h,
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
                    i === valueDayIndex ? value.hours : h,
                  ),
                }
              : r,
          );
        } else {
          idCounter.current += 1;
          const hours = Array.from({ length: w.days.length }, (_, i) =>
            i === valueDayIndex ? value.hours : 0,
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
    if (!isDemo) {
      startTransition(async () => {
        const result = await copyPreviousWeekAction({
          weekStart: week.startDate,
        });
        if (!result.ok) {
          notify("warning", result.message);
          return;
        }
        const { copied, skippedExisting, skippedIneligible } = result.data;
        if (copied === 0 && skippedExisting === 0 && skippedIneligible === 0) {
          notify(
            "info",
            "A semana anterior não tem lançamentos elegíveis para cópia.",
          );
          return;
        }
        const parts = [`${copied} lançamento(s) copiado(s)`];
        if (skippedExisting > 0) {
          parts.push(`${skippedExisting} já existia(m) na semana`);
        }
        if (skippedIneligible > 0) {
          parts.push(
            `${skippedIneligible} sem alocação ativa ou com projeto encerrado`,
          );
        }
        notify(copied > 0 ? "success" : "info", `${parts.join(" · ")}.`);
      });
      return;
    }

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
    if (!isDemo) {
      startTransition(async () => {
        const result = await submitWeekAction({ weekStart: week.startDate });
        if (result.ok) {
          notify(
            "success",
            `${result.data.submitted} lançamento(s) enviado(s) para aprovação.`,
          );
        } else {
          notify("warning", result.message);
        }
      });
      return;
    }

    // Submit acts on the whole week, not just the filtered view: a hidden
    // draft must still be sent. Read from the unfiltered local week.
    const submittable = rawWeek.rows.filter(
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
      {isDemo ? (
        <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          <span>
            Modo demonstração: banco não configurado. Nada será persistido.
          </span>
        </div>
      ) : null}

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
            disabled={isPending}
            onClick={copyPreviousWeek}
          >
            Copiar semana anterior
          </ActionButton>
          <ActionButton
            variant="primary"
            size="sm"
            icon={Plus}
            disabled={isPending}
            onClick={openNew}
          >
            Novo lançamento
          </ActionButton>
        </div>
      </div>

      <FeedbackBanner message={feedback} />

      <div className="flex flex-wrap items-center gap-2">
        {(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CLOSED"] as const).map(
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

      <TimesheetFilters
        mode={props.mode}
        weekStart={week.startDate}
        filter={activeFilter}
        projects={filterProjects}
        onChange={isDemo ? setDemoFilter : undefined}
        onClear={isDemo ? () => setDemoFilter({}) : undefined}
        onPickDate={goToDate}
      />

      {hasActiveTimesheetFilter(activeFilter) ? (
        <p className="text-xs font-medium text-soft">
          Filtros ativos: a grade mostra apenas os lançamentos correspondentes.
        </p>
      ) : null}

      <SectionPanel
        title="Lançamentos da semana"
        description="Horas por projeto, atividade e dia."
        action={
          <ActionButton
            variant="primary"
            size="sm"
            icon={Send}
            disabled={isPending}
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
        onDelete={!isDemo && editingRow ? handleDeleteEntry : undefined}
        busy={isPending}
      />
    </div>
  );
}
