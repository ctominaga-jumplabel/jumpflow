import { z } from "zod";

import { parseIsoDateUtc } from "@/lib/timesheet/week";
import {
  buildWorkbook,
  defineSheet,
  type XlsxColumn,
} from "@/lib/export/xlsx";

/**
 * Núcleo PURO da jornada "Contas a Receber" (filtro, tipos, agregadores e
 * shaping do export). Sem dependências de auth/banco — seguro para testes de
 * cálculo (a fonte de dados é mockada como `ReceivablesEntry[]`). A camada de
 * banco (RBAC/escopo + query) vive em `receivables-journey.ts`, que reexporta
 * tudo daqui.
 *
 * Ver docs/proposta-contas-a-receber/README.md §3 (itens 2, 3, 4, 6, 7).
 *
 * Fonte de verdade dos valores (resolvida na camada de banco):
 * - Horas do lançamento = equivalente remunerável `hours × multiplier`
 *   (`timeEntryEffectiveHours`, fonte única — igual a revenue/payment/fechamento).
 * - Valor/hora (venda) = `resolveSaleRate` (alocação → consultor → projeto →
 *   fallback de projeto/cliente).
 * - Valor a faturar = `horas efetivas × valor de venda`, só para lançamentos
 *   APPROVED **e** `billable = true` (o faturamento ignora não faturáveis).
 */

/* -------------------------------------------------------------------------- */
/* Filtro                                                                      */
/* -------------------------------------------------------------------------- */

function blankToUndefined(value: unknown): unknown {
  if (value === null) return undefined;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "ALL") return undefined;
  return trimmed;
}

const isoDateSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .refine((value) => parseIsoDateUtc(value) !== null, {
      message: "Data inválida (use o formato aaaa-mm-dd).",
    })
    .optional(),
);

/** Mesma validação de data, porém OBRIGATÓRIA (apuração/export exigem período). */
const requiredIsoDateSchema = z.preprocess(
  blankToUndefined,
  z.string({ message: "Informe a data." }).refine(
    (value) => parseIsoDateUtc(value) !== null,
    { message: "Data inválida (use o formato aaaa-mm-dd)." },
  ),
);

const idFilterSchema = z.preprocess(
  blankToUndefined,
  z.string().min(1).optional(),
);

/**
 * Aceita `projectIds` como array OU um único valor (compat com links). Strings
 * vazias/`ALL` são descartadas e duplicatas removidas; retorna um array
 * (possivelmente vazio).
 */
const projectIdsSchema = z.preprocess((value) => {
  const raw = Array.isArray(value)
    ? value
    : value === undefined || value === null
      ? []
      : [value];
  const cleaned = raw
    .map((item) => blankToUndefined(item))
    .filter((item): item is string => typeof item === "string");
  return [...new Set(cleaned)];
}, z.array(z.string().min(1)));

export const receivablesFilterSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    clientId: idFilterSchema,
    projectIds: projectIdsSchema,
  })
  .superRefine((value, ctx) => {
    if (value.from && value.to && value.to < value.from) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "A data final deve ser maior ou igual à inicial.",
      });
    }
  });

export type ReceivablesFilter = z.infer<typeof receivablesFilterSchema>;

/**
 * Filtro da APURAÇÃO e do EXPORT da apuração (review BAIXO #7): idêntico ao
 * filtro da tela principal, mas com `from`/`to` OBRIGATÓRIOS. A tela principal
 * (lançamentos por dia) segue com período opcional (`receivablesFilterSchema`),
 * mas a apuração/export nunca deve rodar consulta all-time — sem período o
 * parse falha com validação clara. `clientId`/`projectIds` seguem opcionais.
 */
export const apuracaoFilterSchema = z
  .object({
    from: requiredIsoDateSchema,
    to: requiredIsoDateSchema,
    clientId: idFilterSchema,
    projectIds: projectIdsSchema,
  })
  .superRefine((value, ctx) => {
    if (value.to < value.from) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "A data final deve ser maior ou igual à inicial.",
      });
    }
  });

export type ApuracaoFilter = z.infer<typeof apuracaoFilterSchema>;

