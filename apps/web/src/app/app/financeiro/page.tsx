import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { FinancialOverview } from "@/components/financial/FinancialOverview";
import { requireRole } from "@/lib/auth/guards";
import { RECEIVABLES_ROLES, hasRole } from "@/lib/auth/route-permissions";
import { BILLABLE_MANAGER_ROLES } from "@/lib/auth/billable-roles";
import { isDatabaseConfigured } from "@/lib/db/config";
import { isStorageConfigured } from "@/lib/storage/provider";
import {
  competenceBounds,
  receivablesFilterSchema,
  type ReceivablesFilter,
} from "@/lib/financial/receivables-journey-core";

export const metadata: Metadata = { title: "Financeiro" };

/**
 * Período default da aba Contas a Receber = MÊS ATUAL (mockup 02: "01/07 até
 * 31/07"). Sem isso, `from`/`to` ficavam vazios e o "Ver Apuração" abria a
 * Apuração sem período → "Nada a apurar", mesmo havendo projetos liberados.
 * Aplica o default só quando o usuário não informou nenhum limite; um filtro
 * parcial (só `from` ou só `to`) é respeitado como veio.
 */
function withDefaultPeriod(
  filter: ReceivablesFilter,
  now: Date,
): ReceivablesFilter {
  if (filter.from || filter.to) return filter;
  const { from, to } = competenceBounds(now.getMonth() + 1, now.getFullYear());
  return { ...filter, from, to };
}

function parseSingle(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.length > 0 ? raw : undefined;
}

/**
 * Competência (mês/ano) da aba "Pendentes de Fechamento". Usa params PRÓPRIOS
 * (`pmonth`/`pyear`) para NÃO colidir com os filtros da aba Contas a Receber
 * (from/to). Default = mês atual (`now` resolvido no server). Valores fora do
 * intervalo caem no default.
 */
