/**
 * Avaliacao do SLA do fluxo de horas (item 5). PURO: recebe os dados brutos da
 * competencia (carregados por `lib/db/sla.ts`) e devolve, por processo e etapa,
 * o status de cada item e os agregados da tela/job.
 *
 * Origem da conclusao de cada etapa (todas a partir de dados JA existentes):
 * - TIMESHEET_SUBMISSION (por consultor): todo dia util do mes coberto pelas
 *   alocacoes ACTIVE/ENDED em projetos com `dailyEntryRequired` tem ao menos um
 *   lancamento SUBMITTED/APPROVED/CLOSED (em qualquer projeto). Conclusao = o
 *   instante em que o ULTIMO dia ficou coberto (max dos min(submittedAt) por dia).
 * - MANAGER_APPROVAL (por consultor x projeto): nenhum lancamento DRAFT/SUBMITTED
 *   restante (REJECTED e ignorado). Conclusao = max(Approval.createdAt APPROVED)
 *   dos lancamentos, com fallback em TimeEntry.updatedAt.
 * - OPERATION_CLOSING (por projeto com horas no mes): OperationClosing CLOSED;
 *   conclusao = closedAt (fallback updatedAt).
 * - BILLING_RELEASE (por projeto com horas faturaveis): RevenueClosing do projeto
 *   (ou do cliente, sem projeto) em CLOSED/INVOICED. Conclusao = closedAt — a
 *   action de CLOSE grava closedAt, o REOPEN o limpa e o INVOICED o preserva,
 *   entao e a data da liberacao vigente; fallback updatedAt para fechamentos
 *   legados sem closedAt. Fechamento CANCELLED sozinho = NAO_APLICAVEL.
 * - Etapas de pagamento (por ConsultantPayment nao cancelado): status atingido
 *   pela ordem da maquina de estados + timestamp proprio:
 *   PEOPLE_PAYMENT_RELEASE = peopleReleasedAt; INVOICE_REQUEST =
 *   invoiceRequestSentAt; INVOICE_RECEIPT = invoiceReceivedAt; PAYMENT = PAID +
 *   confirmedPaidAt. Cada um cai no proximo timestamp da cadeia e por ultimo em
 *   updatedAt quando o campo proprio e nulo (registros anteriores a coluna).
 *   Etapas de NF e o pagamento do dia 16 so se aplicam a PJ / CLT_FLEX.
 */
import {
  addCalendarDays,
  businessDaysBetween,
  competenceKey,
  computeStageDeadline,
  endOfDayInstant,
  isBusinessDay,
  isoDate,
  daysInMonth,
  isoDateInSaoPaulo,
  type BusinessCalendar,
  type Competence,
  type IsoDate,
} from "./business-days";
import {
  SLA_AREAS,
  SLA_STAGE_ACTION_HREF,
  stagesOfProcess,
  type SlaAreaKey,
  type SlaConfig,
  type SlaProcessKey,
  type SlaStageConfig,
  type SlaStageKeyName,
} from "./types";

export type SlaItemStatus =
  | "ON_TIME_DONE"
  | "LATE_DONE"
  | "PENDING_OK"
  | "AT_RISK"
  | "OVERDUE"
  | "NOT_APPLICABLE";

export const SLA_STATUS_LABEL: Record<SlaItemStatus, string> = {
  ON_TIME_DONE: "Concluído no prazo",
  LATE_DONE: "Concluído com atraso",
  PENDING_OK: "No prazo",
  AT_RISK: "Em risco",
  OVERDUE: "Atrasado",
  NOT_APPLICABLE: "Não se aplica",
};

/** Um item acompanhado numa etapa (projeto, consultor, pagamento...). */
export interface SlaItemFact {
  id: string;
  /** Rotulo principal (consultor ou projeto). */
  label: string;
  /** Contexto (projeto/cliente/contrato). */
  sublabel?: string;
  /** Quem deve agir (gestor, consultor, area). */
  responsible?: string;
  /** Pendencia legivel (ex.: "3 dias úteis sem lançamento enviado"). */
  detail?: string;
  href: string;
  /** Projetos envolvidos (escopo do PROJECT_MANAGER). */
  projectIds?: string[];
  applicable: boolean;
  done: boolean;
  /** Instante ISO da conclusao (null quando pendente). */
  doneAt: string | null;
}

