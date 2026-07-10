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
  attachTimeEntryFile,
  copyPreviousWeek as copyPreviousWeekAction,
  applyTimesheetDefault as applyTimesheetDefaultAction,
  createWeeklyTimeEntries,
  createTimeEntry,
  deleteTimeEntry,
  getTimeEntryAttachmentUrl,
  removeTimeEntryAttachment,
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
  type DayClock,
  type TimeEntryAttachmentMeta,
  type TimeEntryRow as TimeEntryRowData,
  type TimeEntryStatus,
  type TimesheetWeek,
} from "@/lib/timesheet/types";
import {
  addDays,
  parseIsoDateUtc,
  toIsoDate,
  weekLabel,
  weekStartOf,
} from "@/lib/timesheet/week";
import {
  hasActiveTimesheetFilter,
  type TimesheetFilter,
} from "@/lib/timesheet/filters";
import {
  EMPTY_HOLIDAY_LOOKUP,
  resolveGlobalHoliday,
  type HolidayLookup,
} from "@/lib/timesheet/holidays";
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
  type TimeEntryAttachmentIntent,
  type TimeEntryFormProject,
  type TimeEntryFormValue,
} from "./TimeEntryForm";
import {
  ClockFields,
  clockFromStored,
  clockHours,
  emptyClock,
  type ClockFieldsValue,
} from "./ClockFields";

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
  .map((p) => ({
    id: p.id,
    name: p.name,
    clientId: p.client.id,
    clientName: p.client.name,
  }));

/** Project id -> status, for the demo project-status filter. */
const demoProjectStatus = new Map(allProjects.map((p) => [p.id, p.status]));

/** Project id -> client id, for the demo client filter. */
const demoProjectClient = new Map(allProjects.map((p) => [p.id, p.client.id]));

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
      filter.clientId &&
      demoProjectClient.get(row.projectId) !== filter.clientId
    ) {
      return false;
    }
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
   * db mode: project-aware holiday lookup for the visible week. Drives the
   * holiday markers on the grid (global on the header, project-scoped on each
   * row) and the "Dia Útil em feriado" confirmation in the entry form. Absent
   * in demo mode (no database) → no markers/confirmation.
   */
  holidays?: HolidayLookup;
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
  /**
   * db mode: whether to offer the "Exportar CSV" action. Hidden for
   * consultant-only users (no role beyond CONSULTANT).
   */
  canExportCsv?: boolean;
  /**
   * Whether the user may see/edit "Faturável" (Onda B). Determined server-side
   * (papel de gestão). Consultores puros não veem o controle nem o rótulo
   * "(não faturável)". Default `true` (demo/gestão) preserva o comportamento.
   */
  canEditBillable?: boolean;
  /**
   * db mode: object storage está configurado, habilitando o anexo opcional do
   * lançamento (melhoria #2). Default `false` (demo/sem storage).
   */
  attachmentsAvailable?: boolean;
}

export interface TimesheetDefaultOption extends TimeEntryFormProject {
  allocationId: string;
  defaultConfig: {
    activityType: string;
    hoursPerDay: number;
    weekdays: number[];
    billable: boolean;
    description: string;
    startTime: string | null;
    breakStart: string | null;
    breakEnd: string | null;
    endTime: string | null;
  } | null;
}

interface TimesheetDefaultFormValue {
  allocationId: string;
  activityType: ActivityType;
  clock: ClockFieldsValue;
  weekdays: number[];
  billable: boolean;
  description: string;
}

