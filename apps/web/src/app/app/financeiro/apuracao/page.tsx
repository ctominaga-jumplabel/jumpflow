import type { Metadata } from "next";

import { requireRole } from "@/lib/auth/guards";
import { RECEIVABLES_ROLES } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { formatDate } from "@/lib/format";
import {
  competenceBounds,
  receivablesFilterSchema,
  type ReceivablesFilter,
} from "@/lib/financial/receivables-journey-core";
import {
  ApuracaoView,
  type ApuracaoProjectView,
} from "@/components/financial/receivables/ApuracaoView";

export const metadata: Metadata = { title: "Apuração — Financeiro" };

/** Serializa os filtros correntes preservando `projectIds` como params repetidos. */
function buildQuery(
  filter: ReceivablesFilter,
  extra: Record<string, string> = {},
): URLSearchParams {
  const query = new URLSearchParams();
  if (filter.from) query.set("from", filter.from);
  if (filter.to) query.set("to", filter.to);
  if (filter.clientId) query.set("clientId", filter.clientId);
  for (const [key, value] of Object.entries(extra)) query.set(key, value);
  for (const projectId of filter.projectIds) query.append("projectIds", projectId);
  return query;
}

/** Href do `.xlsx` de Apuração escopado a um único projeto (rota gated). */
function projectExportHref(
  filter: ReceivablesFilter,
  projectId: string,
): string {
  const query = new URLSearchParams();
  if (filter.from) query.set("from", filter.from);
  if (filter.to) query.set("to", filter.to);
  if (filter.clientId) query.set("clientId", filter.clientId);
  query.append("projectIds", projectId);
  return `/api/financeiro/apuracao/export?${query.toString()}`;
}

/**
 * Tela de Apuração (Contas a Receber, Wave C / item 6). Gated a RECEIVABLES_ROLES.
 * Parseia os MESMOS filtros da jornada (vindos do "Ver Apuração" da Wave B) e
 * consome `getReceivablesApuracao`. Renderiza os projetos empilhados; o envio e o
 * estado de sucesso vivem no client (`ApuracaoView`). NFS-e/status/exceções ficam
 * fora do escopo (ver docs/proposta-contas-a-receber/README.md §0/§7).
 */
export default async function ApuracaoPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  // Apuração é [ADMIN, FINANCE] (Melhorias v2, RECEIVABLES_ROLES): o
  // AREA_MANAGER não apura/envia — só libera em Pendentes de Fechamento.
  const user = await requireRole(RECEIVABLES_ROLES);
  const params = (await searchParams) ?? {};

  // Gates de papel (a UI só ajusta affordance; o gate real é server-side na
  // action). A liberação/fechamento MIGROU para "Pendentes de Fechamento"
  // (Gerente de Área); aqui só resta Enviar Apuração = RECEIVABLES_ROLES (esta
  // página já é gated por RECEIVABLES_ROLES = [ADMIN, FINANCE]).
  const canSend = true;

  const parsedFilter = receivablesFilterSchema.safeParse({
    from: params.from,
    to: params.to,
    clientId: params.clientId,
    projectIds: params.projectIds,
  });
  const baseFilter: ReceivablesFilter = parsedFilter.success
    ? parsedFilter.data
    : { projectIds: [] };
  // Default = mês atual quando o "Ver Apuração" chega sem período (a aba Contas
  // a Receber agora também aplica esse default). Evita "Nada a apurar" com o
  // recorte vazio quando há projetos liberados no mês corrente.
  const filter: ReceivablesFilter =
    baseFilter.from || baseFilter.to
      ? baseFilter
      : {
          ...baseFilter,
          ...competenceBounds(
            new Date().getMonth() + 1,
            new Date().getFullYear(),
          ),
        };

  const backHref = `/app/financeiro?${buildQuery(filter, { tab: "receber" }).toString()}`;
  const periodLabel =
    filter.from && filter.to
      ? `${formatDate(filter.from)} até ${formatDate(filter.to)}`
      : filter.from
        ? `A partir de ${formatDate(filter.from)}`
        : filter.to
          ? `Até ${formatDate(filter.to)}`
          : "Período não definido";

  let projects: ApuracaoProjectView[] = [];
  let includeFinancials = false;

  // A apuração exige período (from/to): sem ele não roda consulta all-time
  // (review BAIXO #7). Sem período, a tela mostra o estado "Período não definido"
  // (projetos vazios) — o usuário volta e define o range no filtro.
  if (isDatabaseConfigured() && filter.from && filter.to) {
    // Lazy import para não carregar o Prisma em caminhos sem banco.
    const { getReceivablesApuracao, loadApuracaoStates } = await import(
      "@/lib/financial/receivables-journey"
    );
    const { getReportFilterOptions } = await import("@/lib/db/reports");

    const [apuracao, filterOptions] = await Promise.all([
      getReceivablesApuracao(user, filter),
      getReportFilterOptions(user),
    ]);
    includeFinancials = apuracao.includeFinancials;

    // Mapa projeto → cliente (o envio por projeto precisa do clientId; a
    // apuração só carrega o nome do cliente).
    const clientByProject = new Map(
      filterOptions.projects.map((p) => [p.id, p.clientId]),
    );

    // Hidrata o estado atual de fechamento/envio POR PROJETO do servidor (review
    // MÉDIO #2 + §0.6): um projeto já CLOSED nasce com "Enviar" habilitado; um já
    // enviado nasce como "Apuração Enviada", sem exigir clique.
    const states = await loadApuracaoStates(
      apuracao.projects.map((p) => p.projectId),
      filter.from,
      filter.to,
    );

    projects = apuracao.projects.map((project) => {
      const state = states.get(project.projectId);
      return {
        projectId: project.projectId,
        projectName: project.projectName,
        clientName: project.clientName,
        clientId: clientByProject.get(project.projectId) ?? null,
        consultants: project.consultants,
        totalHours: project.totalHours,
        totalAmount: project.totalAmount,
        unratedBillableHours: project.unratedBillableHours,
        nonHourlyBilling: project.nonHourlyBilling,
        initialState: {
          anyClosed: state?.anyClosed ?? false,
          allSent: state?.allSent ?? false,
          sentCompetences: state?.sentCompetences ?? [],
        },
        exportHref: projectExportHref(filter, project.projectId),
      };
    });
  }

  return (
    <div className="space-y-6">
      <ApuracaoView
        projects={projects}
        includeFinancials={includeFinancials}
        periodLabel={periodLabel}
        from={filter.from}
        to={filter.to}
        canSend={canSend}
        backHref={backHref}
      />
    </div>
  );
}