export interface SlaItemEvaluation extends SlaItemFact {
  status: SlaItemStatus;
  /** Dias uteis de atraso na conclusao (LATE_DONE) ou ate hoje (OVERDUE). */
  businessDaysLate: number;
}

export interface SlaStatusCounts {
  ON_TIME_DONE: number;
  LATE_DONE: number;
  PENDING_OK: number;
  AT_RISK: number;
  OVERDUE: number;
  NOT_APPLICABLE: number;
}

export interface SlaStageEvaluation {
  stage: SlaStageConfig;
  deadline: IsoDate;
  /** Instante ISO (fim do dia em Sao Paulo). */
  deadlineAt: string;
  /** Status agregado da etapa (pior caso entre itens pendentes). */
  status: SlaItemStatus;
  /** "faltam N dias uteis" (>= 0) — null quando ja venceu. */
  businessDaysRemaining: number | null;
  /** "atrasado N dias uteis" — null quando ainda nao venceu. */
  businessDaysOverdue: number | null;
  counts: SlaStatusCounts;
  /** Itens aplicaveis. */
  total: number;
  done: number;
  /** 0..100 (null sem itens). */
  percentDone: number | null;
  /** % concluido no prazo entre itens com desfecho (null sem desfecho). */
  onTimePct: number | null;
  items: SlaItemEvaluation[];
  /**
   * true quando os itens foram ocultados para o visualizador (etapas de
   * pagamento sem permissao PAGAMENTOS): so os agregados sao exibidos.
   */
  itemsHidden?: boolean;
}

export interface SlaAreaSummary {
  area: SlaAreaKey;
  pendingOk: number;
  atRisk: number;
  overdue: number;
  onTime: number;
  late: number;
  onTimePct: number | null;
}

export interface SlaProcessEvaluation {
  process: SlaProcessKey;
  competence: Competence;
  today: IsoDate;
  stages: SlaStageEvaluation[];
  areas: SlaAreaSummary[];
}

function emptyCounts(): SlaStatusCounts {
  return {
    ON_TIME_DONE: 0,
    LATE_DONE: 0,
    PENDING_OK: 0,
    AT_RISK: 0,
    OVERDUE: 0,
    NOT_APPLICABLE: 0,
  };
}

/**
 * Status de uma pendencia (ou etapa) ainda nao concluida frente ao prazo.
 * Faltando ate `warningBusinessDays` dias uteis (inclusive "vence hoje") = em
 * risco; depois do prazo = atrasado.
 */
export function pendingStatus(
  deadline: IsoDate,
  today: IsoDate,
  warningBusinessDays: number,
  calendar: BusinessCalendar,
): { status: "PENDING_OK" | "AT_RISK" | "OVERDUE"; remaining: number | null; overdue: number | null } {
  if (today > deadline) {
    // Max 1: venceu na sexta e hoje e sabado ainda conta como atrasado.
    const overdue = Math.max(1, businessDaysBetween(deadline, today, calendar));
    return { status: "OVERDUE", remaining: null, overdue };
  }
  const remaining = businessDaysBetween(today, deadline, calendar);
  return {
    status: remaining <= Math.max(0, warningBusinessDays) ? "AT_RISK" : "PENDING_OK",
    remaining,
    overdue: null,
  };
}

export function classifyItem(
  fact: SlaItemFact,
  deadline: IsoDate,
  today: IsoDate,
  warningBusinessDays: number,
  calendar: BusinessCalendar,
): SlaItemEvaluation {
  if (!fact.applicable) {
    return { ...fact, status: "NOT_APPLICABLE", businessDaysLate: 0 };
  }
  if (fact.done) {
    if (!fact.doneAt) return { ...fact, status: "ON_TIME_DONE", businessDaysLate: 0 };
    const doneAt = new Date(fact.doneAt);
    if (doneAt.getTime() <= endOfDayInstant(deadline).getTime()) {
      return { ...fact, status: "ON_TIME_DONE", businessDaysLate: 0 };
    }
    const doneDay = isoDateInSaoPaulo(doneAt);
    return {
      ...fact,
      status: "LATE_DONE",
      businessDaysLate: Math.max(1, businessDaysBetween(deadline, doneDay, calendar)),
    };
  }
  const p = pendingStatus(deadline, today, warningBusinessDays, calendar);
  return { ...fact, status: p.status, businessDaysLate: p.overdue ?? 0 };
}