/**
 * Enumera as competências (ano, mês) que se sobrepõem a um range ISO inclusivo
 * (`from`/`to` no formato yyyy-mm-dd). Núcleo puro do "Enviar Apuração"
 * multi-competência (§0 decisão 8 + item 7): a action resolve um `RevenueClosing`
 * por competência retornada. Pressupõe `from <= to` (garantido pelo schema da
 * action); tem um teto de segurança de 240 meses (20 anos).
 */
export function monthsInRange(
  from: string,
  to: string,
): Array<{ month: number; year: number }> {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  const out: Array<{ month: number; year: number }> = [];
  let year = fromYear;
  let month = fromMonth;
  while (year < toYear || (year === toYear && month <= toMonth)) {
    out.push({ month, year });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if (out.length > 240) break; // safety cap (20 years)
  }
  return out;
}

/**
 * Bounds ISO (primeiro/último dia) de UMA competência (mês/ano). Puro e
 * determinístico (usa `Date.UTC` com argumentos explícitos — NUNCA `new Date()`
 * sem argumento — para calcular o último dia, então é seguro em teste). Espelha
 * `monthRangeIso` (privado em actions.ts); usado pela tela "Pendentes de
 * Fechamento" para montar o `from`/`to` que alimenta `fecharApuracao` por
 * competência (§ Melhorias v2). `month` é 1-based (1 = janeiro).
 */
