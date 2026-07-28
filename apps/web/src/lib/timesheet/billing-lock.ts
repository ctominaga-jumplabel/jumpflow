import { prisma, type Prisma } from "@jumpflow/database";

import {
  closingCompetenceKey,
  entryCompetenceKey,
} from "@/lib/financial/receivables-journey-core";
import { ActionError } from "@/lib/timesheet/action-error";
import { toIsoDate } from "@/lib/timesheet/week";

/**
 * Trava A (docs/proposta-cockpit-gestor-area §4.1): lançamento congelado após a
 * liberação para o Financeiro.
 *
 * Quando existe um `RevenueClosing` em `CLOSED` ou `INVOICED` para a competência
 * (projeto + mês/ano da data do lançamento), o consultor NÃO pode criar, editar
 * nem excluir horas daquele projeto naquela competência — o valor faturado não
 * pode divergir do que foi lançado. A reabertura é responsabilidade do Financeiro
 * (reverter o `RevenueClosing`, o que remove o status de bloqueio e destrava
 * automaticamente esta checagem).
 *
 * Esta é uma checagem no PONTO DE ESCRITA (server action de horas), análoga a
 * `upsertOpenPeriod`/`assertNoConfirmedTimeOff`. Não altera schema: cruza a
 * competência do lançamento com a existência de um fechamento bloqueante,
 * reaproveitando os helpers de competência da jornada de Contas a Receber
 * (`entryCompetenceKey`/`closingCompetenceKey`).
 */

type Db = Prisma.TransactionClient | typeof prisma;

/** Mensagem única exibida ao consultor quando a competência está congelada. */
export const BILLING_RELEASED_MESSAGE =
  "Faturamento liberado para esta competência — contate o Gestor de Área para reabrir.";

/**
 * Status de `RevenueClosing` que CONGELAM o lançamento da competência. `CLOSED`
 * é a liberação para o Financeiro; `INVOICED` é imutável (já faturado). Estados
 * anteriores (OPEN/IN_REVIEW/READY_TO_CLOSE) e `CANCELLED` NÃO bloqueiam.
 */
const BILLING_LOCKED_STATUSES = ["CLOSED", "INVOICED"] as const;

/**
 * Predicado: a competência (projeto + mês/ano de `date`) tem o faturamento
 * liberado? Retorna `true` quando há `RevenueClosing` CLOSED/INVOICED para o
 * projeto na mesma competência do lançamento. Usado por fluxos em lote que
 * PULAM silenciosamente o item bloqueado (ex.: `copyPreviousWeek`), em vez de
 * abortar a operação inteira.
 */
export async function isCompetenceBillingReleased(
  db: Db,
  projectId: string,
  date: Date,
): Promise<boolean> {
  // Só fechamentos DESTE projeto que estejam num status bloqueante. RevenueClosing
  // tem projectId nullable (fechamento por cliente), mas filtrar por um projectId
  // concreto nunca casa linhas com projectId null.
  const closings = await db.revenueClosing.findMany({
    where: { projectId, status: { in: [...BILLING_LOCKED_STATUSES] } },
    select: { projectId: true, month: true, year: true },
  });
  if (closings.length === 0) return false;
  const releasedKeys = new Set(
    closings.map((c) => closingCompetenceKey(c.projectId!, c.month, c.year)),
  );
  return releasedKeys.has(entryCompetenceKey(projectId, toIsoDate(date)));
}

/**
 * Batch (Fase 4d — cadeado na grade de horas do consultor): dado o conjunto de
 * projetos visíveis numa semana, devolve TODAS as chaves de competência
 * `${projectId}:${YYYY-MM}` cujo faturamento já foi liberado (Trava A). Uma
 * única consulta para a grade inteira — sem N+1 por entrada/dia. As chaves usam
 * o MESMO formato de `entryCompetenceKey`/`closingCompetenceKey`, então o client
 * casa a (projeto, competência) de cada linha diretamente contra o `Set`.
 *
 * Retorna chaves de qualquer competência bloqueante do projeto (não filtra pela
 * competência visível) — o client só consulta as chaves que lhe interessam, e a
 * consulta fica trivial e indexada por `projectId`.
 */
export async function listBillingLockedCompetenceKeys(
  db: Db,
  projectIds: string[],
): Promise<string[]> {
  const uniqueIds = [...new Set(projectIds)];
  if (uniqueIds.length === 0) return [];
  const closings = await db.revenueClosing.findMany({
    where: {
      projectId: { in: uniqueIds },
      status: { in: [...BILLING_LOCKED_STATUSES] },
    },
    select: { projectId: true, month: true, year: true },
  });
  return closings.map((c) =>
    closingCompetenceKey(c.projectId!, c.month, c.year),
  );
}

/**
 * Guarda (throws): recusa a mutação quando a competência do lançamento já teve o
 * faturamento liberado. Lança `ActionError("BILLING_RELEASED")`, que o boundary
 * das actions converte num `ActionResult` de falha (nunca vaza ao cliente).
 * Ao mover um lançamento de mês (edição), passe a data de DESTINO.
 */
export async function assertCompetenceBillingOpen(
  db: Db,
  projectId: string,
  date: Date,
): Promise<void> {
  if (await isCompetenceBillingReleased(db, projectId, date)) {
    throw new ActionError("BILLING_RELEASED", BILLING_RELEASED_MESSAGE);
  }
}