export function onTimeRate(counts: SlaStatusCounts): number | null {
  const decided = counts.ON_TIME_DONE + counts.LATE_DONE + counts.OVERDUE;
  if (decided === 0) return null;
  return Math.round((counts.ON_TIME_DONE / decided) * 100);
}

const ITEM_ORDER: Record<SlaItemStatus, number> = {
  OVERDUE: 0,
  AT_RISK: 1,
  PENDING_OK: 2,
  LATE_DONE: 3,
  ON_TIME_DONE: 4,
  NOT_APPLICABLE: 5,
};

export function evaluateStage(input: {
  stage: SlaStageConfig;
  competence: Competence;
  settings: SlaConfig["settings"];
  calendar: BusinessCalendar;
  today: IsoDate;
  facts: readonly SlaItemFact[];
}): SlaStageEvaluation {
  const { stage, calendar, today } = input;
  const deadline = computeStageDeadline(stage, input.competence, input.settings, calendar);
  const items = input.facts
    .map((f) => classifyItem(f, deadline, today, stage.warningBusinessDays, calendar))
    .sort(
      (a, b) =>
        ITEM_ORDER[a.status] - ITEM_ORDER[b.status] ||
        b.businessDaysLate - a.businessDaysLate ||
        a.label.localeCompare(b.label, "pt-BR"),
    );
  const timing = pendingStatus(deadline, today, stage.warningBusinessDays, calendar);
  return aggregateStage(stage, deadline, timing, items);
}

/** Prazo/contagem regressiva de uma etapa ja avaliada (sem recalcular calendario). */
function timingOf(e: SlaStageEvaluation): ReturnType<typeof pendingStatus> {
  if (e.businessDaysOverdue !== null) {
    return { status: "OVERDUE", remaining: null, overdue: e.businessDaysOverdue };
  }
  const remaining = e.businessDaysRemaining ?? 0;
  return {
    status: remaining <= Math.max(0, e.stage.warningBusinessDays) ? "AT_RISK" : "PENDING_OK",
    remaining,
    overdue: null,
  };
}

function aggregateStage(
  stage: SlaStageConfig,
  deadline: IsoDate,
  timing: ReturnType<typeof pendingStatus>,
  items: SlaItemEvaluation[],
): SlaStageEvaluation {
  const counts = emptyCounts();
  for (const item of items) counts[item.status] += 1;
  const total = items.length - counts.NOT_APPLICABLE;
  const done = counts.ON_TIME_DONE + counts.LATE_DONE;
  const pending = total - done;

  let status: SlaItemStatus;
  if (total === 0) status = "NOT_APPLICABLE";
  else if (pending === 0) status = counts.LATE_DONE > 0 ? "LATE_DONE" : "ON_TIME_DONE";
  else status = timing.status;

  return {
    stage,
    deadline,
    deadlineAt: endOfDayInstant(deadline).toISOString(),
    status,
    businessDaysRemaining: timing.remaining,
    businessDaysOverdue: timing.overdue,
    counts,
    total,
    done,
    percentDone: total === 0 ? null : Math.round((done / total) * 100),
    onTimePct: onTimeRate(counts),
    items,
  };
}

/** Etapas cujos itens expoem pagamento do consultor (nome, contrato, NF). */
export const SLA_PAYMENT_STAGES: ReadonlySet<SlaStageKeyName> = new Set([
  "PEOPLE_PAYMENT_RELEASE",
  "INVOICE_REQUEST",
  "INVOICE_RECEIPT",
  "PAYMENT",
]);

/**
 * Quem esta olhando a tela. `canSeePayments` = view em PAGAMENTOS (matriz);
 * `managedProjectIds` != null restringe as etapas operacionais aos projetos que
 * o PROJECT_MANAGER gerencia (sem papel amplo).
 */
export interface SlaViewerScope {
  canSeePayments: boolean;
  managedProjectIds: ReadonlySet<string> | null;
}

export const SLA_BROAD_SCOPE: SlaViewerScope = {
  canSeePayments: true,
  managedProjectIds: null,
};