export function competenceBounds(
  month: number,
  year: number,
): { from: string; to: string } {
  const mm = String(month).padStart(2, "0");
  // day 0 do mês seguinte (1-based `month` = índice `month` 0-based) = último
  // dia do mês corrente. Determinístico: só depende de month/year.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

/* -------------------------------------------------------------------------- */
/* "Só liberados": cruzamento lançamento × fechamento CLOSED (puro)            */
/* -------------------------------------------------------------------------- */

/**
 * Chave estável (projeto + competência) para cruzar um LANÇAMENTO com um
 * FECHAMENTO. Deriva a competência do próprio lançamento (mês/ano da data), então
 * o filtro "só liberados" independe de `from`/`to` do recorte. Formato:
 * `${projectId}:${yyyy}-${mm}` (mesma competência que `preInvoiceReferenceKey`).
 */
export function entryCompetenceKey(projectId: string, isoDate: string): string {
  // isoDate = yyyy-mm-dd → yyyy-mm (competência).
  return `${projectId}:${isoDate.slice(0, 7)}`;
}

/**
 * Mesma chave a partir de um fechamento (projeto + mês/ano). A camada de banco
 * monta um `Set` dessas chaves para os `RevenueClosing` `CLOSED` do recorte.
 */
export function closingCompetenceKey(
  projectId: string,
  month: number,
  year: number,
): string {
  const mm = String(month).padStart(2, "0");
  return `${projectId}:${year}-${mm}`;
}

/**
 * Filtra lançamentos mantendo APENAS os cuja (projeto, competência) está
 * LIBERADA — i.e., existe um `RevenueClosing` `CLOSED` para aquele projeto na
 * competência do lançamento (§ Melhorias v2, decisão 2). Puro/testável: a camada
 * de banco resolve `releasedKeys` (uma consulta) e passa aqui. Um lançamento sem
 * fechamento CLOSED na sua competência NÃO entra em Contas a Receber/Apuração.
 */
export function filterReleasedEntries(
  entries: ReadonlyArray<ReceivablesEntry>,
  releasedKeys: ReadonlySet<string>,
): ReceivablesEntry[] {
  return entries.filter((entry) =>
    releasedKeys.has(entryCompetenceKey(entry.projectId, entry.date)),
  );
}

/* -------------------------------------------------------------------------- */
/* "Pendentes de Fechamento" (§ Melhorias v2) — tipos + classificação pura     */
/* -------------------------------------------------------------------------- */

/**
 * Status de UM projeto na competência da tela "Pendentes de Fechamento":
 * - `LIBERADO`: existe `RevenueClosing` `CLOSED` (aparece em Contas a Receber);
 * - `PENDENTE`: há lançamento APPROVED na competência e ainda NÃO está `CLOSED`
 *   → habilita "Liberar" (ADMIN/AREA_MANAGER);
 * - `SEM_LANCAMENTO`: nenhum lançamento APPROVED (0h) → sem ação.
 */
export type PendingClosingStatus = "LIBERADO" | "PENDENTE" | "SEM_LANCAMENTO";

/**
 * Classifica o status de um projeto na competência. Puro: `closed` tem
 * precedência (um fechamento CLOSED sempre é LIBERADO, mesmo que a leitura de
 * horas do recorte não retorne linhas). Sem fechamento CLOSED, `hasEntries`
 * separa PENDENTE de SEM_LANCAMENTO.
 */
export function classifyPendingStatus(
  hasEntries: boolean,
  closed: boolean,
): PendingClosingStatus {
  if (closed) return "LIBERADO";
  if (hasEntries) return "PENDENTE";
  return "SEM_LANCAMENTO";
}

/** Uma linha da tela "Pendentes de Fechamento" (um projeto ATIVO na competência). */
export interface PendingClosingRow {
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  /** Σ horas efetivas APPROVED do projeto na competência (0 sem lançamento). */
  hours: number;
  status: PendingClosingStatus;
  /** `RevenueClosing.id` da competência, quando existir (qualquer status). */
  closingId: string | null;
  /** Competência (para a UI reconstruir bounds / chamar `fecharApuracao`). */
  month: number;
  year: number;
  /** Bounds ISO da competência: alimentam `fecharApuracao({projectId, from, to})`. */
  from: string;
  to: string;
}

/** Resultado do loader "Pendentes de Fechamento" (uma competência). */
export interface PendingClosingsResult {
  month: number;
  year: number;
  from: string;
  to: string;
  rows: PendingClosingRow[];
  /** Nº de projetos `PENDENTE` (badge da home / contador). */
  pendingCount: number;
}

/** Conta as linhas `PENDENTE` (base do badge/contador). Puro. */
export function countPendingRows(
  rows: ReadonlyArray<PendingClosingRow>,
): number {
  return rows.filter((row) => row.status === "PENDENTE").length;
}

/* -------------------------------------------------------------------------- */
/* Tipos de retorno (consumidos pela UI — Wave B/C)                           */
/* -------------------------------------------------------------------------- */

/** Um lançamento (TimeEntry APPROVED) enriquecido para a jornada. */
export interface ReceivablesEntry {
  id: string;
  /** ISO date yyyy-mm-dd. */
  date: string;
  consultantId: string;
  consultantName: string;
  projectId: string;
  projectName: string;
  clientName: string;
  /** Código bruto da atividade (ex.: "WORKDAY", "ON_CALL"). */
  activityType: string;
  /** Rótulo pt-BR da atividade (via `activityLabelOf`). */
  activityLabel: string;
  /** Horas registradas (brutas), como digitadas no lançamento. */
  hours: number;
  /** Horas efetivas (remuneráveis) = `hours × multiplier`. */
  effectiveHours: number;
  billable: boolean;
  hasAttachment: boolean;
  /** Nome do arquivo do anexo, quando houver (o link é assinado na UI). */
  attachmentFileName: string | null;
  /** FINANCIAL_ROLES: valor/hora de venda resolvido; null quando sem taxa. */
  saleRate: number | null;
  /** FINANCIAL_ROLES: `effectiveHours × saleRate`; null quando sem taxa. */
  billedAmount: number | null;
  /**
   * true quando a cobrança do projeto é NÃO-HORÁRIA (fixo/mensal/pacote/etc.):
   * nesses casos o valor exibido (horas × venda) é apenas um indicativo e pode
   * DIVERGIR do `RevenueClosing.totalAmount` real (o motor de faturamento aplica
   * a regra do tipo de cobrança). Sinal estrutural (não mascarado por RBAC).
   */
  nonHourlyBilling: boolean;
}

/** Um dia com seus lançamentos e o total de horas (efetivas) do dia. */
export interface ReceivablesDayGroup {
  /** ISO date yyyy-mm-dd. */
  date: string;
  /** Soma das horas efetivas de TODOS os lançamentos do dia (billable ou não). */
  totalHours: number;
  entries: ReceivablesEntry[];
}

/** Cards-resumo do recorte (item 2). Base: APPROVED + billable. */
export interface ReceivablesSummary {
  /** Σ horas efetivas (APPROVED + billable). */
  totalHours: number;
  /** Σ (horas efetivas × valor de venda) (APPROVED + billable). Null sem financials. */
  totalToInvoice: number | null;
  /** Nº de consultores distintos no recorte (APPROVED + billable). */
  allocatedCount: number;
  /**
   * QA + review #3 (alerta de SUBFATURAMENTO): Σ horas efetivas de lançamentos
   * FATURÁVEIS cuja taxa de venda NÃO foi resolvida (`saleRate == null`). Essas
   * horas contam em `totalHours` mas NÃO em `totalToInvoice` — a UI deve alertar.
   * Só é calculável com financials (sem eles `saleRate` é sempre null); vira 0.
   */
  unratedBillableHours: number;
  /** true quando algum projeto do recorte tem cobrança não-horária (ver flag do entry). */
  hasNonHourlyBilling: boolean;
}

/** Uma linha de apuração por alocado (item 6). */
export interface ApuracaoConsultantRow {
  consultantId: string;
  consultantName: string;
  /** Σ horas efetivas (APPROVED + billable) do consultor no projeto. */
  totalHours: number;
  /** Valor/hora (venda) representativo = média ponderada; null sem financials. */
  saleRate: number | null;
  /** Σ (horas efetivas × valor de venda); null sem financials. */
  totalAmount: number | null;
}

/** Apuração de UM projeto (empilhável na UI). */
export interface ApuracaoProject {
  projectId: string;
  projectName: string;
  clientName: string;
  consultants: ApuracaoConsultantRow[];
  /** Total de horas efetivas do projeto (APPROVED + billable). */
  totalHours: number;
  /** Total a faturar do projeto; null sem financials. */
  totalAmount: number | null;
  /**
   * QA + review #3: Σ horas faturáveis do projeto sem `saleRate` resolvido
   * (subfaturamento). Só calculável com financials; 0 caso contrário.
   */
  unratedBillableHours: number;
  /**
   * true quando a cobrança do projeto é NÃO-HORÁRIA (fixo/mensal/etc.): o
   * `totalAmount` (horas × venda) é indicativo e pode divergir do
   * `RevenueClosing.totalAmount`. Sinal estrutural (não mascarado por RBAC).
   */
  nonHourlyBilling: boolean;
}

/** Resultado da apuração (multi-projeto empilhado + totais gerais). */
export interface ApuracaoResult {
  projects: ApuracaoProject[];
  grandTotalHours: number;
  grandTotalAmount: number | null;
  /** QA + review #3: Σ horas faturáveis sem `saleRate` resolvido no recorte todo. */
  grandUnratedBillableHours: number;
  /** true quando algum projeto do recorte tem cobrança não-horária. */
  hasNonHourlyBilling: boolean;
  includeFinancials: boolean;
}

export interface ReceivablesOverview {
  days: ReceivablesDayGroup[];
  summary: ReceivablesSummary;
  includeFinancials: boolean;
}

/* -------------------------------------------------------------------------- */
/* Tipos do envio da apuração (action `enviarApuracao` — impl. em actions.ts)  */
/* -------------------------------------------------------------------------- */

/**
 * Estado do envio da pré-fatura por competência.
 * - `SENT`: enviado agora.
 * - `ALREADY_SENT`: já enviado antes (dedupe `AutomationEmailLog`). Sem entrar em
 *   `resendCompetences`, a UI mostra "Apuração Enviada" e pede confirmação.
 * - `NOT_CLOSED`: o `RevenueClosing` da competência não existe ou ainda não está
 *   `CLOSED` — aguardando o fechamento explícito pelo Gerente de Área.
 * - `NO_CONTACT_EMAIL`: cliente sem e-mail de cobrança (degrade honesto).
 * - `SKIPPED_OFF`: regra de notificação `PRE_INVOICE_ISSUED` desligada.
 * - `ERROR`: falha inesperada / status incompatível (ex.: INVOICED/CANCELLED) /
 *   fechamento sem valor a faturar.
 */
export type CompetenceSendStatus =
  | "SENT"
  | "ALREADY_SENT"
  | "NOT_CLOSED"
  | "NO_CONTACT_EMAIL"
  | "SKIPPED_OFF"
  | "ERROR";

/** Resultado do envio de UMA competência (mês/ano). */
export interface CompetenceSendResult {
  month: number;
  year: number;
  closingId: string | null;
  emailed: boolean;
  alreadySent: boolean;
  status: CompetenceSendStatus;
  message?: string;
}

/** Resultado da action `enviarApuracao` (por projeto, multi-competência). */
export interface EnviarApuracaoResult {
  clientId: string;
  projectId: string;
  from: string;
  to: string;
  competences: CompetenceSendResult[];
  /** true quando toda competência elegível está SENT ou ALREADY_SENT. */
  allSent: boolean;
  /**
   * true quando alguma competência já estava enviada e NÃO veio em
   * `resendCompetences` — a UI deve confirmar o reenvio dessas competências.
   */
  needsConfirmResend: boolean;
}

/* -------------------------------------------------------------------------- */
/* Tipos do fechamento da apuração (action `fecharApuracao` — em actions.ts)   */
/* -------------------------------------------------------------------------- */

/**
 * Estado do fechamento (CLOSE) por competência — passo do Gerente de Área.
 * - `CLOSED`: fechado agora (dispara `HOURS_RELEASED`).
 * - `ALREADY_CLOSED`: já estava `CLOSED` (idempotente).
 * - `GENERATED_EMPTY`: `RevenueClosing` existe/gerado mas com `totalAmount <= 0`
 *   — NÃO fechado (não se fecha/gera pré-fatura vazia).
 * - `NOT_FOUND`: sem horas faturáveis na competência — nada a gerar/fechar.
 * - `ERROR`: status incompatível (INVOICED/CANCELLED) ou falha ao fechar.
 */
export type CompetenceCloseStatus =
  | "CLOSED"
  | "ALREADY_CLOSED"
  | "GENERATED_EMPTY"
  | "NOT_FOUND"
  | "ERROR";

/** Resultado do fechamento de UMA competência (mês/ano). */
export interface CompetenceCloseResult {
  month: number;
  year: number;
  closingId: string | null;
  status: CompetenceCloseStatus;
  message?: string;
}

/** Resultado da action `fecharApuracao` (por projeto, multi-competência). */
export interface FecharApuracaoResult {
  clientId: string;
  projectId: string;
  from: string;
  to: string;
  competences: CompetenceCloseResult[];
  /** true quando toda competência elegível está CLOSED ou ALREADY_CLOSED. */
  allClosed: boolean;
}

/* -------------------------------------------------------------------------- */
/* Agregadores puros (testáveis sem banco)                                    */
/* -------------------------------------------------------------------------- */

/** Arredonda para 2 casas (mesma convenção de `timeEntryEffectiveHours`). */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Agrupa lançamentos por dia (ISO), somando as horas EFETIVAS do dia (todos os
 * lançamentos, billable ou não — a lista mostra o toggle "Faturar?"). Dias
 * ordenados asc; lançamentos ordenados por nome do consultor.
 */
export function groupEntriesByDay(
  entries: ReadonlyArray<ReceivablesEntry>,
): ReceivablesDayGroup[] {
  const byDate = new Map<string, ReceivablesEntry[]>();
  for (const entry of entries) {
    const list = byDate.get(entry.date) ?? [];
    list.push(entry);
    byDate.set(entry.date, list);
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, list]) => ({
      date,
      totalHours: round2(list.reduce((sum, e) => sum + e.effectiveHours, 0)),
      entries: [...list].sort((a, b) =>
        a.consultantName.localeCompare(b.consultantName, "pt-BR"),
      ),
    }));
}

