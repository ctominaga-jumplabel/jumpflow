import type { Metadata } from "next";
import { Gauge } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ClimaView } from "@/components/surveys/ClimaView";
import { requireRole } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  getSurveyDashboard,
  listMySurveyAssignments,
  listSurveys,
} from "@/lib/db/surveys";
import {
  SURVEY_READ_ROLES,
  canManageSurveys,
  canViewSurveyDashboards,
} from "@/lib/surveys/visibility";
import type { SurveyDashboard } from "@/lib/surveys/types";

export const metadata: Metadata = { title: "Clima / NPS interno" };

export default async function ClimaPage() {
  const user = await requireRole(SURVEY_READ_ROLES);
  const databaseReady = isDatabaseConfigured();
  const canManage = canManageSurveys(user.roles);
  const canDashboards = canViewSurveyDashboards(user.roles);

  if (!databaseReady) {
    // Degradação graciosa honesta: clima é dado sensível e anônimo persistido;
    // sem DB não há fallback silencioso para mock (LGPD §3).
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Talentos"
          title="Clima / NPS interno"
          description="Pesquisas de clima e eNPS, respostas anônimas e dashboards agregados."
        />
        <EmptyState
          icon={Gauge}
          title="Banco de dados não configurado"
          description="O módulo de clima consome dados sensíveis persistidos e anônimos. Configure o banco para criar pesquisas, responder e ver os dashboards."
        />
      </div>
    );
  }

  const [surveys, assignments] = await Promise.all([
    canManage || canDashboards ? listSurveys() : Promise.resolve([]),
    listMySurveyAssignments(user),
  ]);

  // Pré-carrega os dashboards das pesquisas com pelo menos uma resposta, para os
  // papéis de dashboard. O RBAC e o piso mínimo são reaplicados no servidor
  // dentro de getSurveyDashboard (a UI só reflete o que o servidor liberou).
  const dashboards: Record<string, SurveyDashboard> = {};
  if (canDashboards) {
    const withResponses = surveys.filter((s) => s.responseCount > 0);
    const entries = await Promise.all(
      withResponses.map(async (s) => {
        const dash = await getSurveyDashboard(user, s.id);
        return [s.id, dash] as const;
      }),
    );
    for (const [id, dash] of entries) {
      if (dash) dashboards[id] = dash;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Talentos"
        title="Clima / NPS interno"
        description="Crie pesquisas de clima e eNPS, responda os convites atribuídos a você e acompanhe dashboards agregados. As pesquisas anônimas nunca ligam a resposta à identidade de quem respondeu."
      />
      <ClimaView
        canManage={canManage}
        canDashboards={canDashboards}
        surveys={surveys}
        assignments={assignments}
        dashboards={dashboards}
      />
    </div>
  );
}
