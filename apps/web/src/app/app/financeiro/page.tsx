import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { FinancialOverview } from "@/components/financial/FinancialOverview";
import { requireRole } from "@/lib/auth/guards";
import { FINANCIAL_ROLES } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { isStorageConfigured } from "@/lib/storage/provider";
import {
  revenueClosingStatusLabels,
  type RevenueClosingOverview,
  type RevenueClosingStatus,
} from "@/lib/financial/types";

export const metadata: Metadata = { title: "Financeiro" };

function parseSingle(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.length > 0 ? raw : undefined;
}

function parseStatus(
  value: string | string[] | undefined,
): RevenueClosingStatus | undefined {
  const raw = parseSingle(value);
  return raw && raw in revenueClosingStatusLabels
    ? (raw as RevenueClosingStatus)
    : undefined;
}

function parseMonth(value: string | string[] | undefined, fallback: number) {
  const raw = parseSingle(value);
  const parsed = raw ? Number(raw) : fallback;
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12
    ? parsed
    : fallback;
}

function parseYear(value: string | string[] | undefined, fallback: number) {
  const raw = parseSingle(value);
  const parsed = raw ? Number(raw) : fallback;
  return Number.isInteger(parsed) && parsed >= 2020 && parsed <= 2100
    ? parsed
    : fallback;
}

const inputClass =
  "mt-1 h-10 rounded-md border border-border bg-surface px-3 text-sm text-strong";

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  // Financial data is role-protected; non-authorized users go to /access-denied.
  await requireRole(FINANCIAL_ROLES);

  const databaseConfigured = isDatabaseConfigured();
  const now = new Date();
  const params = (await searchParams) ?? {};
  const month = parseMonth(params.month, now.getMonth() + 1);
  const year = parseYear(params.year, now.getFullYear());
  const clientName = parseSingle(params.client);
  const projectName = parseSingle(params.project);
  const status = parseStatus(params.status);
  const tab = parseSingle(params.tab);

  let financeExpenses;
  let revenueClosing: RevenueClosingOverview | undefined;
  let clientOptions: string[] = [];
  let projectOptions: string[] = [];
  let exceptions;
  let exceptionsByProject;
  if (databaseConfigured) {
    // Lazy import so Prisma is never loaded on code paths without a database.
    const { listFinanceExpenses } = await import("@/lib/db/expenses");
    const { listRevenueClosings } = await import("@/lib/db/revenue");
    const { listPeriodExceptions, listRevenueExceptionsByProject } =
      await import("@/lib/db/period-exceptions");
    financeExpenses = (await listFinanceExpenses()).expenses;
    const overview = await listRevenueClosings({ month, year });
    exceptions = await listPeriodExceptions({ month, year });
    exceptionsByProject = await listRevenueExceptionsByProject({ month, year });

    // Filter options come from the full period (unfiltered) so a selected
    // client/project does not collapse the dropdowns. Project options are
    // scoped to the selected client when one is chosen.
    clientOptions = [...new Set(overview.rows.map((r) => r.clientName))].sort();
    projectOptions = [
      ...new Set(
        overview.rows
          .filter((r) => !clientName || r.clientName === clientName)
          .map((r) => r.projectName),
      ),
    ].sort();

    // Cliente / projeto / status filter the table + summary; the period drives
    // the DB query above.
    revenueClosing = {
      ...overview,
      rows: overview.rows.filter(
        (r) =>
          (!clientName || r.clientName === clientName) &&
          (!projectName || r.projectName === projectName) &&
          (!status || r.status === status),
      ),
    };
  }

  const statusOptions = Object.keys(
    revenueClosingStatusLabels,
  ) as RevenueClosingStatus[];

  // Excel export (Onda 6): Contas a Receber carrega o filtro corrente (período +
  // cliente/projeto/status); Contas a Pagar espelha a fila do financeiro (sem
  // filtro de período próprio). Ocultos sem banco.
  let receberExportHref: string | undefined;
  let pagarExportHref: string | undefined;
  if (databaseConfigured) {
    const receberQuery = new URLSearchParams();
    receberQuery.set("month", String(month));
    receberQuery.set("year", String(year));
    if (clientName) receberQuery.set("client", clientName);
    if (projectName) receberQuery.set("project", projectName);
    if (status) receberQuery.set("status", status);
    receberExportHref = `/api/financeiro/receber/export?${receberQuery.toString()}`;
    pagarExportHref = "/api/financeiro/pagar/export";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gestão"
        title="Financeiro"
        description="Fechamento mensal de horas aprovadas, valor hora, receita estimada e pagamento de despesas."
      />
      <form className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-surface p-4">
        {/* Preserva a aba ativa (Contas a Receber/Pagar) ao filtrar via GET. */}
        <input type="hidden" name="tab" value={tab ?? ""} />
        <label className="text-sm font-medium text-medium">
          Mês
          <input
            name="month"
            type="number"
            min={1}
            max={12}
            defaultValue={month}
            className={`${inputClass} w-24`}
          />
        </label>
        <label className="text-sm font-medium text-medium">
          Ano
          <input
            name="year"
            type="number"
            min={2020}
            max={2100}
            defaultValue={year}
            className={`${inputClass} w-28`}
          />
        </label>
        <label className="text-sm font-medium text-medium">
          Cliente
          <select
            name="client"
            defaultValue={clientName ?? ""}
            className={`${inputClass} w-48`}
          >
            <option value="">Todos</option>
            {clientOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-medium">
          Projeto
          <select
            name="project"
            defaultValue={projectName ?? ""}
            className={`${inputClass} w-48`}
          >
            <option value="">Todos</option>
            {projectOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-medium">
          Status
          <select
            name="status"
            defaultValue={status ?? ""}
            className={`${inputClass} w-44`}
          >
            <option value="">Todos</option>
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                {revenueClosingStatusLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <button className="h-10 rounded-md bg-surface px-4 text-sm font-semibold text-strong shadow-[2px_2px_0_0_var(--color-ink)]">
          Filtrar
        </button>
      </form>
      <FinancialOverview
        revenueMode={databaseConfigured ? "db" : "demo"}
        revenueClosing={revenueClosing}
        expensesMode={databaseConfigured ? "db" : "demo"}
        financeExpenses={financeExpenses}
        expensesStorageAvailable={databaseConfigured && isStorageConfigured()}
        exceptions={exceptions}
        exceptionsByProject={exceptionsByProject}
        defaultTab={tab}
        receberExportHref={receberExportHref}
        pagarExportHref={pagarExportHref}
      />
    </div>
  );
}