/**
 * Cards-resumo do recorte. Base: APPROVED + billable (o faturamento ignora não
 * faturáveis). `totalToInvoice` é null quando o leitor não tem financials.
 */
export function summarizeReceivables(
  entries: ReadonlyArray<ReceivablesEntry>,
  includeFinancials: boolean,
): ReceivablesSummary {
  const billable = entries.filter((e) => e.billable);
  const totalHours = round2(
    billable.reduce((sum, e) => sum + e.effectiveHours, 0),
  );
  const consultants = new Set(billable.map((e) => e.consultantId));
  const hasNonHourlyBilling = billable.some((e) => e.nonHourlyBilling);
  if (!includeFinancials) {
    return {
      totalHours,
      totalToInvoice: null,
      allocatedCount: consultants.size,
      // Sem financials não dá para saber quais horas ficaram sem taxa (saleRate
      // é sempre null por RBAC) — não sinalizamos subfaturamento falso.
      unratedBillableHours: 0,
      hasNonHourlyBilling,
    };
  }
  const totalToInvoice = round2(
    billable.reduce((sum, e) => sum + (e.billedAmount ?? 0), 0),
  );
  const unratedBillableHours = round2(
    billable
      .filter((e) => e.saleRate == null)
      .reduce((sum, e) => sum + e.effectiveHours, 0),
  );
  return {
    totalHours,
    totalToInvoice,
    allocatedCount: consultants.size,
    unratedBillableHours,
    hasNonHourlyBilling,
  };
}

