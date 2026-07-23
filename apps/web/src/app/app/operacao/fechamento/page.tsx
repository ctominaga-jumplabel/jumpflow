import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FinanceTabs } from "@/components/financial/FinanceTabs";
import { OperationClosingTable } from "@/components/operations/OperationClosingTable";
import { OperationConsultantDetailTable } from "@/components/operations/OperationConsultantDetailTable";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { formatMonth } from "@/lib/format";
import {
  summarizeOverview,
  type OperationClosingDetailView,
  type OperationClosingOverview,
} from "@/lib/operations/closing";

export const metadata: Metadata = { title: "Fechamento Operacional" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveMonthYear(params: Record<string, string | string[] | undefined>): {
  month: number;
  year: number;
} {
  const now = new Date();
  const m = Number(first(params.m));
  const y = Number(first(params.y));
  const month = Number.isInteger(m) && m >= 1 && m <= 12 ? m : now.getMonth() + 1;
  const year =
    Number.isInteger(y) && y >= 2020 && y <= 2100 ? y : now.getFullYear();
  return { month, year };
}

function shiftMonth(month: number, year: number, delta: number) {
  const index = (year * 12 + (month - 1) + delta);
  return { month: (index % 12) + 1, year: Math.floor(index / 12) };
}

export default async function OperationClosingPage({ searchParams }: PageProps) {
  // Operational closing is permission-gated (matrix view); writers are gated in
  // the server actions (OPERATION_CLOSING_WRITE_ROLES via edit).
  await requirePermission("OPERACAO_FECHAMENTO", "view");
  const canManage = await can("OPERACAO_FECHAMENTO", "edit");

  const params = await searchParams;
  const { month, year } = resolveMonthYear(params);
  const monthLabel = formatMonth(month, year);
  const tab = first(params.tab);
  const consultantId = first(params.consultant) || undefined;

  const databaseConfigured = isDatabaseConfigured();
  let overview: OperationClosingOverview = summarizeOverview(month, year, []);
  let detail: OperationClosingDetailView = {
    month,
    year,
    rows: [],
    consultantOptions: [],
    totalHours: 0,
    totalExceptions: 0,
  };
  if (databaseConfigured) {
    const { listOperationClosings, listOperationClosingDetail } = await import(
      "@/lib/db/operation-closing"
    );
    [overview, detail] = await Promise.all([
      listOperationClosings({ month, year }),
      listOperationClosingDetail({ month, year, consultantId }),
    ]);
  }

  // Excel export (Onda 6) reflects the selected month; hidden without a
  // database (demo overview has nothing real to export).
  const exportHref = databaseConfigured
    ? `/api/operacao/fechamento/export?m=${month}&y=${year}`
    : undefined;

  // Detail export mirrors the consultant filter currently applied.
  let detailExportHref: string | undefined;
  if (databaseConfigured) {
    const q = new URLSearchParams({ m: String(month), y: String(year) });
    if (consultantId) q.set("consultant", consultantId);
    detailExportHref = `/api/operacao/fechamento/detalhe/export?${q.toString()}`;
  }

  const prev = shiftMonth(month, year, -1);
  const next = shiftMonth(month, year, 1);
  // Preserve the active tab when navigating months (client tab state also
  // mirrors ?tab=; server-driven month nav keeps whatever the URL carries).
  const tabSuffix = tab ? `&tab=${tab}` : "";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operação"
        title="Fechamento Operacional"
        description="Marque, por projeto, que todas as horas do mês foram lançadas e aprovadas. Ao fechar, o Departamento Pessoal é notificado por e-mail e Teams. O fechamento só é liberado quando toda a equipe está aprovada."
        actions={
          <nav className="flex items-center gap-1.5" aria-label="Selecionar mês">
            <Link
              href={`/app/operacao/fechamento?m=${prev.month}&y=${prev.year}${tabSuffix}`}
              className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-surface text-medium hover:bg-surface-muted/60"
              aria-label="Mês anterior"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </Link>
            <span className="min-w-32 text-center text-sm font-semibold capitalize text-strong">
              {monthLabel}
            </span>
            <Link
              href={`/app/operacao/fechamento?m=${next.month}&y=${next.year}${tabSuffix}`}
              className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-surface text-medium hover:bg-surface-muted/60"
              aria-label="Próximo mês"
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          </nav>
        }
      />
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
                exportHref={exportHref}
              />
            ),
          },
          {
            id: "detalhamento",
            label: "Detalhamento por consultor",
            content: (
              <OperationConsultantDetailTable
                detail={detail}
                monthLabel={monthLabel}
                selectedConsultantId={consultantId}
                month={month}
                year={year}
                exportHref={detailExportHref}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