/** Build the clock value used by the weekly-default form from a stored config. */
function defaultClock(
  config: TimesheetDefaultOption["defaultConfig"],
): ClockFieldsValue {
  if (!config || !config.startTime || !config.endTime) {
    return { ...emptyClock };
  }
  return clockFromStored(config);
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

interface PeriodWeekRow {
  /** Monday (ISO) — the navigation target. */
  start: string;
  label: string;
  totalHours: number;
  statuses: TimeEntryStatus[];
  /** Whether this is the week currently open in the grid. */
  current: boolean;
}

/** Group the period's days into Monday→Sunday weeks for the clickable list. */
function groupPeriodWeeks(
  period: TimesheetPeriodOverview,
  currentWeekStart: string,
): PeriodWeekRow[] {
  const byWeek = new Map<
    string,
    { start: string; totalHours: number; statuses: Set<TimeEntryStatus> }
  >();
  for (const day of period.days) {
    const parsed = parseIsoDateUtc(day.date);
    if (!parsed) continue;
    const monday = toIsoDate(weekStartOf(parsed));
    let week = byWeek.get(monday);
    if (!week) {
      week = { start: monday, totalHours: 0, statuses: new Set() };
      byWeek.set(monday, week);
    }
    week.totalHours += day.totalHours;
    for (const status of day.statuses) week.statuses.add(status);
  }
  return [...byWeek.values()]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((week) => {
      const start = parseIsoDateUtc(week.start)!;
      return {
        start: week.start,
        label: weekLabel(start),
        totalHours: week.totalHours,
        statuses: [...week.statuses],
        current: week.start === currentWeekStart,
      };
    });
}

const STATUS_LEGEND = (
  <div className="flex flex-wrap gap-2 pt-1">
    {(["SUBMITTED", "APPROVED", "REJECTED", "DRAFT", "CLOSED"] as const).map(
      (status) => (
        <span key={status} className="flex items-center gap-1 text-xs text-soft">
          <span
            className={cn("size-2 rounded-full border", statusToneClass[status])}
          />
          {timeEntryStatusLabels[status]}
        </span>
      ),
    )}
  </div>
);

function PeriodSummaryColumn({ period }: { period: TimesheetPeriodOverview }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase text-soft">Total</p>
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
          <p className="text-sm text-soft">Sem horas no período.</p>
        )}
      </div>
      {STATUS_LEGEND}
    </div>
  );
}