/**
 * Apuração por projeto → consultor. Base: APPROVED + billable. `saleRate` da
 * linha é a média ponderada (`totalAmount / totalHours`), estável quando todas
 * as taxas do consultor no projeto são iguais (caso comum). Sem financials,
 * `saleRate`/`totalAmount`/totais monetários ficam nulos.
 */
export function buildApuracao(
  entries: ReadonlyArray<ReceivablesEntry>,
  includeFinancials: boolean,
): ApuracaoResult {
  const billable = entries.filter((e) => e.billable);

  interface ConsultantAcc {
    consultantId: string;
    consultantName: string;
    totalHours: number;
    totalAmount: number;
  }
  interface ProjectAcc {
    projectId: string;
    projectName: string;
    clientName: string;
    totalHours: number;
    totalAmount: number;
    unratedBillableHours: number;
    nonHourlyBilling: boolean;
    consultants: Map<string, ConsultantAcc>;
  }

  const projects = new Map<string, ProjectAcc>();
  for (const entry of billable) {
    let project = projects.get(entry.projectId);
    if (!project) {
      project = {
        projectId: entry.projectId,
        projectName: entry.projectName,
        clientName: entry.clientName,
        totalHours: 0,
        totalAmount: 0,
        unratedBillableHours: 0,
        nonHourlyBilling: false,
        consultants: new Map(),
      };
      projects.set(entry.projectId, project);
    }
    let consultant = project.consultants.get(entry.consultantId);
    if (!consultant) {
      consultant = {
        consultantId: entry.consultantId,
        consultantName: entry.consultantName,
        totalHours: 0,
        totalAmount: 0,
      };
      project.consultants.set(entry.consultantId, consultant);
    }
    consultant.totalHours += entry.effectiveHours;
    project.totalHours += entry.effectiveHours;
    const amount = entry.billedAmount ?? 0;
    consultant.totalAmount += amount;
    project.totalAmount += amount;
    project.nonHourlyBilling ||= entry.nonHourlyBilling;
    // Subfaturamento: hora faturável sem taxa de venda resolvida. Só é
    // detectável com financials (senão saleRate é sempre null por RBAC).
    if (includeFinancials && entry.saleRate == null) {
      project.unratedBillableHours += entry.effectiveHours;
    }
  }

  let grandTotalHours = 0;
  let grandTotalAmount = 0;
  let grandUnratedBillableHours = 0;
  const projectList: ApuracaoProject[] = [...projects.values()]
    .sort(
      (a, b) =>
        a.clientName.localeCompare(b.clientName, "pt-BR") ||
        a.projectName.localeCompare(b.projectName, "pt-BR"),
    )
    .map((project) => {
      grandTotalHours += project.totalHours;
      grandTotalAmount += project.totalAmount;
      grandUnratedBillableHours += project.unratedBillableHours;
      const consultants: ApuracaoConsultantRow[] = [
        ...project.consultants.values(),
      ]
        .sort((a, b) => a.consultantName.localeCompare(b.consultantName, "pt-BR"))
        .map((consultant) => ({
          consultantId: consultant.consultantId,
          consultantName: consultant.consultantName,
          totalHours: round2(consultant.totalHours),
          saleRate: includeFinancials
            ? consultant.totalHours > 0
              ? round2(consultant.totalAmount / consultant.totalHours)
              : null
            : null,
          totalAmount: includeFinancials ? round2(consultant.totalAmount) : null,
        }));
      return {
        projectId: project.projectId,
        projectName: project.projectName,
        clientName: project.clientName,
        consultants,
        totalHours: round2(project.totalHours),
        totalAmount: includeFinancials ? round2(project.totalAmount) : null,
        unratedBillableHours: round2(project.unratedBillableHours),
        nonHourlyBilling: project.nonHourlyBilling,
      };
    });

  return {
    projects: projectList,
    grandTotalHours: round2(grandTotalHours),
    grandTotalAmount: includeFinancials ? round2(grandTotalAmount) : null,
    grandUnratedBillableHours: round2(grandUnratedBillableHours),
    hasNonHourlyBilling: projectList.some((p) => p.nonHourlyBilling),
    includeFinancials,
  };
}

