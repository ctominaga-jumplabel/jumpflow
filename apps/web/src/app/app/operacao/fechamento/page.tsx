import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { FinanceTabs } from "@/components/financial/FinanceTabs";
import { OperationClosingFilters } from "@/components/operations/OperationClosingFilters";
import { OperationClosingTable } from "@/components/operations/OperationClosingTable";
import { OperationConsultantDetailTable } from "@/components/operations/OperationConsultantDetailTable";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { formatMonth } from "@/lib/format";
import {
  hoursReportFilterSchema,
  resolveDetailRange,
} from "@/lib/reports/schemas";
import {
  summarizeOverview,
  type OperationClosingDetailView,
  type OperationClosingOverview,
  type OperationFilterOptions,
} from "@/lib/operations/closing";

export const metadata: Metadata = { title: "Fechamento Operacional" };

type RawParams = Record<string, string | string[] | undefined>;

interface PageProps {
  searchParams: Promise<RawParams>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Flatten searchParams (first value wins) for Zod parsing + form reflection. */
function flatten(params: RawParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    out[key] = Array.isArray(value) ? (value[0] ?? "") : value;
  }
  return out;
}

/**
 * The per-project closing tab is inherently single-month. Derive its month/year
 * from the resolved detail range: use the month of the range start; when no
 * period/range is set, default to the current month (matching the screen's
 * prior month-based behavior).
 */
function resolveClosingMonth(
  from: string | undefined,
  now: Date,
): { month: number; year: number } {
  if (from) {
    const [y, m] = from.split("-").map(Number);
    if (Number.isInteger(y) && Number.isInteger(m)) return { month: m, year: y };
  }
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

/** Build a query string from flat params with overrides (empty values dropped). */
function queryWith(
  flat: Record<string, string>,
  overrides: Record<string, string | undefined>,
): string {
  const q = new URLSearchParams();
  const merged = { ...flat, ...overrides };
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === "") continue;
    q.set(key, value);
  }
  return q.toString();
}

export default async function OperationClosingPage({ searchParams }: PageProps) {
  // Operational closing is permission-gated (matrix view); writers are gated in
  // the server actions (OPERATION_CLOSING_WRITE_ROLES via edit).
  await requirePermission("OPERACAO_FECHAMENTO", "view");
  const canManage = await can("OPERACAO_FECHAMENTO", "edit");

  const params = await searchParams;
  const flat = flatten(params);
  const tab = first(params.tab) ?? "fechamento";
  const now = new Date();

  // Parse the shared filters with the SAME schema as the Relatórios "Horas" tab.
  const parsed = hoursReportFilterSchema.safeParse(flat);
  const filter = parsed.success ? parsed.data : {};

  // Resolve the effective range (period preset overrides De/Até), then the
  // closing month. When nothing is set, default the closing to the current month
  // (the detail tab stays unbounded, as in Relatórios).
  const range = resolveDetailRange(filter, now);
  const { month, year } = resolveClosingMonth(range.from, now);
  const monthLabel = formatMonth(month, year);

  const databaseConfigured = isDatabaseConfigured();
  let overview: OperationClosingOverview = summarizeOverview(month, year, []);
  let detail: OperationClosingDetailView = {
    rows: [],
    pagination: { total: 0, page: 1, pageSize: 50, totalPages: 1 },
    totalHours: 0,
    totalExceptions: 0,
  };
  let filterOptions: OperationFilterOptions = {
    clients: [],
    projects: [],
    consultants: [],
  };
  if (databaseConfigured) {
    const {
      listOperationClosings,
      listOperationClosingDetail,
      getOperationFilterOptions,
    } = await import("@/lib/db/operation-closing");
    [overview, detail, filterOptions] = await Promise.all([
      listOperationClosings({
        month,
        year,
        clientId: filter.clientId,
        projectId: filter.projectId,
        consultantId: filter.consultantId,
        clientStatus: filter.clientStatus,
        projectStatus: filter.projectStatus,
      }),
      listOperationClosingDetail(filter, now),
      getOperationFilterOptions(),
    ]);
  }

  // Excel exports carry the current filters. Closing carries the resolved month
  // + shared filters; detail carries every filter (page/size dropped → all rows).
  let closingExportHref: string | undefined;
  let detailExportHref: string | undefined;
  if (databaseConfigured) {
    closingExportHref = `/api/operacao/fechamento/export?${queryWith(
      {},
      {
        m: String(month),
        y: String(year),
        clientId: filter.clientId,
        projectId: filter.projectId,
        consultantId: filter.consultantId,
        clientStatus: filter.clientStatus,
        projectStatus: filter.projectStatus,
      },
    )}`;
    detailExportHref = `/api/operacao/fechamento/detalhe/export?${queryWith(
      flat,
      { tab: undefined, page: undefined, pageSize: undefined },
    )}`;
  }

  // Pagination hrefs for the detail tab preserve the full query string.
  const currentPage = detail.pagination.page;
  const prevHref = `/app/operacao/fechamento?${queryWith(flat, {
    tab: "detalhamento",
    page: String(Math.max(1, currentPage - 1)),
  })}`;
  const nextHref = `/app/operacao/fechamento?${queryWith(flat, {
    tab: "detalhamento",
    page: String(currentPage + 1),
  })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operação"
        title="Fechamento Operacional"
        description="Marque, por projeto, que todas as horas do mês foram lançadas e aprovadas. Ao fechar, o Departamento Pessoal é notificado por e-mail e Teams. O fechamento só é liberado quando toda a equipe está aprovada."
      />
      <OperationClosingFilters options={filterOptions} values={flat} tab={tab} />
      <FinanceTabs
        defaultTabId={tab}
        ariaLabel="Visões do fechamento operacional"
        tabs={[
          {
            id: "fechamento",
            label: "Fechamento",
            content: (
              <OperationClosingTable
                overview={overview}
                canManage={canManage}
                monthLabel={monthLabel}
                exportHref={closingExportHref}
              />
            ),
          },
          {
            id: "detalhamento",
            label: "Detalhamento por consultor",
            content: (
              <OperationConsultantDetailTable
                detail={detail}
                exportHref={detailExportHref}
                prevHref={prevHref}
                nextHref={nextHref}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