/** Item pertence ao escopo do gestor de projeto? */
export function itemInManagerScope(
  item: Pick<SlaItemFact, "projectIds">,
  managed: ReadonlySet<string>,
): boolean {
  return (item.projectIds ?? []).some((id) => managed.has(id));
}

/**
 * Aplica o escopo do visualizador (PURO, apos a avaliacao):
 * - etapas de pagamento sem permissao: itens removidos, agregados mantidos;
 * - etapas operacionais com escopo de gestor: itens filtrados aos projetos
 *   gerenciados e agregados/status recalculados sobre o subconjunto.
 */
export function scopeProcessEvaluation(
  evaluation: SlaProcessEvaluation,
  scope: SlaViewerScope,
): SlaProcessEvaluation {
  const stages = evaluation.stages.map((s) => {
    if (SLA_PAYMENT_STAGES.has(s.stage.stageKey)) {
      return scope.canSeePayments ? s : { ...s, items: [], itemsHidden: true };
    }
    if (!scope.managedProjectIds) return s;
    const managed = scope.managedProjectIds;
    const items = s.items.filter((i) => itemInManagerScope(i, managed));
    return aggregateStage(s.stage, s.deadline, timingOf(s), items);
  });
  return { ...evaluation, stages, areas: summarizeAreas(stages) };
}

export function summarizeAreas(stages: readonly SlaStageEvaluation[]): SlaAreaSummary[] {
  return SLA_AREAS.map((area) => {
    const counts = emptyCounts();
    for (const s of stages) {
      if (s.stage.area !== area) continue;
      for (const key of Object.keys(counts) as SlaItemStatus[]) counts[key] += s.counts[key];
    }
    return {
      area,
      pendingOk: counts.PENDING_OK,
      atRisk: counts.AT_RISK,
      overdue: counts.OVERDUE,
      onTime: counts.ON_TIME_DONE,
      late: counts.LATE_DONE,
      onTimePct: onTimeRate(counts),
    };
  });
}

export type SlaFactsByStage = Partial<Record<SlaStageKeyName, SlaItemFact[]>>;

export function evaluateProcess(input: {
  process: SlaProcessKey;
  competence: Competence;
  config: SlaConfig;
  calendar: BusinessCalendar;
  today: IsoDate;
  facts: SlaFactsByStage;
}): SlaProcessEvaluation {
  const stages = stagesOfProcess(input.config.stages, input.process).map((stage) =>
    evaluateStage({
      stage,
      competence: input.competence,
      settings: input.config.settings,
      calendar: input.calendar,
      today: input.today,
      facts: input.facts[stage.stageKey] ?? [],
    }),
  );
  return {
    process: input.process,
    competence: input.competence,
    today: input.today,
    stages,
    areas: summarizeAreas(stages),
  };
}

// ---------------------------------------------------------------------------
// Dados brutos -> fatos por etapa
// ---------------------------------------------------------------------------

export type RawEntryStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "CLOSED";
export type RawPaymentStatus =
  | "OPEN"
  | "PEOPLE_RELEASED"
  | "WAITING_FOR_INVOICE"
  | "INVOICE_RECEIVED"
  | "INVOICE_VALIDATED"
  | "APPROVED_FOR_PAYMENT"
  | "SENT_TO_BANK"
  | "PROCESSED"
  | "PAID"
  | "CANCELLED";

export interface SlaRawProject {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  managerName: string | null;
  dailyEntryRequired: boolean;
}

export interface SlaRawAllocation {
  consultantId: string;
  projectId: string;
  /** ISO date-only. */
  startDate: IsoDate;
  endDate: IsoDate | null;
}

export interface SlaRawEntry {
  id: string;
  consultantId: string;
  projectId: string;
  date: IsoDate;
  status: RawEntryStatus;
  billable: boolean;
  submittedAt: string | null;
  updatedAt: string;
  /** Instante da aprovacao (Approval APPROVED mais recente), quando houver. */
  approvedAt: string | null;
}

export interface SlaRawOperationClosing {
  projectId: string;
  status: "OPEN" | "CLOSED";
  closedAt: string | null;
  updatedAt: string;
}

export interface SlaRawRevenueClosing {
  clientId: string;
  projectId: string | null;
  status: "OPEN" | "IN_REVIEW" | "READY_TO_CLOSE" | "CLOSED" | "INVOICED" | "CANCELLED";
  closedAt: string | null;
  updatedAt: string;
}

