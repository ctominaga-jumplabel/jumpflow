"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CalendarCheck,
  CopyPlus,
  Plus,
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
  applyTimesheetDefault as applyTimesheetDefaultAction,
  createWeeklyTimeEntries,
  createTimeEntry,
  deleteTimeEntry,
  saveTimesheetDefault as saveTimesheetDefaultAction,
  updateTimeEntry,
} from "@/app/app/horas/actions";
import type { TimesheetPeriodOverview } from "@/lib/db/timesheet";
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
import {
  activityLabelOf,
  activityLabels,
  activityOrder,
  type ActivityType,
} from "@/lib/timesheet/types";
import { focusRingInput } from "@/lib/styles";
import { Modal } from "@/components/ui/Modal";
import { TimeEntryRow } from "./TimeEntryRow";
import { TimeEntryStatusBadge } from "./TimeEntryStatusBadge";
import { TimesheetFilters } from "./TimesheetFilters";
import {
  TimeEntryForm,
  type TimeEntryFormProject,
  type TimeEntryFormValue,
} from "./TimeEntryForm";

const WEEKLY_TARGET = 40;
const WEEKDAY_OPTIONS = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sab" },
  { value: 7, label: "Dom" },
];

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
  /** db mode: aggregated overview for the selected filter period. */
  period?: TimesheetPeriodOverview;
  /** db mode: active allocations that can receive/apply a weekly default. */
  defaultOptions?: TimesheetDefaultOption[];
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

export interface TimesheetDefaultOption extends TimeEntryFormProject {
  allocationId: string;
  defaultConfig: {
    activityType: string;
    hoursPerDay: number;
    weekdays: number[];
    billable: boolean;
    description: string;
  } | null;
}

interface TimesheetDefaultFormValue {
  allocationId: string;
  activityType: ActivityType;
  hoursPerDay: string;
  weekdays: number[];
  billable: boolean;
  description: string;
}

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong placeholder:text-soft " +
  focusRingInput;

const statusToneClass = {
  DRAFT: "border-border bg-surface-muted text-medium",
  SUBMITTED: "border-info/30 bg-info-soft text-info",
  APPROVED: "border-success/30 bg-success-soft text-success",
  REJECTED: "border-danger/30 bg-danger-soft text-danger",
  CLOSED: "border-border bg-surface-muted text-strong",
} as const;

function periodKind(days: number): "week" | "month-weeks" | "months" {
  if (days <= 7) return "week";
  if (days <= 31) return "month-weeks";
  return "months";
}

function deriveDemoPeriod(week: TimesheetWeek): TimesheetPeriodOverview {
  const days = week.days.map((day, index) => {
    const entries = week.rows
      .filter((row) => row.hours[index] > 0)
      .map((row) => ({
        id: row.id,
        date: day.date,
        projectName: row.projectName,
        activityLabel: activityLabelOf(row.activity),
        hours: row.hours[index],
        status: row.status,
      }));
    return {
      date: day.date,
      totalHours: entries.reduce((sum, entry) => sum + entry.hours, 0),
      statuses: entries.map((entry) => entry.status),
      entries,
    };
  });
  const projectTotals = week.rows
    .map((row) => ({
      projectId: row.projectId,
      projectName: row.projectName,
      clientName: row.clientName,
      totalHours: row.hours.reduce((sum, hours) => sum + hours, 0),
    }))
    .filter((row) => row.totalHours > 0)
    .sort((a, b) => b.totalHours - a.totalHours);

  return {
    startDate: week.startDate,
    endDate: week.endDate,
    totalHours: weekTotal(week),
    projectTotals,
    days,
  };
}

