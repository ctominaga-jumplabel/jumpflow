import { prisma } from "@jumpflow/database";

import type { AppUser } from "@/lib/auth/types";
import type { BillingChargeType } from "@/lib/clients/types";
import {
  buildHoursWhere,
  loadProjectRateContexts,
  resolveBillingRate,
  resolveReportScope,
  scopeHasUniverse,
} from "@/lib/db/reports";
import { preInvoiceReferenceKey } from "@/lib/billing/pre-invoice";
import { timeEntryEffectiveHours } from "@/lib/timesheet/effective-hours";
import { activityLabelOf } from "@/lib/timesheet/types";
import { toIsoDate } from "@/lib/timesheet/week";
import {
  buildApuracao,
  classifyPendingStatus,
  closingCompetenceKey,
  competenceBounds,
  countPendingRows,
  filterReleasedEntries,
  groupEntriesByDay,
  monthsInRange,
  summarizeReceivables,
  type ApuracaoResult,
  type PendingClosingRow,
  type PendingClosingsResult,
  type ReceivablesEntry,
  type ReceivablesFilter,
  type ReceivablesOverview,
} from "@/lib/financial/receivables-journey-core";

/**
 * Camada de BANCO da jornada "Contas a Receber". Reaproveita o MESMO escopo/RBAC
 * de Relatórios (`resolveReportScope` + `buildHoursWhere`) e a MESMA resolução de
 * taxa de venda (`loadProjectRateContexts` + `resolveBillingRate`), enriquecendo
 * cada lançamento com horas efetivas (`timeEntryEffectiveHours`) e anexo. Toda a
 * lógica pura (tipos, filtro, agregadores, export) vive em
 * `receivables-journey-core.ts` e é reexportada aqui para a UI consumir de um só
 * módulo. Ver docs/proposta-contas-a-receber/README.md §3 (itens 2, 3, 4, 6).
 *
 * Colunas monetárias só são calculadas quando `scope.includeFinancials`
 * (FINANCIAL_ROLES); caso contrário `saleRate`/`billedAmount` ficam nulos
 * (defesa em profundidade — a tela ainda é gated por FINANCIAL_ROLES na Wave B/C).
 */

export * from "@/lib/financial/receivables-journey-core";

/**
 * Tipos de cobrança cujo valor é (essencialmente) `horas × taxa`, então
 * `horas × venda` NÃO diverge do `RevenueClosing.totalAmount`. Qualquer outro
 * tipo (fixo/mensal/pacote/marco/...) é NÃO-HORÁRIO → sinaliza divergência
 * possível (QA + review #3). `null`/legado = HOURLY (mesma default do motor de
 * faturamento em `revenue.ts`).
 */
const HOURLY_BILLING_TYPES = new Set<BillingChargeType>([
  "HOURLY",
  "CONSULTANT_HOURLY",
  "TIME_AND_MATERIAL",
]);

/** Carrega o mapa projectId → cobrança NÃO-horária (fixo/mensal/etc.). */
async function loadNonHourlyBillingMap(
  projectIds: string[],
): Promise<Map<string, boolean>> {
  const uniqueIds = [...new Set(projectIds)].filter(Boolean);
  if (uniqueIds.length === 0) return new Map();
  const projects = await prisma.project.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, billingType: { select: { chargeType: true } } },
  });
  return new Map(
    projects.map((project) => {
      const chargeType = (project.billingType?.chargeType ??
        "HOURLY") as BillingChargeType;
      return [project.id, !HOURLY_BILLING_TYPES.has(chargeType)];
    }),
  );
}

/**
 * Resolve, em UMA consulta, o conjunto de (projeto × competência) LIBERADAS —
 * i.e., com `RevenueClosing` `CLOSED` — para os lançamentos dados. A competência
 * é derivada da DATA de cada lançamento (não de `from`/`to`), então o filtro
 * "só liberados" vale mesmo com período aberto. Retorna um `Set` de chaves
 * `${projectId}:${yyyy}-${mm}` (ver `entryCompetenceKey`).
 *
 * § Melhorias v2 (decisão 2): Contas a Receber/Apuração passam a mostrar apenas
 * o que o Gerente de Área já liberou. Um projeto/competência sem CLOSED some.
 */