export interface SlaRawPayment {
  id: string;
  consultantId: string;
  contractType: "CLT" | "PJ" | "CLT_FLEX";
  status: RawPaymentStatus;
  peopleReleasedAt: string | null;
  invoiceRequestSentAt: string | null;
  invoiceReceivedAt: string | null;
  invoiceValidatedAt: string | null;
  approvedAt: string | null;
  confirmedPaidAt: string | null;
  updatedAt: string;
}

export interface SlaRawData {
  competence: Competence;
  consultants: Record<string, string>;
  projects: Record<string, SlaRawProject>;
  allocations: SlaRawAllocation[];
  entries: SlaRawEntry[];
  operationClosings: SlaRawOperationClosing[];
  revenueClosings: SlaRawRevenueClosing[];
  payments: SlaRawPayment[];
}

const PAYMENT_RANK: Record<RawPaymentStatus, number> = {
  OPEN: 0,
  PEOPLE_RELEASED: 1,
  WAITING_FOR_INVOICE: 2,
  INVOICE_RECEIVED: 3,
  INVOICE_VALIDATED: 4,
  APPROVED_FOR_PAYMENT: 5,
  SENT_TO_BANK: 6,
  PROCESSED: 7,
  PAID: 8,
  CANCELLED: -1,
};

const SUBMITTED_STATUSES: ReadonlySet<RawEntryStatus> = new Set([
  "SUBMITTED",
  "APPROVED",
  "CLOSED",
]);

const CONTRACT_LABEL: Record<SlaRawPayment["contractType"], string> = {
  CLT: "CLT",
  PJ: "PJ",
  CLT_FLEX: "CLT Flex",
};

function maxIso(values: ReadonlyArray<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const v of values) if (v && (!best || v > best)) best = v;
  return best;
}

function minIso(values: ReadonlyArray<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const v of values) if (v && (!best || v < best)) best = v;
  return best;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function projectLine(p: SlaRawProject | undefined): string {
  return p ? `${p.name} · ${p.clientName}` : "Projeto";
}

/** Fatos de TIMESHEET_SUBMISSION (um item por consultor). */
export function buildTimesheetFacts(raw: SlaRawData, calendar: BusinessCalendar): SlaItemFact[] {
  const { year, month } = raw.competence;
  const monthStart = isoDate(year, month, 1);
  const monthEnd = isoDate(year, month, daysInMonth(year, month));
  const required = new Map<string, Set<IsoDate>>();
  const projectsByConsultant = new Map<string, Set<string>>();
  for (const a of raw.allocations) {
    const project = raw.projects[a.projectId];
    if (!project?.dailyEntryRequired) continue;
    const from = a.startDate > monthStart ? a.startDate : monthStart;
    const to = a.endDate && a.endDate < monthEnd ? a.endDate : monthEnd;
    if (from > to) continue;
    const days = required.get(a.consultantId) ?? new Set<IsoDate>();
    for (let day = from; day <= to; day = addCalendarDays(day, 1)) {
      if (isBusinessDay(day, calendar)) days.add(day);
    }
    required.set(a.consultantId, days);
    const projects = projectsByConsultant.get(a.consultantId) ?? new Set<string>();
    projects.add(a.projectId);
    projectsByConsultant.set(a.consultantId, projects);
  }

  // Primeiro envio por (consultor, dia).
  const firstSubmitByDay = new Map<string, string>();
  for (const e of raw.entries) {
    if (!SUBMITTED_STATUSES.has(e.status)) continue;
    const key = `${e.consultantId}|${e.date}`;
    const at = e.submittedAt ?? e.updatedAt;
    const prev = firstSubmitByDay.get(key);
    if (!prev || at < prev) firstSubmitByDay.set(key, at);
  }

  const facts: SlaItemFact[] = [];
  for (const [consultantId, days] of required) {
    if (days.size === 0) continue;
    let missing = 0;
    const coveredAt: string[] = [];
    for (const day of days) {
      const at = firstSubmitByDay.get(`${consultantId}|${day}`);
      if (at) coveredAt.push(at);
      else missing += 1;
    }
    const projects = [...(projectsByConsultant.get(consultantId) ?? [])]
      .map((id) => raw.projects[id]?.name)
      .filter(Boolean)
      .join(", ");
    const done = missing === 0;
    facts.push({
      id: `ts:${consultantId}`,
      label: raw.consultants[consultantId] ?? "Consultor",
      sublabel: projects || undefined,
      projectIds: [...(projectsByConsultant.get(consultantId) ?? [])],
      responsible: raw.consultants[consultantId] ?? "Consultor",
      detail: done
        ? undefined
        : `${plural(missing, "dia útil", "dias úteis")} sem lançamento enviado`,
      href: SLA_STAGE_ACTION_HREF.TIMESHEET_SUBMISSION,
      applicable: true,
      done,
      doneAt: done ? maxIso(coveredAt) : null,
    });
  }
  return facts;
}

