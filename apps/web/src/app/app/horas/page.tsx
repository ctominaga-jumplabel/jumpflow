import type { Metadata } from "next";
import { UserX } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { TimesheetWeekView } from "@/components/timesheet/TimesheetWeekView";
import { HorasConsultaPanel } from "@/components/timesheet/HorasConsultaPanel";
import { OnBehalfConsultantPicker } from "@/components/timesheet/OnBehalfConsultantPicker";
import { requireUser } from "@/lib/auth/guards";
import { hasRole } from "@/lib/auth/route-permissions";
import { canActOnBehalf } from "@/lib/db/on-behalf";
import { isDatabaseConfigured } from "@/lib/db/config";
import { isStorageConfigured } from "@/lib/storage/provider";
import {
  addDays,
  monthRangeOf,
  parseWeekParam,
} from "@/lib/timesheet/week";
import { parseTimesheetFilter } from "@/lib/timesheet/filters";
import {
  DEFAULT_PAGE_SIZE,
  hoursReportFilterSchema,
  type HoursReportFilter,
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
    getHolidayLookup,
    getPeriodForConsultant,
    getWeekForConsultant,
    listAllowedProjects,
    listTimesheetDefaultOptions,
  } = await import("@/lib/db/timesheet");

  const consultant = await getConsultantForUser(user);
  const isManager = hasRole(user, [...MANAGER_ROLES]);
  // CSV export is hidden for consultant-only users (no role beyond CONSULTANT).
  const canExportCsv = user.roles.some((role) => role !== "CONSULTANT");
  // "Faturável" (Onda B): visível/editável só para papéis de gestão. Determinado
  // no SERVIDOR — o consultor puro não vê o controle nem o rótulo na grade.
  const canEditBillable = isManager;
  // Anexo opcional do lançamento (melhoria #2): só é oferecido quando o object
  // storage está configurado (degrade honesto quando ausente).
  const attachmentsAvailable = isStorageConfigured();

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

  // Lançamento "em nome de" (on-behalf): um Gestor de Área/Admin escolhe um
  // consultor (via `?consultor=`) e o editor passa a operar a grade DELE. A
  // trava de alocação de cada gravação garante o "consultor precisa estar no
  // projeto"; aqui só resolvemos o alvo e alimentamos o seletor.
  const actingOnBehalf = canActOnBehalf(user);
  let onBehalfConsultants: { id: string; name: string }[] = [];
  let onBehalfTarget: { id: string; name: string } | null = null;
  if (actingOnBehalf) {
    const { listOnBehalfConsultants, findActiveConsultantById } = await import(
      "@/lib/db/on-behalf"
    );
    const selectedId =
      typeof params.consultor === "string" ? params.consultor : undefined;
    const [list, target] = await Promise.all([
      listOnBehalfConsultants(),
      selectedId ? findActiveConsultantById(selectedId) : Promise.resolve(null),
    ]);
    onBehalfConsultants = list;
    onBehalfTarget = target ? { id: target.id, name: target.name } : null;
  }
  // Quem o editor renderiza: o consultor-alvo (on-behalf) ou o próprio usuário.
  const editorConsultant = onBehalfTarget ?? consultant;

  const onBehalfPicker = actingOnBehalf ? (
    <OnBehalfConsultantPicker
      consultants={onBehalfConsultants}
      selectedId={onBehalfTarget?.id}
      selfLabel={consultant ? "Meus lançamentos" : "Selecione um consultor"}
      hint="Lance horas por um consultor alocado. Ele precisa estar no projeto (alocação ativa) para o lançamento ser aceito. A auditoria registra você como autor."
    />
  ) : null;

  // Personal weekly editor — for the acting consultant (self or on-behalf target).
  let editor = null;
  if (editorConsultant) {
    const weekStart = parseWeekParam(params.semana);
    // Safe fallback: an invalid filter value is dropped, defaults take over.
    const filter = parseTimesheetFilter(params);
    // Default period filter is the current calendar month (1st → last day).
    const defaultMonth = monthRangeOf();
    filter.startDate ??= defaultMonth.start;
    filter.endDate ??= defaultMonth.end;
    const periodStart = filter.startDate;
    const periodEnd = filter.endDate;
    // Project-aware holiday lookup for the visible week (Mon→Sun). Feeds the
    // grid holiday markers and the "Dia Útil em feriado" confirmation.
    const weekEnd = addDays(weekStart, 6);
    // Lookup de ausências da semana visível (Onda D): sinaliza os dias cobertos
    // por ausência CONFIRMED na grade e bloqueia o lançamento de Dia Útil neles.
    const { getTimeOffLookup } = await import("@/lib/db/time-off");
    const { listBillingLockedCompetenceKeys } = await import(
      "@/lib/timesheet/billing-lock"
    );
    const { prisma } = await import("@jumpflow/database");
    const [week, period, projects, defaultOptions, holidays, timeOff] =
      await Promise.all([
        getWeekForConsultant(editorConsultant.id, weekStart, filter),
        getPeriodForConsultant(
          editorConsultant.id,
          periodStart,
          periodEnd,
          filter,
        ),
        // The project dropdown lists the consultant's scope, narrowed by the
        // chosen project status so the options match the active filter.
        listAllowedProjects(editorConsultant.id, weekStart, filter.projectStatus),
        listTimesheetDefaultOptions(editorConsultant.id, weekStart),
        getHolidayLookup(weekStart, weekEnd),
        getTimeOffLookup(editorConsultant.id, weekStart, weekEnd),
      ]);
    // Trava A (cadeado na grade): quais (projeto, competência) da semana já
    // tiveram o faturamento liberado. Resolvido em UMA consulta pelos projetos
    // visíveis (sem N+1 por dia/entrada); o client casa cada linha por chave.
    const billingLockedKeys = await listBillingLockedCompetenceKeys(
      prisma,
      week.rows.map((row) => row.projectId),
    );
    editor = (
      <TimesheetWeekView
        mode="db"
        week={week}
        period={period}
        projects={projects}
        defaultOptions={defaultOptions}
        holidays={holidays}
        timeOff={timeOff}
        filter={filter}
        // O CSV do editor re-escopa ao usuário logado; em modo on-behalf ele
        // traria os dados do gestor (não do alvo) — some para não confundir.
        canExportCsv={onBehalfTarget ? false : canExportCsv}
        canEditBillable={canEditBillable}
        attachmentsAvailable={attachmentsAvailable}
        billingLockedKeys={billingLockedKeys}
        onBehalfOf={onBehalfTarget}
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
    // Fallback SEGURO: um filtro inválido (ex.: um `sort` do editor que não
    // existe no schema do relatório) não pode virar `{}` — isso ligaria o
    // export-all (take 50k) no render da tela e estouraria o limite de binds do
    // Postgres. Sem filtro válido, mantém a paginação padrão.
    const reportFilter: HoursReportFilter = parsed.success
      ? parsed.data
      : { page: 1, pageSize: DEFAULT_PAGE_SIZE as HoursReportFilter["pageSize"] };
    const [filterOptions, report] = await Promise.all([
      getReportFilterOptions(user),
      getHoursReport(user, reportFilter),
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
      {onBehalfPicker}
      {editor}
      {panel}
    </div>
  );
}
