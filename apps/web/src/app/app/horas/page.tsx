import type { Metadata } from "next";
import { UserX } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { TimesheetWeekView } from "@/components/timesheet/TimesheetWeekView";
import { HorasConsultaPanel } from "@/components/timesheet/HorasConsultaPanel";
import { requireUser } from "@/lib/auth/guards";
import { hasRole } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  monthRangeOf,
  parseWeekParam,
} from "@/lib/timesheet/week";
import { parseTimesheetFilter } from "@/lib/timesheet/filters";
import {
  DEFAULT_PAGE_SIZE,
  hoursReportFilterSchema,
} from "@/lib/reports/schemas";

export const metadata: Metadata = { title: "Horas" };

type RawParams = Record<string, string | string[] | undefined>;

interface HorasPageProps {
  searchParams: Promise<RawParams>;
}

/** Roles that may consult other consultants' hours (read-only) on this screen. */
const MANAGER_ROLES = [
  "ADMIN",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "FINANCE",
] as const;

/** Flatten searchParams (first value wins) for Zod parsing. */
function flatten(params: RawParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    out[key] = Array.isArray(value) ? (value[0] ?? "") : value;
  }
  return out;
}

/**
 * Horas: weekly time entry. With a database, data comes from Prisma and the
 * week is selected via `?semana=` (server-driven). Without one, the original
 * demo (local state) keeps the screen usable, with an explicit banner.
 *
 * The screen is role-adaptive:
 * - a consultant (linked Consultant) gets the personal weekly editor, now with
 *   a Cliente filter and a CSV export of their own entries;
 * - a manager/admin/finance also gets a read-only, multi-consultant
 *   consultation panel (Cliente/Consultor filters, pagination, CSV) backed by
 *   the shared Relatorios pipeline, which enforces RBAC scope and financial
 *   masking server-side.
 */
export default async function HorasPage({ searchParams }: HorasPageProps) {
  const user = await requireUser();

  const header = (
    <PageHeader
      eyebrow="Operação"
      title="Horas"
      description="Lançamento semanal por projeto e atividade, com envio para aprovação."
    />
  );

  if (!isDatabaseConfigured()) {
    return (
      <div className="space-y-6">
        {header}
        <TimesheetWeekView mode="demo" />
      </div>
    );
  }

  // Lazy import so Prisma is never loaded on code paths without a database.
  const {
    getConsultantForUser,
    getPeriodForConsultant,
    getWeekForConsultant,
    listAllowedProjects,
    listTimesheetDefaultOptions,
  } = await import("@/lib/db/timesheet");

  const consultant = await getConsultantForUser(user);
  const isManager = hasRole(user, [...MANAGER_ROLES]);

  // A user who is neither a consultant nor a manager has nothing to show here.
  if (!consultant && !isManager) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={UserX}
          title="Sem vínculo de consultor"
          description="Seu usuário não está vinculado a um consultor. Contate um administrador."
        />
      </div>
    );
  }

  const params = await searchParams;

  // Personal weekly editor — only for users linked to a Consultant.
  let editor = null;
  if (consultant) {
    const weekStart = parseWeekParam(params.semana);
    // Safe fallback: an invalid filter value is dropped, defaults take over.
    const filter = parseTimesheetFilter(params);
    // Default period filter is the current calendar month (1st → last day).
    const defaultMonth = monthRangeOf();
    filter.startDate ??= defaultMonth.start;
    filter.endDate ??= defaultMonth.end;
    const periodStart = filter.startDate;
    const periodEnd = filter.endDate;
    const [week, period, projects, defaultOptions] = await Promise.all([
      getWeekForConsultant(consultant.id, weekStart, filter),
      getPeriodForConsultant(consultant.id, periodStart, periodEnd, filter),
      // The project dropdown lists the consultant's scope, narrowed by the
      // chosen project status so the options match the active filter.
      listAllowedProjects(consultant.id, weekStart, filter.projectStatus),
      listTimesheetDefaultOptions(consultant.id, weekStart),
    ]);
    editor = (
      <TimesheetWeekView
        mode="db"
        week={week}
        period={period}
        projects={projects}
        defaultOptions={defaultOptions}
        filter={filter}
      />
    );
  }

  // Read-only multi-consultant consultation — only for management roles.
  let panel = null;
  if (isManager) {
    const { getReportFilterOptions, getHoursReport } = await import(
      "@/lib/db/reports"
    );
    const flat = flatten(params);
    // Paginate the on-screen panel by default (without page/pageSize the read
    // returns the whole set). The CSV link still omits both → export-all.
    const flatForReport = {
      ...flat,
      page: flat.page || "1",
      pageSize: flat.pageSize || String(DEFAULT_PAGE_SIZE),
    };
    const parsed = hoursReportFilterSchema.safeParse(flatForReport);
    const [filterOptions, report] = await Promise.all([
      getReportFilterOptions(user),
      getHoursReport(user, parsed.success ? parsed.data : {}),
    ]);
    panel = (
      <HorasConsultaPanel
        report={report}
        options={filterOptions}
        values={flatForReport}
      />
    );
  }

  return (
    <div className="space-y-6">
      {header}
      {editor}
      {panel}
    </div>
  );
}