function PeriodOverview({
  period,
  currentWeekStart,
  onSelectWeek,
}: {
  period: TimesheetPeriodOverview;
  currentWeekStart: string;
  /** Navigate to (and open) the week starting on the given Monday. */
  onSelectWeek: (mondayIso: string) => void;
}) {
  const kind = periodKind(period.days.length);

  // Multi-week period (the monthly default): show the weeks of the period as
  // clickable rows — clicking opens that week in the grid for logging.
  if (kind !== "week") {
    const weeks = groupPeriodWeeks(period, currentWeekStart);
    return (
      <SectionPanel
        title="Resumo do período"
        description={`${period.startDate} a ${period.endDate} · Semanas do período`}
      >
        <div className="grid gap-4 px-5 py-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <PeriodSummaryColumn period={period} />
          <ul className="space-y-2">
            {weeks.map((week) => {
              const dominant = week.statuses[0] ?? "DRAFT";
              return (
                <li key={week.start}>
                  <button
                    type="button"
                    onClick={() => onSelectWeek(week.start)}
                    aria-current={week.current ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition hover:border-ink",
                      week.current
                        ? "border-ink bg-marker/40 text-strong"
                        : "border-border bg-surface text-medium",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full border",
                          week.totalHours > 0
                            ? statusToneClass[dominant]
                            : "border-border bg-surface",
                        )}
                      />
                      <span className="font-medium">{week.label}</span>
                      {week.current ? (
                        <span className="text-xs text-soft">(semana atual)</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-strong">
                      {week.totalHours > 0 ? formatHours(week.totalHours) : "–"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </SectionPanel>
    );
  }

  return (
    <SectionPanel
      title="Resumo do período"
      description={`${period.startDate} a ${period.endDate} · Semana`}
    >
      <div className="grid gap-4 px-5 py-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <PeriodSummaryColumn period={period} />
        <div className="grid grid-cols-7 gap-1">
          {period.days.map((day) => {
            const dominant = day.entries[0]?.status ?? "DRAFT";
            const entriesTitle =
              day.entries.length > 0
                ? day.entries
                    .map(
                      (entry) =>
                        `${entry.projectName}: ${formatHours(entry.hours)} · ${entry.activityLabel} · ${entry.status}`,
                    )
                    .join("\n")
                : "Sem lançamentos";
            const title = day.holidayName
              ? `Feriado: ${day.holidayName}\n${entriesTitle}`
              : entriesTitle;
            return (
              <div
                key={day.date}
                title={title}
                className={cn(
                  "min-h-14 rounded-md border px-2 py-1 text-xs",
                  day.totalHours > 0
                    ? statusToneClass[dominant]
                    : "border-border bg-surface text-soft",
                  day.holidayName && "ring-1 ring-inset ring-warning/40",
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold">{day.date.slice(8, 10)}</span>
                  <span className="tabular-nums">
                    {day.totalHours > 0 ? formatHours(day.totalHours) : "-"}
                  </span>
                </div>
                {day.holidayName ? (
                  <p className="mt-1 truncate text-[10px] font-medium text-warning">
                    Feriado
                  </p>
                ) : null}
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
    clock: defaultClock(option?.defaultConfig ?? null),
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
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyDescription, setCopyDescription] = useState("");
  const [editingRow, setEditingRow] = useState<TimeEntryRowData | null>(null);
  const [editInitial, setEditInitial] = useState<TimeEntryFormValue | null>(null);
  // Anexo persistido do lançamento sendo editado (melhoria #2), passado ao form.
  const [editAttachment, setEditAttachment] =
    useState<TimeEntryAttachmentMeta | null>(null);
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
  // Project-aware holiday lookup (empty in demo mode → no markers/confirmation).
  const holidays = props.holidays ?? EMPTY_HOLIDAY_LOOKUP;
  // "Faturável" só é visível/editável para gestão (server-side); default true
  // preserva demo/gestão. Anexo depende de storage configurado (db only).
  const canEditBillable = props.canEditBillable ?? true;
  const attachmentsAvailable = !isDemo && (props.attachmentsAvailable ?? false);
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

  /** Open the week starting on the given Monday (from the period week list). */
  function goToWeek(mondayIso: string) {
    const parsed = parseIsoDateUtc(mondayIso);
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
    setEditAttachment(null);
    setFormOpen(true);
  }

  /**
   * Abre o anexo de um lançamento em nova aba via URL assinada (melhoria #2).
   * A aba é aberta SINCRONAMENTE no clique para escapar do popup blocker (a URL
   * só é resolvida depois, no servidor). Gotcha: `window.open(..., "noopener")`
   * retorna `null` nos navegadores, então mantemos a referência e cortamos o
   * `opener` manualmente (equivalente a noopener, anti-tabnabbing).
   */
  function openAttachment(entryId: string) {
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    startTransition(async () => {
      const result = await getTimeEntryAttachmentUrl({ id: entryId });
      if (result.ok) {
        if (popup) popup.location.href = result.data.url;
        else window.open(result.data.url, "_blank", "noopener,noreferrer");
      } else {
        if (popup) popup.close();
        notify("warning", result.message);
      }
    });
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
      clock: defaultClock(option?.defaultConfig ?? null),
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

  function defaultClockPayload() {
    const { clock } = defaultValue;
    return {
      startTime: clock.startTime,
      endTime: clock.endTime,
      breakStart: clock.hasBreak ? clock.breakStart : null,
      breakEnd: clock.hasBreak ? clock.breakEnd : null,
    };
  }

  function validateDefaultForm(): string | null {
    if (!defaultValue.allocationId) return "Selecione uma alocação.";
    if (clockHours(defaultValue.clock) === null) {
      return "Informe horários válidos (Início, Saída e pausa).";
    }
    if (defaultValue.weekdays.length === 0) {
      return "Selecione ao menos um dia.";
    }
    if (defaultValue.description.trim().length === 0) {
      return "Descrição é obrigatória.";
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
        ...defaultClockPayload(),
        weekdays: defaultValue.weekdays,
        billable: defaultValue.billable,
        description: defaultValue.description,
      });
      if (result.ok) {
        router.refresh();
        notify("success", "Padrão semanal salvo.");
      } else {
        setDefaultError(result.message);
      }
    });
  }

  // Nota (Onda A-ext): a confirmação de "Dia Útil em feriado" vive no
  // TimeEntryForm (lançamento diário e semanal). Os ATALHOS DE GRADE
  // "Padrão da semana" (applyDefault) e "Copiar semana anterior"
  // (confirmCopyPreviousWeek) NÃO disparam essa confirmação — são ações em lote
  // que já explicitam o que criam/pulam nos toasts; ficam fora do escopo.
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
        ...defaultClockPayload(),
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
    const storedClock = row.clock?.[dayIndex] ?? null;
    setEditingRow(row);
    setEditAttachment(row.attachments?.[dayIndex] ?? null);
    setEditInitial({
      mode: "daily",
      projectId: row.projectId,
      activity: row.activity,
      date: week.days[dayIndex]?.date ?? week.startDate,
      clock:
        storedClock && storedClock.startTime && storedClock.endTime
          ? clockFromStored(storedClock)
          : { ...emptyClock },
      weekdays: [1, 2, 3, 4, 5],
      description: row.description ?? "",
      billable: row.billable,
      multiplier: row.multiplier ?? 1,
    });
    setFormOpen(true);
  }

  /**
   * Aplica a intenção de anexo (melhoria #2) após o lançamento ser salvo.
   * Reusa as server actions do fluxo de sobreaviso (upload em bucket privado +
   * remoção). Retorna a mensagem de falha (ou null em sucesso/no-op).
   */
  async function applyAttachmentIntent(
    entryId: string,
    attachment: TimeEntryAttachmentIntent | undefined,
  ): Promise<string | null> {
    if (!attachment) return null;
    if (attachment.kind === "upload") {
      const fd = new FormData();
      fd.set("id", entryId);
      fd.set("file", attachment.file);
      const result = await attachTimeEntryFile(fd);
      return result.ok ? null : result.message;
    }
    const result = await removeTimeEntryAttachment({ id: entryId });
    return result.ok ? null : result.message;
  }

  function handleSubmitEntry(
    value: TimeEntryFormValue,
    attachment?: TimeEntryAttachmentIntent,
  ) {
    if (isDemo) {
      // Demo não persiste nada: anexo é ignorado (sem storage).
      handleSubmitEntryDemo(value);
      return;
    }
    const clockPayload = {
      startTime: value.clock.startTime,
      endTime: value.clock.endTime,
      breakStart: value.clock.hasBreak ? value.clock.breakStart : null,
      breakEnd: value.clock.hasBreak ? value.clock.breakEnd : null,
    };
    startTransition(async () => {
      const dayIndex = dayIndexOf(value.date);
      const existingId = editingRow?.entryIds?.[dayIndex] ?? null;
      if (!editingRow && value.mode === "weekly") {
        const result = await createWeeklyTimeEntries({
          projectId: value.projectId,
          activityType: value.activity as ActivityType,
          weekStart: week.startDate,
          ...clockPayload,
          weekdays: value.weekdays,
          description: value.description,
          billable: value.billable,
          multiplier: value.multiplier,
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
            ...clockPayload,
            description: value.description,
            billable: value.billable,
            multiplier: value.multiplier,
            date: value.date,
          })
        : await createTimeEntry({
            projectId: editingRow?.projectId ?? value.projectId,
            // New entries only: the activity comes from the canonical-only
            // select. The server re-validates the catalog on write.
            activityType: (editingRow?.activity ??
              value.activity) as ActivityType,
            date: value.date,
            ...clockPayload,
            description: value.description,
            billable: value.billable,
            multiplier: value.multiplier,
          });
      if (result.ok) {
        setFormOpen(false);
        // Anexo é uma exceção opcional: aplicado APÓS o save, com o id retornado
        // (create/update devolvem o id do lançamento — inclusive no merge).
        const attachmentError = await applyAttachmentIntent(
          result.data.id,
          attachment,
        );
        // A complete entry enters approval as soon as it is saved (Rodada 4.3).
        const correctedRejection = existingId && editingRow?.status === "REJECTED";
        if (attachmentError) {
          notify(
            "warning",
            `Lançamento salvo, mas o anexo falhou: ${attachmentError}`,
          );
        } else {
          notify(
            "success",
            correctedRejection
              ? "Lançamento corrigido e reenviado para aprovação."
              : "Lançamento enviado para aprovação.",
          );
        }
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
    // Demo mirrors the server: hours are derived from the clock.
    const hoursValue = clockHours(value.clock) ?? 0;
    const cell: DayClock = {
      startTime: value.clock.startTime,
      endTime: value.clock.endTime,
      breakStart: value.clock.hasBreak ? value.clock.breakStart : null,
      breakEnd: value.clock.hasBreak ? value.clock.breakEnd : null,
    };
    const dayCount = week.days.length;
    const emptyClockArr = (): (DayClock | null)[] =>
      Array.from({ length: dayCount }, () => null);
    const applyClock = (existing: (DayClock | null)[] | undefined) => {
      const next = existing ? [...existing] : emptyClockArr();
      for (const i of targetIndexes) next[i] = cell;
      return next;
    };
    // A complete entry enters approval as soon as it is saved (Rodada 4.3):
    // demo rows mirror the db behavior and become SUBMITTED.
    const correctedRejection = editingRowId && editingRow?.status === "REJECTED";

    updateWeek((w) => {
      let rows = w.rows;

      if (editingRowId) {
        // Update the row being edited (DRAFT/REJECTED/SUBMITTED reach here).
        // Editing keeps/sets it SUBMITTED so it stays in the approval queue.
        rows = rows.map((r) =>
          r.id === editingRowId
            ? {
                ...r,
                status: "SUBMITTED" as const,
                description: value.description,
                billable: value.billable,
                multiplier: value.multiplier,
                hours: r.hours.map((h, i) =>
                  targetIndexes.includes(i) ? hoursValue : h,
                ),
                clock: applyClock(r.clock),
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
                  multiplier: value.multiplier,
                  hours: r.hours.map((h, i) =>
                    targetIndexes.includes(i) ? hoursValue : h,
                  ),
                  clock: applyClock(r.clock),
                }
              : r,
          );
        } else {
          idCounter.current += 1;
          const hours = Array.from({ length: dayCount }, (_, i) =>
            targetIndexes.includes(i) ? hoursValue : 0,
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
              multiplier: value.multiplier,
              status: "SUBMITTED",
              description: value.description || undefined,
              hours,
              clock: applyClock(undefined),
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

  function openCopyModal() {
    setCopyDescription("");
    setCopyOpen(true);
  }

  function confirmCopyPreviousWeek() {
    const description = copyDescription.trim();
    if (!isDemo) {
      startTransition(async () => {
        const result = await copyPreviousWeekAction({
          weekStart: week.startDate,
          description: description || undefined,
        });
        if (!result.ok) {
          notify("warning", result.message);
          return;
        }
        const { copied, skippedExisting, skippedIneligible } = result.data;
        setCopyOpen(false);
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
          // Single week-level description applied to every copied entry; blank
          // keeps the source description (mirrors the server action).
          description: description || row.description,
          hours: [...row.hours],
          clock: row.clock
            ? row.clock.map((cell) => (cell ? { ...cell } : null))
            : undefined,
        });
      }
      const next = { ...w, rows: [...w.rows, ...additions] };
      return { ...next, status: deriveWeekStatus(next) };
    });

    setCopyOpen(false);
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

        <div id="horas-periodo" className="flex flex-wrap items-center gap-2">
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
            onClick={openCopyModal}
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
            id="horas-novo"
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

      <div id="horas-status" className="flex flex-wrap items-center gap-2">
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
        canExportCsv={props.canExportCsv}
      />

      {hasActiveTimesheetFilter(activeFilter) ? (
        <p className="text-xs font-medium text-soft">
          Filtros ativos: a grade mostra apenas os lançamentos correspondentes.
        </p>
      ) : null}

      <PeriodOverview
        period={periodOverview}
        currentWeekStart={week.startDate}
        onSelectWeek={goToWeek}
      />

      <SectionPanel
        id="horas-grade"
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
                  {week.days.map((day) => {
                    // Cabeçalho: só feriados GLOBAIS (valem para toda a coluna).
                    // Feriados de projeto específico são marcados por célula.
                    const globalHoliday = resolveGlobalHoliday(
                      holidays,
                      day.date,
                    );
                    return (
                      <th
                        key={day.date}
                        scope="col"
                        title={
                          globalHoliday ? `Feriado: ${globalHoliday}` : undefined
                        }
                        className={cn(
                          "px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-soft",
                          day.weekend && "bg-surface-muted/40",
                          globalHoliday && "bg-warning-soft/60",
                        )}
                      >
                        {day.label}
                        {globalHoliday ? (
                          <span className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-warning">
                            Feriado
                          </span>
                        ) : null}
                      </th>
                    );
                  })}
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
                    holidays={holidays}
                    onEdit={openEdit}
                    canEditBillable={canEditBillable}
                    onOpenAttachment={
                      attachmentsAvailable ? openAttachment : undefined
                    }
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
        holidays={holidays}
        initial={editInitial}
        onSubmit={handleSubmitEntry}
        onDelete={!isDemo && editingRow ? handleDeleteEntry : undefined}
        busy={isPending}
        canEditBillable={canEditBillable}
        attachmentsAvailable={attachmentsAvailable}
        initialAttachment={editAttachment}
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

          <fieldset>
            <legend className="mb-1 block text-xs font-semibold text-medium">
              Horários
            </legend>
            <ClockFields
              value={defaultValue.clock}
              onChange={(clock) =>
                setDefaultValue((value) => ({ ...value, clock }))
              }
              idPrefix="default"
            />
          </fieldset>

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
              Descrição padrão
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

          {/* "Faturável" do padrão semanal também é oculto para consultores
              puros (Onda B); o valor segue no submit (default true). */}
          {canEditBillable ? (
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
              Faturável
            </label>
          ) : null}

          <p className="text-xs text-soft">
            Prévia: {selectedDefaultOption()?.name ?? "alocação"} ·{" "}
            {activityLabels[defaultValue.activityType]} ·{" "}
            {formatHours(clockHours(defaultValue.clock) ?? 0)} nos dias
            selecionados. Lançamentos existentes serão pulados.
          </p>
        </div>
      </Modal>

      <Modal
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        title="Copiar semana anterior"
        description="Os lançamentos elegíveis da semana anterior entram em aprovação automaticamente. Edite a descrição de atividades da semana, se desejar."
        footer={
          <>
            <ActionButton
              variant="secondary"
              size="sm"
              disabled={isPending}
              onClick={() => setCopyOpen(false)}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              variant="primary"
              size="sm"
              icon={CopyPlus}
              disabled={isPending}
              onClick={confirmCopyPreviousWeek}
            >
              Copiar e salvar
            </ActionButton>
          </>
        }
      >
        <div className="space-y-2">
          <label
            htmlFor="copy-description"
            className="mb-1 block text-xs font-semibold text-medium"
          >
            Descrição de atividades da semana
          </label>
          <textarea
            id="copy-description"
            value={copyDescription}
            onChange={(event) => setCopyDescription(event.target.value)}
            rows={3}
            placeholder="Deixe em branco para manter a descrição de cada lançamento copiado."
            className={cn(inputClass, "resize-y")}
          />
          <p className="text-xs text-soft">
            Quando preenchida, esta descrição é aplicada a todos os lançamentos
            copiados.
          </p>
        </div>
      </Modal>
    </div>
  );
}
