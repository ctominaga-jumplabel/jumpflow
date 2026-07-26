import type { Metadata } from "next";
import { Database } from "lucide-react";

import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PendingClosingsView } from "@/components/financial/receivables/PendingClosingsView";
import { requireRole } from "@/lib/auth/guards";
import { PENDING_CLOSING_ROLES, hasRole } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import type { PendingClosingRow } from "@/lib/financial/receivables-journey-core";

export const metadata: Metadata = { title: "Pendentes de Fechamento — Financeiro" };

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Resolve a competência (mês/ano) dos `searchParams`, com default no mês atual
 * (o `now` é resolvido no server). Valores fora do intervalo caem no default.
 */
function resolveCompetence(
  params: RawParams,
  now: Date,
): { month: number; year: number } {
  const rawMonth = Number(first(params.month));
  const rawYear = Number(first(params.year));
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
 * Pendentes de Fechamento (Melhorias v2, 2026-07-25) — Wave C.
 *
 * Gate: PENDING_CLOSING_ROLES = [ADMIN, AREA_MANAGER, FINANCE]. O AREA_MANAGER e
 * o ADMIN liberam o faturamento por projeto/competência (CLOSE); o FINANCE
 * acompanha o que ainda falta liberar (somente leitura). É a home do
 * AREA_MANAGER puro (redirect em `/app`).
 *
 * Uma linha por projeto ATIVO da competência: Projeto, Cliente, Horas lançadas
 * (APPROVED no período) e Status (Liberado / Pendente / Sem lançamento). O botão
 * "Liberar" (só nas linhas Pendente, só p/ `canClose`) reusa `fecharApuracao`
 * (gate ADMIN/AREA_MANAGER, INALTERADO), pedindo uma justificativa curta.
 */
export default async function PendentesFechamentoPage({
  searchParams,
}: {
  searchParams?: Promise<RawParams>;
} = {}) {
  const user = await requireRole(PENDING_CLOSING_ROLES);
  const params = (await searchParams) ?? {};
  const { month, year } = resolveCompetence(params, new Date());

  // A liberação (CLOSE) é do Gerente de Área/ADMIN; o FINANCE só acompanha. O
  // gate real é server-side na action `fecharApuracao` (APURACAO_CLOSE_ROLES =
  // [ADMIN, AREA_MANAGER]); aqui a UI só decide a affordance do botão "Liberar".
  const canClose = hasRole(user, ["ADMIN", "AREA_MANAGER"]);

  const header = (
    <PageHeader
      eyebrow="Financeiro"
      title="Pendentes de Fechamento"
      description="Libere projetos para faturamento por competência. Cada projeto liberado passa a aparecer em Contas a Receber."
    />
  );

  // Modo demo (sem banco): a fila deriva de dados reais (projetos ativos +
  // fechamentos), que não existem no mock. Degrada com um EmptyState honesto.
  if (!isDatabaseConfigured()) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={Database}
          title="Disponível com banco de dados"
          description="A fila de liberação de faturamento por projeto/competência usa dados reais (projetos ativos e fechamentos). Configure o banco para usá-la."
        />
      </div>
    );
  }

  // Lazy import para não carregar o Prisma em caminhos sem banco.
  const { listPendingClosings } = await import(
    "@/lib/financial/receivables-journey"
  );
  const result = await listPendingClosings(user, { month, year });
  const rows: PendingClosingRow[] = result.rows;

  return (
    <div className="space-y-6">
      {header}
      <PendingClosingsView
        rows={rows}
        month={result.month}
        year={result.year}
        pendingCount={result.pendingCount}
        canClose={canClose}
      />
    </div>
  );
}