/** Fatos de MANAGER_APPROVAL (um item por consultor x projeto com horas). */
export function buildApprovalFacts(raw: SlaRawData): SlaItemFact[] {
  const groups = new Map<string, SlaRawEntry[]>();
  for (const e of raw.entries) {
    if (e.status === "REJECTED") continue;
    const key = `${e.consultantId}|${e.projectId}`;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }
  const facts: SlaItemFact[] = [];
  for (const [key, entries] of groups) {
    const [consultantId, projectId] = key.split("|");
    const project = raw.projects[projectId];
    const waiting = entries.filter((e) => e.status === "SUBMITTED").length;
    const drafts = entries.filter((e) => e.status === "DRAFT").length;
    const done = waiting === 0 && drafts === 0;
    const parts: string[] = [];
    if (waiting) parts.push(`${plural(waiting, "lançamento", "lançamentos")} aguardando aprovação`);
    if (drafts) parts.push(`${plural(drafts, "rascunho", "rascunhos")} não enviado${drafts === 1 ? "" : "s"}`);
    facts.push({
      id: `ap:${key}`,
      label: raw.consultants[consultantId] ?? "Consultor",
      sublabel: projectLine(project),
      projectIds: [projectId],
      responsible: project?.managerName ?? "Gestor do projeto",
      detail: parts.join(" · ") || undefined,
      href: SLA_STAGE_ACTION_HREF.MANAGER_APPROVAL,
      applicable: true,
      done,
      doneAt: done ? maxIso(entries.map((e) => e.approvedAt ?? e.updatedAt)) : null,
    });
  }
  return facts;
}

/** Fatos de OPERATION_CLOSING (um item por projeto com horas no mes). */
export function buildOperationClosingFacts(raw: SlaRawData): SlaItemFact[] {
  const projectIds = new Set<string>();
  for (const e of raw.entries) if (e.status !== "REJECTED") projectIds.add(e.projectId);
  for (const c of raw.operationClosings) projectIds.add(c.projectId);
  const byProject = new Map(raw.operationClosings.map((c) => [c.projectId, c]));
  return [...projectIds].map((projectId) => {
    const project = raw.projects[projectId];
    const closing = byProject.get(projectId);
    const done = closing?.status === "CLOSED";
    return {
      id: `oc:${projectId}`,
      label: project?.name ?? "Projeto",
      sublabel: project?.clientName,
      projectIds: [projectId],
      responsible: project?.managerName ?? "Gestor do projeto",
      detail: done ? undefined : "Fechamento operacional em aberto",
      href: SLA_STAGE_ACTION_HREF.OPERATION_CLOSING,
      applicable: true,
      done,
      doneAt: done ? (closing!.closedAt ?? closing!.updatedAt) : null,
    };
  });
}

/** Fatos de BILLING_RELEASE (um item por projeto com horas faturaveis). */
export function buildBillingReleaseFacts(raw: SlaRawData): SlaItemFact[] {
  const projectIds = new Set<string>();
  for (const e of raw.entries) {
    if (e.status !== "REJECTED" && e.billable) projectIds.add(e.projectId);
  }
  for (const c of raw.revenueClosings) if (c.projectId) projectIds.add(c.projectId);

  return [...projectIds].map((projectId) => {
    const project = raw.projects[projectId];
    const candidates = raw.revenueClosings.filter(
      (c) =>
        c.projectId === projectId ||
        (c.projectId === null && project && c.clientId === project.clientId),
    );
    const live = candidates.filter((c) => c.status !== "CANCELLED");
    const released = live.filter((c) => c.status === "CLOSED" || c.status === "INVOICED");
    const applicable = !(candidates.length > 0 && live.length === 0);
    const done = released.length > 0;
    return {
      id: `br:${projectId}`,
      label: project?.name ?? "Projeto",
      sublabel: project?.clientName,
      projectIds: [projectId],
      responsible: project?.managerName ?? "Gestor de área",
      detail: done
        ? undefined
        : live.length === 0
          ? "Fechamento de receita não iniciado"
          : "Faturamento ainda não liberado",
      href: SLA_STAGE_ACTION_HREF.BILLING_RELEASE,
      applicable,
      done,
      doneAt: done ? minIso(released.map((c) => c.closedAt ?? c.updatedAt)) : null,
    };
  });
}