/* -------------------------------------------------------------------------- */
/* Export Excel da apuração (dados/colunas prontos — rota HTTP na Wave C)      */
/* -------------------------------------------------------------------------- */

/** Uma linha achatada do export da apuração (um alocado dentro de um projeto). */
export interface ApuracaoExportRow {
  projectName: string;
  clientName: string;
  consultantName: string;
  totalHours: number;
  saleRate: number | null;
  totalAmount: number | null;
}

const MONEY_FMT = "#,##0.00";

/** Colunas do "Exportar Excel" da apuração (resumo por alocado). */
export function apuracaoExportColumns(): XlsxColumn<ApuracaoExportRow>[] {
  return [
    { header: "Cliente", value: (r) => r.clientName, width: 22 },
    { header: "Projeto", value: (r) => r.projectName, width: 24 },
    { header: "Alocado", value: (r) => r.consultantName, width: 24 },
    {
      header: "Total de Horas",
      value: (r) => r.totalHours,
      numFmt: MONEY_FMT,
      width: 16,
    },
    {
      header: "Valor/Hora (Venda)",
      value: (r) => r.saleRate ?? null,
      numFmt: MONEY_FMT,
      width: 18,
    },
    {
      header: "Valor Total",
      value: (r) => r.totalAmount ?? null,
      numFmt: MONEY_FMT,
      width: 16,
    },
  ];
}