async function loadReleasedCompetences(
  entries: ReadonlyArray<ReceivablesEntry>,
): Promise<Set<string>> {
  const released = new Set<string>();
  if (entries.length === 0) return released;

  const projectIds = [...new Set(entries.map((e) => e.projectId))];
  // Competências distintas presentes nos lançamentos (yyyy-mm → {month, year}).
  const competenceMap = new Map<string, { month: number; year: number }>();
  for (const entry of entries) {
    const ym = entry.date.slice(0, 7); // yyyy-mm
    if (!competenceMap.has(ym)) {
      const [year, month] = ym.split("-").map(Number);
      competenceMap.set(ym, { month, year });
    }
  }
  const competences = [...competenceMap.values()];
  if (projectIds.length === 0 || competences.length === 0) return released;

  const closings = await prisma.revenueClosing.findMany({
    where: {
      status: "CLOSED",
      projectId: { in: projectIds },
      OR: competences.map((c) => ({ month: c.month, year: c.year })),
    },
    select: { projectId: true, month: true, year: true },
  });
  for (const closing of closings) {
    if (!closing.projectId) continue; // fechamentos por cliente não se aplicam
    released.add(
      closingCompetenceKey(closing.projectId, closing.month, closing.year),
    );
  }
  return released;
}

/**
 * Busca os lançamentos APPROVED do recorte (cliente/projeto(s)/período),
 * enriquecidos (horas efetivas, anexo, valor de venda). O filtro multi-projeto é
 * aplicado como `projectId in [...]`. Não filtra por `billable` (a lista por dia
 * mostra o toggle "Faturar?"); os agregadores decidem o que entra em cada card.
 *
 * "SÓ LIBERADOS" (§ Melhorias v2, decisão 2): após enriquecer, os lançamentos
 * são filtrados para apenas os cuja (projeto, competência) tem `RevenueClosing`
 * `CLOSED`. Assim TODA a jornada de recebíveis (dia + apuração) opera somente
 * sobre o que o Gerente de Área liberou.
 */
export async function loadReceivablesEntries(
  user: AppUser,
  filter: ReceivablesFilter,
): Promise<{ entries: ReceivablesEntry[]; includeFinancials: boolean }> {
  const scope = await resolveReportScope(user);
  const includeFinancials = scope.includeFinancials;
  if (!scopeHasUniverse(scope)) {
    return { entries: [], includeFinancials };
  }

  // Base where: mesmo builder de Relatórios (escopo + cliente + período +
  // status APPROVED). O projeto (multi) é aplicado depois como `in`.
  const where = buildHoursWhere(scope, {
    from: filter.from,
    to: filter.to,
    clientId: filter.clientId,
    status: "APPROVED",
  });
  if (filter.projectIds.length > 0) {
    where.projectId =
      filter.projectIds.length === 1
        ? filter.projectIds[0]
        : { in: filter.projectIds };
  }
  // Filtros adicionais (item 5/6): colaborador e "Faturar (Sim/Não)".
  if (filter.consultantId) {
    where.consultantId = filter.consultantId;
  }
  if (filter.billable !== undefined) {
    where.billable = filter.billable;
  }

  const rows = await prisma.timeEntry.findMany({
    where,
    select: {
      id: true,
      date: true,
      hours: true,
      multiplier: true,
      activityType: true,
      billable: true,
      consultantId: true,
      projectId: true,
      allocationId: true,
      consultant: { select: { name: true, contractType: true } },
      project: {
        select: { name: true, client: { select: { name: true } } },
      },
      attachment: { select: { fileName: true } },
    },
    orderBy: [{ date: "asc" }, { consultant: { name: "asc" } }],
  });

  const projectIds = rows.map((r) => r.projectId);
  const rateContexts = includeFinancials
    ? await loadProjectRateContexts(projectIds)
    : new Map();
  // Sinal estrutural (não financeiro): tipo de cobrança não-horário por projeto.
  const nonHourlyMap = await loadNonHourlyBillingMap(projectIds);

  const entries: ReceivablesEntry[] = rows.map((r) => {
    const hours = Number(r.hours);
    const effectiveHours = timeEntryEffectiveHours(hours, Number(r.multiplier));
    let saleRate: number | null = null;
    let billedAmount: number | null = null;
    if (includeFinancials) {
      saleRate = resolveBillingRate(rateContexts, r);
      billedAmount =
        saleRate != null
          ? Math.round(effectiveHours * saleRate * 100) / 100
          : null;
    }
    return {
      id: r.id,
      date: toIsoDate(r.date),
      consultantId: r.consultantId,
      consultantName: r.consultant.name,
      contractType: r.consultant.contractType,
      projectId: r.projectId,
      projectName: r.project.name,
      clientName: r.project.client.name,
      activityType: r.activityType,
      activityLabel: activityLabelOf(r.activityType),
      hours,
      effectiveHours,
      billable: r.billable,
      hasAttachment: r.attachment != null,
      attachmentFileName: r.attachment?.fileName ?? null,
      saleRate,
      billedAmount,
      nonHourlyBilling: nonHourlyMap.get(r.projectId) ?? false,
    };
  });

  // "Só liberados": mantém apenas lançamentos de (projeto, competência) já
  // CLOSED. Uma única consulta cruzada em memória (defesa: `entryCompetenceKey`).
  const released = await loadReleasedCompetences(entries);
  const releasedEntries = filterReleasedEntries(entries, released);

  return { entries: releasedEntries, includeFinancials };
}