type PaymentStage = "PEOPLE_PAYMENT_RELEASE" | "INVOICE_REQUEST" | "INVOICE_RECEIPT" | "PAYMENT";

const PAYMENT_STAGE_RULE: Record<
  PaymentStage,
  {
    target: RawPaymentStatus;
    responsible: (consultant: string) => string;
    pending: string;
    doneAt: (p: SlaRawPayment) => string | null;
  }
> = {
  PEOPLE_PAYMENT_RELEASE: {
    target: "PEOPLE_RELEASED",
    responsible: () => "DP",
    pending: "Aguardando liberação do DP",
    doneAt: (p) => p.peopleReleasedAt ?? p.invoiceRequestSentAt ?? p.approvedAt ?? p.updatedAt,
  },
  INVOICE_REQUEST: {
    target: "WAITING_FOR_INVOICE",
    responsible: () => "Financeiro",
    pending: "Solicitação de NF não enviada",
    doneAt: (p) => p.invoiceRequestSentAt ?? p.invoiceReceivedAt ?? p.updatedAt,
  },
  INVOICE_RECEIPT: {
    target: "INVOICE_RECEIVED",
    responsible: (consultant) => consultant,
    pending: "NF ainda não recebida",
    doneAt: (p) => p.invoiceReceivedAt ?? p.invoiceValidatedAt ?? p.updatedAt,
  },
  PAYMENT: {
    target: "PAID",
    responsible: () => "Financeiro",
    pending: "Pagamento não confirmado",
    doneAt: (p) => p.confirmedPaidAt ?? p.updatedAt,
  },
};

export function buildPaymentFacts(raw: SlaRawData, stage: PaymentStage): SlaItemFact[] {
  const rule = PAYMENT_STAGE_RULE[stage];
  // CLT segue a folha (fora do fluxo DP -> NF -> pagamento do dia 16): nao
  // entra em nenhuma etapa de pagamento, coerente com a tela de Pagamentos.
  return raw.payments
    .filter((p) => p.status !== "CANCELLED" && p.contractType !== "CLT")
    .map((p) => {
      const consultant = raw.consultants[p.consultantId] ?? "Consultor";
      const applicable = true;
      const done = PAYMENT_RANK[p.status] >= PAYMENT_RANK[rule.target];
      return {
        id: `${stage}:${p.id}`,
        label: consultant,
        sublabel: CONTRACT_LABEL[p.contractType],
        responsible: rule.responsible(consultant),
        detail: done ? undefined : rule.pending,
        href: SLA_STAGE_ACTION_HREF[stage],
        applicable,
        done,
        doneAt: done ? rule.doneAt(p) : null,
      };
    });
}

/** Todos os fatos da competencia, por etapa (compartilhados entre processos). */
export function buildSlaFacts(raw: SlaRawData, calendar: BusinessCalendar): SlaFactsByStage {
  return {
    TIMESHEET_SUBMISSION: buildTimesheetFacts(raw, calendar),
    MANAGER_APPROVAL: buildApprovalFacts(raw),
    OPERATION_CLOSING: buildOperationClosingFacts(raw),
    BILLING_RELEASE: buildBillingReleaseFacts(raw),
    PEOPLE_PAYMENT_RELEASE: buildPaymentFacts(raw, "PEOPLE_PAYMENT_RELEASE"),
    INVOICE_REQUEST: buildPaymentFacts(raw, "INVOICE_REQUEST"),
    INVOICE_RECEIPT: buildPaymentFacts(raw, "INVOICE_RECEIPT"),
    PAYMENT: buildPaymentFacts(raw, "PAYMENT"),
  };
}