/** Achata a apuração (multi-projeto) em linhas de export (um alocado por linha). */
export function apuracaoExportRows(
  apuracao: ApuracaoResult,
): ApuracaoExportRow[] {
  return apuracao.projects.flatMap((project) =>
    project.consultants.map((consultant) => ({
      projectName: project.projectName,
      clientName: project.clientName,
      consultantName: consultant.consultantName,
      totalHours: consultant.totalHours,
      saleRate: consultant.saleRate,
      totalAmount: consultant.totalAmount,
    })),
  );
}

interface ApuracaoResumoRow {
  label: string;
  totalHours: number;
  totalAmount: number | null;
}

/** Linhas do resumo (totais por projeto + total geral) do export. */
export function apuracaoResumoRows(
  apuracao: ApuracaoResult,
): ApuracaoResumoRow[] {
  const rows: ApuracaoResumoRow[] = apuracao.projects.map((project) => ({
    label: `${project.clientName} / ${project.projectName}`,
    totalHours: project.totalHours,
    totalAmount: project.totalAmount,
  }));
  rows.push({
    label: "Total geral",
    totalHours: apuracao.grandTotalHours,
    totalAmount: apuracao.grandTotalAmount,
  });
  return rows;
}

/**
 * Monta o workbook `.xlsx` da apuração (aba "Apuração" com um alocado por linha +
 * aba "Resumo" com totais por projeto + total geral). Reaproveita
 * `buildWorkbook`/`defineSheet`. A rota HTTP (com RBAC/filtros) fica para a
 * Wave C — esta função só serializa dados já autorizados.
 */
export async function buildApuracaoWorkbook(
  apuracao: ApuracaoResult,
): Promise<Buffer> {
  return buildWorkbook([
    defineSheet({
      name: "Apuração",
      rows: apuracaoExportRows(apuracao),
      columns: apuracaoExportColumns(),
    }),
    defineSheet({
      name: "Resumo",
      rows: apuracaoResumoRows(apuracao),
      columns: [
        { header: "Projeto", value: (r) => r.label, width: 40 },
        {
          header: "Total de Horas",
          value: (r) => r.totalHours,
          numFmt: MONEY_FMT,
          width: 16,
        },
        {
          header: "Total a Faturar",
          value: (r) => r.totalAmount ?? null,
          numFmt: MONEY_FMT,
          width: 18,
        },
      ],
    }),
  ]);
}