/**
 * Visão principal da aba Contas a Receber (item 2 + 3): lançamentos agrupados
 * por dia + cards-resumo, em uma única leitura.
 */
export async function getReceivablesOverview(
  user: AppUser,
  filter: ReceivablesFilter,
): Promise<ReceivablesOverview> {
  const { entries, includeFinancials } = await loadReceivablesEntries(
    user,
    filter,
  );
  return {
    days: groupEntriesByDay(entries),
    summary: summarizeReceivables(entries, includeFinancials),
    includeFinancials,
  };
}

/**
 * Apuração do recorte (item 6): por projeto → consultor, com totais e taxa de
 * venda por alocado. Multi-projeto empilhável na UI.
 */
export async function getReceivablesApuracao(
  user: AppUser,
  filter: ReceivablesFilter,
): Promise<ApuracaoResult> {
  // Review BAIXO #7: a apuração/export nunca roda consulta all-time. Exigir o
  // período aqui é defesa em profundidade — o schema da rota (apuracaoFilterSchema)
  // já barra a chamada sem from/to, mas a leitura também recusa.
  if (!filter.from || !filter.to) {
    throw new Error(
      "Período (from/to) é obrigatório para apurar Contas a Receber.",
    );
  }
  const { entries, includeFinancials } = await loadReceivablesEntries(
    user,
    filter,
  );
  return buildApuracao(entries, includeFinancials);
}

/* -------------------------------------------------------------------------- */
/* Hidratação dos estados do servidor (Fix Wave 2 UI — review MÉDIO #2)         */
/* -------------------------------------------------------------------------- */

/** Estado de UMA competência (mês/ano) de um projeto na Apuração. */
export interface ApuracaoCompetenceState {
  month: number;
  year: number;
  closingId: string | null;
  /** `RevenueClosing` existe e está `CLOSED` (fechamento liberado). */
  closed: boolean;
  /** Pré-fatura já enviada (`AutomationEmailLog` PRE_INVOICE `SENT`). */
  sent: boolean;
}

/**
 * Estado agregado (por projeto) que a tela de Apuração hidrata NO CARREGAMENTO
 * (§0.6): sem precisar clicar, um projeto já `CLOSED` mostra "Enviar" habilitado
 * e um já enviado mostra "Apuração Enviada". Multi-competência é agregado
 * coerentemente (só "Enviado" se todas as competências CLOSED já foram enviadas).
 */
export interface ApuracaoProjectState {
  projectId: string;
  competences: ApuracaoCompetenceState[];
  /** Há ao menos uma competência `CLOSED` → habilita "Enviar Apuração". */
  anyClosed: boolean;
  /**
   * Há competência(s) `CLOSED` E todas elas já foram enviadas → o botão nasce
   * como "Apuração Enviada". Se só parte foi enviada, `anySent` detalha.
   */
  allSent: boolean;
  anySent: boolean;
  /** Competências já enviadas (para semear o reenvio EXPLÍCITO por competência). */
  sentCompetences: Array<{ month: number; year: number }>;
}

/**
 * Resolve o estado atual (por projeto e competência) do fechamento/envio para o
 * recorte da Apuração, lendo o BANCO — não a UI (review MÉDIO #2). Para cada
 * projeto do recorte e cada competência do período `from..to`:
 *   - `closed`: existe `RevenueClosing` (client+project+competência) em `CLOSED`;
 *   - `sent`: existe `AutomationEmailLog` PRE_INVOICE `SENT` para esse closing.
 *
 * Puramente de leitura (sem efeitos colaterais). Consumido por
 * `apuracao/page.tsx` para hidratar `ApuracaoView` sem exigir um clique. A tela
 * já é gated por FINANCIAL_ROLES e os `projectIds` vêm do escopo autorizado.
 */