function PeriodOverview({ period }: { period: TimesheetPeriodOverview }) {
  const kind = periodKind(period.days.length);
  const columns =
    kind === "week"
      ? "grid-cols-7"
      : kind === "month-weeks"
        ? "grid-cols-7"
        : "grid-cols-7 md:grid-cols-10";
  const groupedLabel =
    kind === "months"
      ? "Calendario mensal"
      : kind === "month-weeks"
        ? "Semanas do periodo"
        : "Semana";

  return (
    <SectionPanel
      title="Resumo do periodo"
      description={`${period.startDate} a ${period.endDate} · ${groupedLabel}`}
    >
      <div className="grid gap-4 px-5 py-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase text-soft">
              Total
            </p>
            <p className="text-2xl font-semibold text-strong">
              {formatHours(period.totalHours)}
            </p>
          </div>
          <div className="space-y-2">
            {period.projectTotals.length > 0 ? (
              period.projectTotals.map((project, index) => (
                <div
                  key={`${project.projectId}-${index}`}
                  className="flex items-center justify-between gap-3 text-sm"
                  title={`${project.projectName} · ${project.clientName}`}
                >
                  <span className="min-w-0 truncate text-medium">
                    {project.projectName}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-strong">
                    {formatHours(project.totalHours)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-soft">Sem horas no periodo.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {(["SUBMITTED", "APPROVED", "REJECTED", "DRAFT", "CLOSED"] as const).map(
              (status) => (
                <span key={status} className="flex items-center gap-1 text-xs text-soft">
                  <span
                    className={cn(
                      "size-2 rounded-full border",
                      statusToneClass[status],
                    )}
                  />
                  {timeEntryStatusLabels[status]}
                </span>
              ),
            )}
          </div>
        </div>

        <div className={cn("grid gap-1", columns)}>
          {period.days.map((day) => {
            const dominant = day.entries[0]?.status ?? "DRAFT";
            const title =
              day.entries.length > 0
                ? day.entries
                    .map(
                      (entry) =>
                        `${entry.projectName}: ${formatHours(entry.hours)} · ${entry.activityLabel} · ${entry.status}`,
                    )
                    .join("\n")
                : "Sem lancamentos";
            return (
              <div
                key={day.date}
                title={title}
                className={cn(
                  "min-h-14 rounded-md border px-2 py-1 text-xs",
                  day.totalHours > 0
                    ? statusToneClass[dominant]
                    : "border-border bg-surface text-soft",
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold">{day.date.slice(8, 10)}</span>
                  <span className="tabular-nums">
                    {day.totalHours > 0 ? formatHours(day.totalHours) : "-"}
                  </span>
                </div>
                {day.entries.length > 0 ? (
                  <p className="mt-1 truncate text-[11px]">
                    {day.entries[0].projectName}
                    {day.entries.length > 1 ? ` +${day.entries.length - 1}` : ""}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </SectionPanel>
  );
}

function defaultFormValue(
  options: TimesheetDefaultOption[],
): TimesheetDefaultFormValue {
  const option = options[0];
  return {
    allocationId: option?.allocationId ?? "",
    activityType: (option?.defaultConfig?.activityType ?? "WORKDAY") as ActivityType,
    hoursPerDay: option?.defaultConfig?.hoursPerDay
      ? String(option.defaultConfig.hoursPerDay)
      : "8",
    weekdays: option?.defaultConfig?.weekdays?.length
      ? option.defaultConfig.weekdays
      : [1, 2, 3, 4, 5],
    billable: option?.defaultConfig?.billable ?? true,
    description: option?.defaultConfig?.description ?? "",
  };
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
  const [defaultOpen, setDefaultOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<TimeEntryRowData | null>(null);
  const [editInitial, setEditInitial] = useState<TimeEntryFormValue | null>(null);
  const [defaultValue, setDefaultValue] = useState<TimesheetDefaultFormValue>(() =>
    defaultFormValue(props.defaultOptions ?? []),
  );
  const [defaultError, setDefaultError] = useState<string | null>(null);
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
  const defaultOptions = props.defaultOptions ?? [];
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
  const periodOverview = useMemo(
    () => props.period ?? deriveDemoPeriod(week),
    [props.period, week],
  );

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

  function openDefault() {
    setDefaultValue(defaultFormValue(defaultOptions));
    setDefaultError(null);
    setDefaultOpen(true);
  }

  function selectedDefaultOption() {
    return defaultOptions.find((option) => option.allocationId === defaultValue.allocationId);
  }

  function handleDefaultAllocationChange(allocationId: string) {
    const option = defaultOptions.find((item) => item.allocationId === allocationId);
    setDefaultValue({
      allocationId,
      activityType: (option?.defaultConfig?.activityType ?? "WORKDAY") as ActivityType,
      hoursPerDay: option?.defaultConfig?.hoursPerDay
        ? String(option.defaultConfig.hoursPerDay)
        : "8",
      weekdays: option?.defaultConfig?.weekdays?.length
        ? option.defaultConfig.weekdays
        : [1, 2, 3, 4, 5],
      billable: option?.defaultConfig?.billable ?? true,
      description: option?.defaultConfig?.description ?? "",
    });
    setDefaultError(null);
  }

  function toggleDefaultWeekday(day: number) {
    setDefaultValue((value) => {
      const hasDay = value.weekdays.includes(day);
      const weekdays = hasDay
        ? value.weekdays.filter((item) => item !== day)
        : [...value.weekdays, day].sort((a, b) => a - b);
      return { ...value, weekdays };
    });
  }

  function parsedDefaultHours(): number {
    return Number(defaultValue.hoursPerDay.replace(",", "."));
  }

  function validateDefaultForm(): string | null {
    const hours = parsedDefaultHours();
    if (!defaultValue.allocationId) return "Selecione uma alocacao.";
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      return "Informe horas entre 0 e 24.";
    }
    if (defaultValue.weekdays.length === 0) {
      return "Selecione ao menos um dia.";
    }
    return null;
  }

  function saveDefault() {
    const error = validateDefaultForm();
    if (error) {
      setDefaultError(error);
      return;
    }
    startTransition(async () => {
      const result = await saveTimesheetDefaultAction({
        allocationId: defaultValue.allocationId,
        activityType: defaultValue.activityType,
        hoursPerDay: parsedDefaultHours(),
        weekdays: defaultValue.weekdays,
        billable: defaultValue.billable,
        description: defaultValue.description,
      });
      if (result.ok) {
        router.refresh();
        notify("success", "Padrao semanal salvo.");
      } else {
        setDefaultError(result.message);
      }
    });
  }

  function applyDefault() {
    const error = validateDefaultForm();
    if (error) {
      setDefaultError(error);
      return;
    }
    startTransition(async () => {
      const saved = await saveTimesheetDefaultAction({
        allocationId: defaultValue.allocationId,
        activityType: defaultValue.activityType,
        hoursPerDay: parsedDefaultHours(),
        weekdays: defaultValue.weekdays,
        billable: defaultValue.billable,
        description: defaultValue.description,
      });
      if (!saved.ok) {
        setDefaultError(saved.message);
        return;
      }
      const result = await applyTimesheetDefaultAction({
        allocationId: defaultValue.allocationId,
        weekStart: week.startDate,
      });
      if (!result.ok) {
        setDefaultError(result.message);
        return;
      }
      const { created, skippedExisting, skippedOutOfAllocation, skippedNoDefault } =
        result.data;
      const parts = [`${created} lancamento(s) criado(s)`];
      if (skippedExisting > 0) parts.push(`${skippedExisting} ja existia(m)`);
      if (skippedOutOfAllocation > 0) {
        parts.push(`${skippedOutOfAllocation} fora da vigencia`);
      }
      if (skippedNoDefault > 0) parts.push("sem padrao configurado");
      router.refresh();
      setDefaultOpen(false);
      notify(created > 0 ? "success" : "info", `Padrao aplicado: ${parts.join(" · ")}.`);
    });
  }

  function openEdit(row: TimeEntryRowData) {
    const dayIndex = Math.max(
      0,
      row.hours.findIndex((h) => h > 0),
    );
    setEditingRow(row);
    setEditInitial({
      mode: "daily",
      projectId: row.projectId,
      activity: row.activity,
      date: week.days[dayIndex]?.date ?? week.startDate,
      hours: row.hours[dayIndex] ?? 0,
      weekdays: [1, 2, 3, 4, 5],
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
      if (!editingRow && value.mode === "weekly") {
        const result = await createWeeklyTimeEntries({
          projectId: value.projectId,
          activityType: value.activity as ActivityType,
          weekStart: week.startDate,
          hoursPerDay: value.hours,
          weekdays: value.weekdays,
          description: value.description,
          billable: value.billable,
        });
        if (result.ok) {
          setFormOpen(false);
          const { created, skippedExisting, skippedOutOfAllocation } =
            result.data;
          const parts = [`${created} lancamento(s) criado(s)`];
          if (skippedExisting > 0) parts.push(`${skippedExisting} ja existia(m)`);
          if (skippedOutOfAllocation > 0) {
            parts.push(`${skippedOutOfAllocation} fora da vigencia`);
          }
          notify(
            created > 0 ? "success" : "info",
            `Lancamento semanal: ${parts.join(" · ")}.`,
          );
        } else {
          notify("warning", result.message);
        }
        return;
      }
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
        // A complete entry enters approval as soon as it is saved (Rodada 4.3).
        const correctedRejection = existingId && editingRow?.status === "REJECTED";
        notify(
          "success",
          correctedRejection
            ? "Lançamento corrigido e reenviado para aprovação."
            : "Lançamento enviado para aprovação.",
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
    const targetIndexes =
      !editingRow && value.mode === "weekly"
        ? week.days
            .map((_, index) => index)
            .filter((index) => value.weekdays.includes(index + 1))
        : [valueDayIndex];
    const editingRowId = editingRow?.id ?? null;
    // A complete entry enters approval as soon as it is saved (Rodada 4.3):
    // demo rows mirror the db behavior and become SUBMITTED.
    const correctedRejection = editingRowId && editingRow?.status === "REJECTED";

    updateWeek((w) => {
      let rows = w.rows;

      if (editingRowId) {
        // Update the row being edited (only DRAFT/REJECTED reach here).
        rows = rows.map((r) =>
          r.id === editingRowId
            ? {
                ...r,
                status: "SUBMITTED" as const,
                description: value.description,
                billable: value.billable,
                hours: r.hours.map((h, i) =>
                  targetIndexes.includes(i) ? value.hours : h,
                ),
              }
            : r,
        );
      } else {
        // New entry: merge into an existing editable row for the same
        // project+activity, or create a fresh SUBMITTED row.
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
                  status: "SUBMITTED" as const,
                  description: value.description || r.description,
                  billable: value.billable,
                  hours: r.hours.map((h, i) =>
                    targetIndexes.includes(i) ? value.hours : h,
                  ),
                }
              : r,
          );
        } else {
          idCounter.current += 1;
          const hours = Array.from({ length: w.days.length }, (_, i) =>
            targetIndexes.includes(i) ? value.hours : 0,
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
              status: "SUBMITTED",
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
      correctedRejection
        ? "Lançamento corrigido e reenviado para aprovação (demo)."
        : "Lançamento enviado para aprovação (demo).",
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
        const parts = [`${copied} lançamento(s) copiado(s) e enviado(s) para aprovação`];
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
          // Copied entries carry hours: like a direct save they enter approval.
          status: "SUBMITTED",
          hours: [...row.hours],
        });
      }
      const next = { ...w, rows: [...w.rows, ...additions] };
      return { ...next, status: deriveWeekStatus(next) };
    });

    notify("success", "Lançamentos elegíveis copiados e enviados para aprovação (demo).");
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
          {!isDemo ? (
            <ActionButton
              variant="secondary"
              size="sm"
              icon={CalendarCheck}
              disabled={isPending || defaultOptions.length === 0}
              onClick={openDefault}
            >
              Padrao da semana
            </ActionButton>
          ) : null}
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

      <PeriodOverview period={periodOverview} />

      <SectionPanel
        title="Lançamentos da semana"
        description="Cada lançamento salvo entra em aprovação automaticamente."
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

      <Modal
        open={defaultOpen}
        onClose={() => setDefaultOpen(false)}
        title="Padrao da semana"
        description="Configure a alocacao e aplique nos dias selecionados desta semana."
        footer={
          <>
            <ActionButton
              variant="secondary"
              size="sm"
              disabled={isPending}
              onClick={() => setDefaultOpen(false)}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              variant="secondary"
              size="sm"
              disabled={isPending}
              onClick={saveDefault}
            >
              Salvar padrao
            </ActionButton>
            <ActionButton
              variant="primary"
              size="sm"
              icon={CalendarCheck}
              disabled={isPending}
              onClick={applyDefault}
            >
              Aplicar
            </ActionButton>
          </>
        }
      >
        <div className="space-y-4">
          {defaultError ? (
            <div className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
              {defaultError}
            </div>
          ) : null}

          <div>
            <label htmlFor="default-allocation" className="mb-1 block text-xs font-semibold text-medium">
              Alocacao
            </label>
            <select
              id="default-allocation"
              value={defaultValue.allocationId}
              onChange={(event) => handleDefaultAllocationChange(event.target.value)}
              className={inputClass}
            >
              {defaultOptions.map((option) => (
                <option key={option.allocationId} value={option.allocationId}>
                  {option.name} · {option.clientName}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="default-activity" className="mb-1 block text-xs font-semibold text-medium">
                Atividade
              </label>
              <select
                id="default-activity"
                value={defaultValue.activityType}
                onChange={(event) =>
                  setDefaultValue((value) => ({
                    ...value,
                    activityType: event.target.value as ActivityType,
                  }))
                }
                className={inputClass}
              >
                {activityOrder.map((activity) => (
                  <option key={activity} value={activity}>
                    {activityLabels[activity]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="default-hours" className="mb-1 block text-xs font-semibold text-medium">
                Horas por dia
              </label>
              <input
                id="default-hours"
                value={defaultValue.hoursPerDay}
                onChange={(event) =>
                  setDefaultValue((value) => ({
                    ...value,
                    hoursPerDay: event.target.value,
                  }))
                }
                inputMode="decimal"
                className={inputClass}
              />
            </div>
          </div>

          <fieldset>
            <legend className="mb-2 text-xs font-semibold text-medium">
              Dias aplicaveis
            </legend>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {WEEKDAY_OPTIONS.map((day) => (
                <label
                  key={day.value}
                  className={cn(
                    "flex h-9 cursor-pointer items-center justify-center rounded-md border text-xs font-semibold",
                    defaultValue.weekdays.includes(day.value)
                      ? "border-ink bg-marker text-ink"
                      : "border-border bg-surface text-medium",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={defaultValue.weekdays.includes(day.value)}
                    onChange={() => toggleDefaultWeekday(day.value)}
                    className="sr-only"
                  />
                  {day.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="default-description" className="mb-1 block text-xs font-semibold text-medium">
              Descricao padrao <span className="font-normal text-soft">(opcional)</span>
            </label>
            <textarea
              id="default-description"
              value={defaultValue.description}
              onChange={(event) =>
                setDefaultValue((value) => ({
                  ...value,
                  description: event.target.value,
                }))
              }
              rows={2}
              className={cn(inputClass, "resize-y")}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-medium">
            <input
              type="checkbox"
              checked={defaultValue.billable}
              onChange={(event) =>
                setDefaultValue((value) => ({
                  ...value,
                  billable: event.target.checked,
                }))
              }
              className="size-4 rounded border-border text-brand focus:ring-brand"
            />
            Faturavel
          </label>

          <p className="text-xs text-soft">
            Preview: {selectedDefaultOption()?.name ?? "alocacao"} ·{" "}
            {activityLabels[defaultValue.activityType]} · {defaultValue.hoursPerDay || "0"}h
            nos dias selecionados. Lancamentos existentes serao pulados.
          </p>
        </div>
      </Modal>
    </div>
  );
}
