import type { Metadata } from "next";
import { UserX } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { TimesheetWeekView } from "@/components/timesheet/TimesheetWeekView";
import { requireUser } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import { parseWeekParam } from "@/lib/timesheet/week";
import { parseTimesheetFilter } from "@/lib/timesheet/filters";

export const metadata: Metadata = { title: "Horas" };

interface HorasPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Horas: weekly time entry. With a database, data comes from Prisma and the
 * week is selected via `?semana=` (server-driven). Without one, the original
 * demo (local state) keeps the screen usable, with an explicit banner.
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
  const { getConsultantForUser, getWeekForConsultant, listAllowedProjects } =
    await import("@/lib/db/timesheet");

  const consultant = await getConsultantForUser(user);
  if (!consultant) {
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
  const weekStart = parseWeekParam(params.semana);
  // Safe fallback: an invalid filter value is dropped, defaults take over.
  const filter = parseTimesheetFilter(params);
  const [week, projects] = await Promise.all([
    getWeekForConsultant(consultant.id, weekStart, filter),
    // The project dropdown lists the consultant's scope, narrowed by the
    // chosen project status so the options match the active filter.
    listAllowedProjects(consultant.id, weekStart, filter.projectStatus),
  ]);

  return (
    <div className="space-y-6">
      {header}
      <TimesheetWeekView
        mode="db"
        week={week}
        projects={projects}
        filter={filter}
      />
    </div>
  );
}