export async function loadApuracaoStates(
  projectIds: string[],
  from: string,
  to: string,
): Promise<Map<string, ApuracaoProjectState>> {
  const uniqueIds = [...new Set(projectIds)].filter(Boolean);
  const result = new Map<string, ApuracaoProjectState>();
  if (uniqueIds.length === 0) return result;
  const months = monthsInRange(from, to);
  if (months.length === 0) return result;

  // Todos os fechamentos dos projetos do recorte nas competências do período.
  const closings = await prisma.revenueClosing.findMany({
    where: {
      projectId: { in: uniqueIds },
      OR: months.map((m) => ({ month: m.month, year: m.year })),
    },
    select: {
      id: true,
      projectId: true,
      month: true,
      year: true,
      status: true,
    },
  });

  // Estado de envio: um log PRE_INVOICE SENT por closing (dedupe/idempotência).
  const referenceKeys = closings.map((c) => preInvoiceReferenceKey(c));
  const sentKeys = new Set<string>();
  if (referenceKeys.length > 0) {
    const logs = await prisma.automationEmailLog.findMany({
      where: {
        type: "PRE_INVOICE",
        status: "SENT",
        referenceKey: { in: referenceKeys },
      },
      select: { referenceKey: true },
    });
    for (const log of logs) sentKeys.add(log.referenceKey);
  }

  const byProject = new Map<string, typeof closings>();
  for (const closing of closings) {
    const list = byProject.get(closing.projectId ?? "") ?? [];
    list.push(closing);
    byProject.set(closing.projectId ?? "", list);
  }

  for (const projectId of uniqueIds) {
    const list = byProject.get(projectId) ?? [];
    const competences: ApuracaoCompetenceState[] = list.map((closing) => {
      const closed = closing.status === "CLOSED";
      const sent =
        closed && sentKeys.has(preInvoiceReferenceKey(closing));
      return {
        month: closing.month,
        year: closing.year,
        closingId: closing.id,
        closed,
        sent,
      };
    });
    const closed = competences.filter((c) => c.closed);
    const sentCompetences = closed
      .filter((c) => c.sent)
      .map((c) => ({ month: c.month, year: c.year }));
    result.set(projectId, {
      projectId,
      competences,
      anyClosed: closed.length > 0,
      // "Apuração Enviada" só quando há fechamento(s) e TODOS já foram enviados.
      allSent: closed.length > 0 && sentCompetences.length === closed.length,
      anySent: sentCompetences.length > 0,
      sentCompetences,
    });
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* "Pendentes de Fechamento" (§ Melhorias v2) — loader server-side            */
/* -------------------------------------------------------------------------- */

/**
 * Lista, para uma competência (mês/ano), UMA linha por projeto ATIVO com horas
 * lançadas (APPROVED) e o status de fechamento (LIBERADO/PENDENTE/SEM_LANCAMENTO)
 * — a base da tela "Pendentes de Fechamento" (§ Melhorias v2). TODOS os projetos
 * ativos entram (mesmo com 0h); a UI só habilita "Liberar" para `PENDENTE`.
 *
 * Escopo/RBAC (defesa em profundidade — a PÁGINA é gated por
 * PENDING_CLOSING_ROLES em outra wave): usa o MESMO `resolveReportScope` de
 * Relatórios. Consequências do escopo atual:
 *  - ADMIN / AREA_MANAGER / FINANCE → `scope.broad` = true → veem TODOS os
 *    projetos ativos (AREA_MANAGER NÃO é restrito a "seus" projetos aqui, pois
 *    `resolveReportScope` o trata como broad, igual a Relatórios/Fechamento).
 *  - PROJECT_MANAGER → restrito aos projetos que gerencia (`managerUserId`).
 *  - CONSULTANT / sem escopo gerencial → sem universo de projetos → vazio
 *    (nunca deveria chegar aqui: a rota é gated).
 *
 * `hours` = Σ horas EFETIVAS (`hours × multiplier`) dos lançamentos APPROVED da
 * competência (mesma fonte única do resto da jornada). O status `PENDENTE`/
 * `SEM_LANCAMENTO` é decidido pela EXISTÊNCIA de lançamento APPROVED (contagem),
 * não por `hours == 0`. `LIBERADO` tem precedência (RevenueClosing `CLOSED`).
 */
export async function listPendingClosings(
  user: AppUser,
  period: { month: number; year: number },
): Promise<PendingClosingsResult> {
  const { month, year } = period;
  const bounds = competenceBounds(month, year);
  const empty: PendingClosingsResult = {
    month,
    year,
    from: bounds.from,
    to: bounds.to,
    rows: [],
    pendingCount: 0,
  };

  const scope = await resolveReportScope(user);
  if (!scopeHasUniverse(scope)) return empty;
  // Só perfis com universo de PROJETOS (broad ou gerente) listam projetos. Um
  // escopo apenas-consultor não deve enumerar projetos (defesa; rota é gated).
  if (!scope.broad && !scope.managerUserId) return empty;

  // 1) Projetos ATIVOS no escopo (broad = todos; PROJECT_MANAGER = gerenciados).
  const projectWhere: Record<string, unknown> = { status: "ACTIVE" };
  if (!scope.broad && scope.managerUserId) {
    projectWhere.managerUserId = scope.managerUserId;
  }
  const projects = await prisma.project.findMany({
    where: projectWhere,
    select: {
      id: true,
      name: true,
      clientId: true,
      client: { select: { name: true } },
    },
    orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
  });
  if (projects.length === 0) return empty;

  const projectIds = projects.map((p) => p.id);

  // 2) Horas APPROVED da competência por projeto (reusa o where de Relatórios).
  const hoursWhere = buildHoursWhere(scope, {
    from: bounds.from,
    to: bounds.to,
    status: "APPROVED",
  });
  hoursWhere.projectId = { in: projectIds };
  const timeRows = await prisma.timeEntry.findMany({
    where: hoursWhere,
    select: { projectId: true, hours: true, multiplier: true },
  });
  const hoursByProject = new Map<string, number>();
  const hasEntries = new Set<string>();
  for (const row of timeRows) {
    hasEntries.add(row.projectId);
    const effective = timeEntryEffectiveHours(
      Number(row.hours),
      Number(row.multiplier),
    );
    hoursByProject.set(
      row.projectId,
      (hoursByProject.get(row.projectId) ?? 0) + effective,
    );
  }

  // 3) Fechamentos da competência por projeto (qualquer status → closingId;
  //    LIBERADO só quando CLOSED).
  const closings = await prisma.revenueClosing.findMany({
    where: { projectId: { in: projectIds }, month, year },
    select: { id: true, projectId: true, status: true },
  });
  const closingByProject = new Map<
    string,
    { id: string; status: string }
  >();
  for (const closing of closings) {
    if (!closing.projectId) continue;
    // Se houver mais de um (não deveria pelo unique), o CLOSED tem precedência.
    const current = closingByProject.get(closing.projectId);
    if (!current || closing.status === "CLOSED") {
      closingByProject.set(closing.projectId, {
        id: closing.id,
        status: closing.status,
      });
    }
  }

  const rows: PendingClosingRow[] = projects.map((project) => {
    const closing = closingByProject.get(project.id) ?? null;
    const closed = closing?.status === "CLOSED";
    const invoiced = closing?.status === "INVOICED";
    const status = classifyPendingStatus(
      hasEntries.has(project.id),
      closed,
      invoiced,
    );
    return {
      projectId: project.id,
      projectName: project.name,
      clientId: project.clientId,
      clientName: project.client.name,
      hours: Math.round((hoursByProject.get(project.id) ?? 0) * 100) / 100,
      status,
      closingId: closing?.id ?? null,
      month,
      year,
      from: bounds.from,
      to: bounds.to,
    };
  });

  return {
    month,
    year,
    from: bounds.from,
    to: bounds.to,
    rows,
    pendingCount: countPendingRows(rows),
  };
}

/**
 * Contador de projetos PENDENTES de fechamento na competência — base do badge
 * da home (§ Melhorias v2). Deriva de `listPendingClosings` (sem lógica
 * duplicada). Respeita o mesmo escopo/RBAC do loader.
 */
export async function countPendingClosings(
  user: AppUser,
  period: { month: number; year: number },
): Promise<number> {
  const { pendingCount } = await listPendingClosings(user, period);
  return pendingCount;
}
