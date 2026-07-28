import type { Metadata } from "next";

import { CockpitView } from "@/components/operations/CockpitView";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { COCKPIT_ROLES, hasRole } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { formatMonth } from "@/lib/format";
import {
  getCockpitOverview,
  type CockpitOverview,
} from "@/lib/operacao/cockpit";

export const metadata: Metadata = { title: "Cockpit do Gestor de Área" };

type RawParams = Record<string, string | string[] | undefined>;

interface PageProps {
  searchParams: Promise<RawParams>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Resolve a competência a partir de `?mes=&ano=`, com fallback para o mês/ano
 * atuais. Este é código de aplicação (não o núcleo puro), então ler o relógio
 * via `new Date()` é permitido. Mês fora de 1–12 ou ano implausível caem no
 * default para nunca quebrar a consulta.
 */
function resolveCompetence(
  params: RawParams,
  now: Date,
): { month: number; year: number } {
  const rawMonth = Number(first(params.mes));
  const rawYear = Number(first(params.ano));
  const month =
    Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12
      ? rawMonth
      : now.getMonth() + 1;
  const year =
    Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= 2100
      ? rawYear
      : now.getFullYear();
  return { month, year };
}

/**
 * Cockpit do Gestor de Área — Fase 4b (UI rica).
 *
 * Server Component orquestrador: gate de servidor, resolução da competência,
 * leitura via `getCockpitOverview` e cálculo das capacidades de liberação por
 * papel. Toda a interação (abas Ativos/Histórico, accordion, chips, toggle da
 * obrigatoriedade diária, liberações Financeiro/DP e drawer de calendário) vive
 * no client `CockpitView` — os ícones (lucide) ficam DENTRO dele, nunca passados
 * como props do servidor.
 *
 * Gate: `requireRole(COCKPIT_ROLES)` = [ADMIN, AREA_MANAGER, PROJECT_MANAGER];
 * FINANCE puro e PEOPLE NÃO acessam. As capacidades abaixo espelham os gates
 * reais das actions (o servidor continua sendo a autoridade):
 *  - Financeiro (`fecharApuracao`): ADMIN/AREA_MANAGER.
 *  - DP (`closeOperation`) e flag diária: ADMIN/AREA_MANAGER/PROJECT_MANAGER
 *    (um PROJECT_MANAGER só age nos próprios projetos — reforçado na action).
 */
export default async function CockpitPage({ searchParams }: PageProps) {
  const user = await requireRole(COCKPIT_ROLES);

  const params = await searchParams;
  const now = new Date();
  const { month, year } = resolveCompetence(params, now);
  const monthLabel = formatMonth(month, year);

  const overview: CockpitOverview = isDatabaseConfigured()
    ? await getCockpitOverview({ month, year })
    : { month, year, projects: [] };

  const canManageFinance = hasRole(user, ["ADMIN", "AREA_MANAGER"]);
  const canManageDp = hasRole(user, [
    "ADMIN",
    "AREA_MANAGER",
    "PROJECT_MANAGER",
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operação"
        title="Cockpit do Gestor de Área"
        description="Ponto único de acompanhamento por projeto e consultor, com as liberações Financeiro e DP em um só lugar. Selecione a competência para ver o que ainda falta liberar."
      />

      <CockpitView
        month={month}
        year={year}
        monthLabel={monthLabel}
        projects={overview.projects}
        canManageFinance={canManageFinance}
        canManageDp={canManageDp}
        canToggleFlag={canManageDp}
      />
    </div>
  );
}