// ---------------------------------------------------------------------------
// Historico
// ---------------------------------------------------------------------------

export interface SlaHistoryRow {
  stageKey: SlaStageKeyName;
  label: string;
  area: SlaAreaKey;
  /** Um valor por competencia (mesma ordem de `competences`). */
  onTimePct: Array<number | null>;
}

export interface SlaHistory {
  competences: string[];
  rows: SlaHistoryRow[];
}

/** Monta a tabela "% no prazo por etapa" a partir de avaliacoes por competencia. */
export function buildHistory(evaluations: readonly SlaProcessEvaluation[]): SlaHistory {
  const sorted = [...evaluations].sort((a, b) =>
    competenceKey(a.competence).localeCompare(competenceKey(b.competence)),
  );
  const competences = sorted.map((e) => competenceKey(e.competence));
  const rowsByKey = new Map<SlaStageKeyName, SlaHistoryRow>();
  sorted.forEach((evaluation, index) => {
    for (const s of evaluation.stages) {
      let row = rowsByKey.get(s.stage.stageKey);
      if (!row) {
        row = {
          stageKey: s.stage.stageKey,
          label: s.stage.label,
          area: s.stage.area,
          onTimePct: competences.map(() => null),
        };
        rowsByKey.set(s.stage.stageKey, row);
      }
      row.onTimePct[index] = s.onTimePct;
    }
  });
  return { competences, rows: [...rowsByKey.values()] };
}

// ---------------------------------------------------------------------------
// Digest compacto (historico cacheado)
// ---------------------------------------------------------------------------

/** Item reduzido ao minimo para o historico: status + projetos (escopo). */
export interface SlaDigestItem {
  s: SlaItemStatus;
  p?: string[];
}

export interface SlaStageDigest {
  stageKey: SlaStageKeyName;
  label: string;
  area: SlaAreaKey;
  items: SlaDigestItem[];
}

/** Resumo serializavel de uma competencia (sem nomes) — o que vai ao cache. */
export interface SlaCompetenceDigest {
  competence: string;
  processes: Record<SlaProcessKey, SlaStageDigest[]>;
}

export function digestEvaluations(
  competence: Competence,
  evaluations: Record<SlaProcessKey, SlaProcessEvaluation>,
): SlaCompetenceDigest {
  const processes = {} as Record<SlaProcessKey, SlaStageDigest[]>;
  for (const [process, evaluation] of Object.entries(evaluations) as Array<
    [SlaProcessKey, SlaProcessEvaluation]
  >) {
    processes[process] = evaluation.stages.map((s) => ({
      stageKey: s.stage.stageKey,
      label: s.stage.label,
      area: s.stage.area,
      items: s.items.map((i) => (i.projectIds?.length ? { s: i.status, p: i.projectIds } : { s: i.status })),
    }));
  }
  return { competence: competenceKey(competence), processes };
}

/**
 * Historico "% no prazo" a partir de digests, aplicando o escopo do gestor nas
 * etapas operacionais (as de pagamento entram so como agregado, sem nomes).
 */
export function buildHistoryFromDigests(
  digests: readonly SlaCompetenceDigest[],
  process: SlaProcessKey,
  scope: SlaViewerScope,
): SlaHistory {
  const sorted = [...digests].sort((a, b) => a.competence.localeCompare(b.competence));
  const competences = sorted.map((d) => d.competence);
  const rowsByKey = new Map<SlaStageKeyName, SlaHistoryRow>();
  sorted.forEach((digest, index) => {
    for (const stage of digest.processes[process] ?? []) {
      let row = rowsByKey.get(stage.stageKey);
      if (!row) {
        row = {
          stageKey: stage.stageKey,
          label: stage.label,
          area: stage.area,
          onTimePct: competences.map(() => null),
        };
        rowsByKey.set(stage.stageKey, row);
      }
      const managed = scope.managedProjectIds;
      const items =
        managed && !SLA_PAYMENT_STAGES.has(stage.stageKey)
          ? stage.items.filter((i) => itemInManagerScope({ projectIds: i.p }, managed))
          : stage.items;
      const counts = emptyCounts();
      for (const i of items) counts[i.s] += 1;
      row.onTimePct[index] = onTimeRate(counts);
    }
  });
  return { competences, rows: [...rowsByKey.values()] };
}