function resolvePendingCompetence(
  params: Record<string, string | string[] | undefined>,
  now: Date,
): { month: number; year: number } {
  const rawMonth = Number(parseSingle(params.pmonth));
  const rawYear = Number(parseSingle(params.pyear));
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
 * Serializa os filtros correntes preservando `projectIds` como params repetidos.
 * NÃO propaga `consultantId`/`billable`: eles segmentam a LISTA por dia (Contas a
 * Receber); a Apuração é o recorte completo faturável do projeto (colaborador /
 * "Faturar Não" distorceriam os totais). Ver `getReceivablesApuracao`.
 */
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

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  // Contas a Receber/Pagar é [ADMIN, FINANCE] (Melhorias v2): o AREA_MANAGER
  // opera só Pendentes de Fechamento. Não-autorizados vão para /access-denied.
  const user = await requireRole(RECEIVABLES_ROLES);

  const databaseConfigured = isDatabaseConfigured();
  const params = (await searchParams) ?? {};
  const tab = parseSingle(params.tab);
  const canEditBillable = hasRole(user, BILLABLE_MANAGER_ROLES);
  // A liberação (CLOSE) é do Gerente de Área/ADMIN; o gate real é server-side na
  // action `fecharApuracao`. Aqui a UI só decide a affordance do botão "Liberar".
  // Como `/app/financeiro` é [ADMIN, FINANCE], na prática só o ADMIN vê o botão;
  // o FINANCE acompanha a aba em somente leitura.
  const canClosePending = hasRole(user, ["ADMIN", "AREA_MANAGER"]);
  const pendingCompetence = resolvePendingCompetence(params, new Date());

  // Filtros da nova jornada Contas a Receber: período (from/to) + cliente +
  // projeto (multi). O schema aceita `projectIds` como array OU valor único.
  const parsedFilter = receivablesFilterSchema.safeParse({
    from: params.from,
    to: params.to,
    clientId: params.clientId,
    projectIds: params.projectIds,
    consultantId: params.consultantId,
    billable: params.billable,
  });
  const filter: ReceivablesFilter = withDefaultPeriod(
    parsedFilter.success ? parsedFilter.data : { projectIds: [] },
    new Date(),
  );

  let receivables;
  let receivablesFilterOptions;
  let financeExpenses;
  let timesheetExportHref: string | undefined;
  let apuracaoHref: string | undefined;
  let pendingClosings:
    | {
        rows: import("@/lib/financial/receivables-journey-core").PendingClosingRow[];
        month: number;
        year: number;
        pendingCount: number;
      }
    | undefined;

  if (databaseConfigured) {
    // Lazy import so Prisma is never loaded on code paths without a database.
    const { listFinanceExpenses } = await import("@/lib/db/expenses");
    const { getReceivablesOverview, listPendingClosings } = await import(
      "@/lib/financial/receivables-journey"
    );
    const { getReportFilterOptions } = await import("@/lib/db/reports");

    const [
      receivablesResult,
      filterOptionsResult,
      financeExpensesResult,
      pendingResult,
    ] = await Promise.all([
      getReceivablesOverview(user, filter),
      getReportFilterOptions(user),
      listFinanceExpenses().then((r) => r.expenses),
      listPendingClosings(user, pendingCompetence),
    ]);
    receivables = receivablesResult;
    receivablesFilterOptions = filterOptionsResult;
    financeExpenses = financeExpensesResult;
    pendingClosings = {
      rows: pendingResult.rows,
      month: pendingResult.month,
      year: pendingResult.year,
      pendingCount: pendingResult.pendingCount,
    };

    // Exportar Timesheet: reaproveita o XLSX de Relatórios com os filtros da
    // tela (status=APPROVED). Com exatamente 1 projeto, fixa `projectId`; com
    // múltiplos, OMITE `projectId` para exportar o recorte cliente+período (o
    // schema de Relatórios aceita um único projectId).
    const timesheetQuery = new URLSearchParams();
    if (filter.from) timesheetQuery.set("from", filter.from);
    if (filter.to) timesheetQuery.set("to", filter.to);
    if (filter.clientId) timesheetQuery.set("clientId", filter.clientId);
    timesheetQuery.set("status", "APPROVED");
    if (filter.projectIds.length === 1) {
      timesheetQuery.set("projectId", filter.projectIds[0]);
    }
    timesheetExportHref = `/api/relatorios/horas/xlsx?${timesheetQuery.toString()}`;

    // Ver Apuração (tela da Wave C): preserva os filtros na query (projectIds
    // repetidos, um por projeto selecionado).
    apuracaoHref = `/app/financeiro/apuracao?${buildQuery(filter).toString()}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gestão"
        title="Financeiro"
        description="Contas a Receber (horas aprovadas por dia, valor a faturar e apuração) e Contas a Pagar (pagamento de despesas)."
      />
      <FinancialOverview
        receivablesMode={databaseConfigured ? "db" : "demo"}
        receivables={receivables}
        receivablesFilterOptions={receivablesFilterOptions}
        receivablesValues={{
          from: filter.from,
          to: filter.to,
          clientId: filter.clientId,
          projectIds: filter.projectIds,
          consultantId: filter.consultantId,
          billable:
            filter.billable === undefined ? undefined : String(filter.billable),
        }}
        canEditBillable={canEditBillable}
        timesheetExportHref={timesheetExportHref}
        apuracaoHref={apuracaoHref}
        expensesMode={databaseConfigured ? "db" : "demo"}
        financeExpenses={financeExpenses}
        expensesStorageAvailable={databaseConfigured && isStorageConfigured()}
        defaultTab={tab}
        pagarExportHref={databaseConfigured ? "/api/financeiro/pagar/export" : undefined}
        pendingClosings={pendingClosings}
        canClosePending={canClosePending}
        canRevertPending={hasRole(user, ["ADMIN", "FINANCE"])}
      />
    </div>
  );
}
