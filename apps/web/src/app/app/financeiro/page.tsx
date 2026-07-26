import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { FinancialOverview } from "@/components/financial/FinancialOverview";
import { requireRole } from "@/lib/auth/guards";
import { RECEIVABLES_ROLES, hasRole } from "@/lib/auth/route-permissions";
import { BILLABLE_MANAGER_ROLES } from "@/lib/auth/billable-roles";
import { isDatabaseConfigured } from "@/lib/db/config";
import { isStorageConfigured } from "@/lib/storage/provider";
import {
  receivablesFilterSchema,
  type ReceivablesFilter,
} from "@/lib/financial/receivables-journey-core";

export const metadata: Metadata = { title: "Financeiro" };

function parseSingle(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.length > 0 ? raw : undefined;
}

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

  // Filtros da nova jornada Contas a Receber: período (from/to) + cliente +
  // projeto (multi). O schema aceita `projectIds` como array OU valor único.
  const parsedFilter = receivablesFilterSchema.safeParse({
    from: params.from,
    to: params.to,
    clientId: params.clientId,
    projectIds: params.projectIds,
  });
  const filter: ReceivablesFilter = parsedFilter.success
    ? parsedFilter.data
    : { projectIds: [] };

  let receivables;
  let receivablesFilterOptions;
  let financeExpenses;
  let timesheetExportHref: string | undefined;
  let apuracaoHref: string | undefined;

  if (databaseConfigured) {
    // Lazy import so Prisma is never loaded on code paths without a database.
    const { listFinanceExpenses } = await import("@/lib/db/expenses");
    const { getReceivablesOverview } = await import(
      "@/lib/financial/receivables-journey"
    );
    const { getReportFilterOptions } = await import("@/lib/db/reports");

    [receivables, receivablesFilterOptions, financeExpenses] = await Promise.all(
      [
        getReceivablesOverview(user, filter),
        getReportFilterOptions(user),
        listFinanceExpenses().then((r) => r.expenses),
      ],
    );

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
        }}
        canEditBillable={canEditBillable}
        timesheetExportHref={timesheetExportHref}
        apuracaoHref={apuracaoHref}
        expensesMode={databaseConfigured ? "db" : "demo"}
        financeExpenses={financeExpenses}
        expensesStorageAvailable={databaseConfigured && isStorageConfigured()}
        defaultTab={tab}
        pagarExportHref={databaseConfigured ? "/api/financeiro/pagar/export" : undefined}
      />
    </div>
  );
}
