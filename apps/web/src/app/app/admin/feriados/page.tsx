import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { HolidaysView } from "@/components/admin/HolidaysView";
import { requireRole } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";

export const metadata: Metadata = { title: "Feriados" };

/**
 * Admin holidays calendar (`/app/admin/feriados`). Registers holidays and their
 * applicability by project: no linked project = global (every project); >=1 link
 * = only the linked projects. Managed by ADMIN + PEOPLE; every change is audited.
 */
export default async function FeriadosPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string }>;
}) {
  await requireRole(["ADMIN", "PEOPLE"]);

  const header = (
    <PageHeader
      eyebrow="Administração"
      title="Feriados"
      description="Cadastre feriados do calendário operacional. Sem projetos vinculados, o feriado vale para todos (global); vinculado a projetos, vale só para eles."
    />
  );

  if (!isDatabaseConfigured()) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={CalendarDays}
          title="Banco não configurado"
          description="Os feriados são persistidos no banco. Configure a conexão para administrá-los."
        />
      </div>
    );
  }

  const { listHolidays, listHolidayYears, listProjectsForHolidays } =
    await import("@/lib/db/holidays");

  const params = await searchParams;
  const parsedYear = params.ano ? Number(params.ano) : NaN;
  const selectedYear = Number.isInteger(parsedYear) ? parsedYear : undefined;

  const [holidays, years, projects] = await Promise.all([
    listHolidays(selectedYear),
    listHolidayYears(),
    listProjectsForHolidays(),
  ]);

  return (
    <div className="space-y-6">
      {header}
      <HolidaysView
        holidays={holidays}
        years={years}
        selectedYear={selectedYear}
        projects={projects}
      />
    </div>
  );
}
