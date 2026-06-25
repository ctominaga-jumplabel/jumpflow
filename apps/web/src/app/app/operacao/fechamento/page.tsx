import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { OperationClosingTable } from "@/components/operations/OperationClosingTable";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { formatMonth } from "@/lib/format";
import {
  summarizeOverview,
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

  let overview: OperationClosingOverview = summarizeOverview(month, year, []);
  if (isDatabaseConfigured()) {
    const { listOperationClosings } = await import("@/lib/db/operation-closing");
    overview = await listOperationClosings({ month, year });
  }

  const prev = shiftMonth(month, year, -1);
  const next = shiftMonth(month, year, 1);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operação"
        title="Fechamento Operacional"
        description="Marque, por projeto, que todas as horas do mês foram lançadas e aprovadas. Ao fechar, o Departamento Pessoal é notificado por e-mail e Teams. O fechamento só é liberado quando toda a equipe está aprovada."
        actions={
          <nav className="flex items-center gap-1.5" aria-label="Selecionar mês">
            <Link
              href={`/app/operacao/fechamento?m=${prev.month}&y=${prev.year}`}
              className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-surface text-medium hover:bg-surface-muted/60"
              aria-label="Mês anterior"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </Link>
            <span className="min-w-32 text-center text-sm font-semibold capitalize text-strong">
              {monthLabel}
            </span>
            <Link
              href={`/app/operacao/fechamento?m=${next.month}&y=${next.year}`}
              className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-surface text-medium hover:bg-surface-muted/60"
              aria-label="Próximo mês"
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          </nav>
        }
      />
      <OperationClosingTable
        overview={overview}
        canManage={canManage}
        monthLabel={monthLabel}
      />
    </div>
  );
}
