/**
 * Mocked weekly timesheet for the "Horas" DEMO mode (no database configured).
 *
 * Round 2 moved the shared types and pure helpers to `@/lib/timesheet/types`
 * so the real (Prisma-backed) mode never imports mock modules. Everything is
 * re-exported here to keep existing imports working.
 */

import type { TimesheetWeek } from "@/lib/timesheet/types";

export {
  ACTIVITY_TYPES,
  activityLabels,
  activityLabelOf,
  activityOrder,
  cloneWeek,
  dayTotal,
  deriveWeekStatus,
  isActivityType,
  isRowCopyable,
  isRowEditable,
  rowTotal,
  statusCounts,
  timeEntryStatusLabels,
  weekTotal,
  type ActivityType,
  type TimeEntryRow,
  type TimeEntryStatus,
  type TimesheetWeek,
  type WeekDay,
} from "@/lib/timesheet/types";

/** Current mocked week (Mon 2026-06-08 → Sun 2026-06-14). */
export const currentWeek: TimesheetWeek = {
  label: "Semana 24 · 08–14 jun 2026",
  startDate: "2026-06-08",
  endDate: "2026-06-14",
  status: "DRAFT",
  days: [
    { label: "Seg", date: "2026-06-08", weekend: false },
    { label: "Ter", date: "2026-06-09", weekend: false },
    { label: "Qua", date: "2026-06-10", weekend: false },
    { label: "Qui", date: "2026-06-11", weekend: false },
    { label: "Sex", date: "2026-06-12", weekend: false },
    { label: "Sáb", date: "2026-06-13", weekend: true },
    { label: "Dom", date: "2026-06-14", weekend: true },
  ],
  rows: [
    {
      id: "te-1",
      projectId: "prj-atlas",
      projectName: "Atlas",
      clientName: "Vix Energia",
      activity: "WORKDAY",
      billable: true,
      status: "SUBMITTED",
      hours: [6, 6, 0, 0, 0, 0, 0],
    },
    {
      id: "te-2",
      projectId: "prj-atlas",
      projectName: "Atlas",
      clientName: "Vix Energia",
      activity: "ON_CALL",
      billable: true,
      status: "DRAFT",
      hours: [2, 1, 0, 0, 0, 0, 0],
    },
    {
      id: "te-3",
      projectId: "prj-orion",
      projectName: "Órion",
      clientName: "Banco Sul",
      activity: "WORKDAY",
      billable: true,
      status: "DRAFT",
      hours: [0, 1, 0, 0, 0, 0, 0],
    },
    {
      // Legacy activity code kept on purpose: proves the grid still renders a
      // readable label (Documentação) for pre-4.2 data via activityLabelOf.
      id: "te-4",
      projectId: "prj-vega",
      projectName: "Vega",
      clientName: "Loja Norte",
      activity: "DOCS",
      billable: false,
      status: "REJECTED",
      hours: [0, 0, 0, 0, 0, 0, 0],
    },
  ],
};

/** Previous mocked week (Mon 2026-06-01 → Sun 2026-06-07), already approved. */
export const previousWeek: TimesheetWeek = {
  label: "Semana 23 · 01–07 jun 2026",
  startDate: "2026-06-01",
  endDate: "2026-06-07",
  status: "APPROVED",
  days: [
    { label: "Seg", date: "2026-06-01", weekend: false },
    { label: "Ter", date: "2026-06-02", weekend: false },
    { label: "Qua", date: "2026-06-03", weekend: false },
    { label: "Qui", date: "2026-06-04", weekend: false },
    { label: "Sex", date: "2026-06-05", weekend: false },
    { label: "Sáb", date: "2026-06-06", weekend: true },
    { label: "Dom", date: "2026-06-07", weekend: true },
  ],
  rows: [
    {
      id: "te-prev-1",
      projectId: "prj-atlas",
      projectName: "Atlas",
      clientName: "Vix Energia",
      activity: "WORKDAY",
      billable: true,
      status: "APPROVED",
      description: "Evolução do módulo de faturamento.",
      hours: [8, 8, 8, 8, 8, 0, 0],
    },
    {
      id: "te-prev-2",
      projectId: "prj-orion",
      projectName: "Órion",
      clientName: "Banco Sul",
      activity: "ON_CALL",
      billable: true,
      status: "APPROVED",
      description: "Rituais ágeis e alinhamento com o cliente.",
      hours: [2, 2, 2, 2, 2, 0, 0],
    },
  ],
};

/** Next mocked week (Mon 2026-06-15 → Sun 2026-06-21), still empty. */
export const nextWeek: TimesheetWeek = {
  label: "Semana 25 · 15–21 jun 2026",
  startDate: "2026-06-15",
  endDate: "2026-06-21",
  status: "DRAFT",
  days: [
    { label: "Seg", date: "2026-06-15", weekend: false },
    { label: "Ter", date: "2026-06-16", weekend: false },
    { label: "Qua", date: "2026-06-17", weekend: false },
    { label: "Qui", date: "2026-06-18", weekend: false },
    { label: "Sex", date: "2026-06-19", weekend: false },
    { label: "Sáb", date: "2026-06-20", weekend: true },
    { label: "Dom", date: "2026-06-21", weekend: true },
  ],
  rows: [],
};

/** Ordered weeks available for navigation, current week in the middle. */
export const timesheetWeeks: TimesheetWeek[] = [
  previousWeek,
  currentWeek,
  nextWeek,
];

/** Index of the week shown by default (the current week). */
export const DEFAULT_WEEK_INDEX = 1;
