import { Prisma, prisma } from "@jumpflow/database";
import { buildConsultantPaymentAmounts } from "@/lib/payments/amounts";
import { timeEntryEffectiveHours } from "@/lib/timesheet/effective-hours";
import {
  projectRateKey,
  resolveProjectRate,
  type ProjectRateWindow,
} from "@/lib/consultants/project-rate";
import type { ConsultantPaymentStatus } from "@/lib/payments/state-machine";
import type {
  PaymentForecastView,
  ConsultantPaymentLineView,
  ConsultantPaymentView,
} from "@/lib/payments/types";
import { appConfig } from "@/config/app";
import { buildInvoiceComparison } from "@/lib/payments/invoice-validation";
import { buildAuditEventData } from "@/lib/db/audit";
import { getEmailTransport } from "@/lib/automation/email-transport";
import { buildConsultantInvoiceRequestEmail } from "@/lib/automation/email/templates";
import { resolveEventDelivery } from "@/lib/automation/notifications/event-delivery";

type ConsultantContractType = "CLT" | "PJ" | "CLT_FLEX";
import { sendPaymentForecastEmail } from "@/lib/payments/notify";
import type { PaymentExportConsultant } from "@/lib/payments/payment-export";

/**
 * Fluxo de Pagamentos cobre SOMENTE contratação por serviço (PJ e CLT_FLEX).
 * CLT puro é folha (jump-hr-compensation-agent) e sai deste fluxo — não é
 * listado na tela nem exportado (P18). Fonte única para o `where` da listagem e
 * do export, para os dois não divergirem.
 */
const PAYMENT_CONTRACT_TYPES: ConsultantContractType[] = ["PJ", "CLT_FLEX"];

function monthBounds(month: number, year: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

function toIsoDate(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

function toIsoDateTime(date: Date): string {
  return date.toISOString();
}

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Prefixo estavel das linhas de remuneracao pontual (usado para detectar
 *  pontuais ja refletidas num pagamento existente — ver M2). */
const AD_HOC_LINE_PREFIX = "Remuneracao pontual";

/** Consultor pulado na geracao (ja tem pagamento do mes) cujas pontuais com
 *  payAt no mes NAO estao refletidas no pagamento existente (M2). Visibilidade
 *  sem regeneracao automatica. */
export interface SkippedAdHocWarning {
  consultantId: string;
  /** Total das pontuais (nao canceladas) com payAt no mes. */
  adHocTotal: number;
  /** Total das pontuais ja refletidas no pagamento existente. */
  reflectedAdHoc: number;
}

export interface GenerateConsultantPaymentsResult {
  generated: number;
  skippedExisting: number;
  /** Pulados com pontuais nao refletidas — exige atencao do operador (M2). */
  skippedWithUnreflectedAdHoc: SkippedAdHocWarning[];
}

function activeOn<T extends { startsAt: Date; endsAt: Date | null }>(
  rows: T[],
  date: Date,
): T | null {
  return (
    rows
      .filter((row) => row.startsAt <= date && (!row.endsAt || date < row.endsAt))
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0] ?? null
  );
}

function paymentLineView(row: {
  id: string;
  description: string;
  hours: Prisma.Decimal;
  unitRate: Prisma.Decimal;
  amount: Prisma.Decimal;
  project: { name: string } | null;
}): ConsultantPaymentLineView {
  return {
    id: row.id,
    projectName: row.project?.name ?? "Beneficios",
    description: row.description,
    hours: toNumber(row.hours),
    unitRate: toNumber(row.unitRate),
    amount: toNumber(row.amount),
  };
}

/**
 * Prisma `include` shared by the finance list and the consultant's own list so
 * both build the IDENTICAL {@link ConsultantPaymentView} (incl. NF fields).
 */
const paymentViewInclude = {
  consultant: {
    select: {
      name: true,
      email: true,
      companyInfo: { select: { cnpj: true } },
    },
  },
  lines: {
    include: { project: { select: { name: true } } },
    orderBy: [{ project: { name: "asc" } }, { createdAt: "asc" }],
  },
  _count: { select: { invoiceAttachments: true } },
  // Real NF attachment ids (+ fileName) so the UI can link the signed-URL
  // download (melhoria #3). Newest first. The endpoint re-checks ownership.
  invoiceAttachments: {
    select: { id: true, fileName: true },
    orderBy: { createdAt: "desc" as const },
  },
} satisfies Prisma.ConsultantPaymentInclude;

type PaymentRowForView = Prisma.ConsultantPaymentGetPayload<{
  include: typeof paymentViewInclude;
}>;

/** Single mapper Row -> DTO, including the NF amount + divergence (M#3/M#4). */
function toPaymentView(row: PaymentRowForView): ConsultantPaymentView {
  const invoiceAmount = row.invoiceAmount == null ? null : toNumber(row.invoiceAmount);
  const pjAmount = toNumber(row.pjAmount);
  const totalAmount = toNumber(row.totalAmount);
  return {
    id: row.id,
    consultantName: row.consultant.name,
    consultantEmail: row.consultant.email,
    contractType: row.contractType,
    cnpj: row.consultant.companyInfo?.cnpj ?? null,
    month: row.month,
    year: row.year,
    status: row.status,
    cltNetAmount: toNumber(row.cltNetAmount),
    pjAmount,
    benefitAmount: toNumber(row.benefitAmount),
    totalAmount,
    expectedPaymentAt: toIsoDate(row.expectedPaymentAt),
    confirmedPaidAt: toIsoDate(row.confirmedPaidAt),
    invoiceReceivedAt: toIsoDate(row.invoiceReceivedAt),
    invoiceValidatedAt: toIsoDate(row.invoiceValidatedAt),
    invoiceAmount,
    invoiceAttachmentCount: row._count.invoiceAttachments,
    invoiceAttachments: row.invoiceAttachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
    })),
    invoiceDivergence: buildInvoiceComparison({
      contractType: row.contractType,
      pjAmount,
      totalAmount,
      invoiceAmount,
    }),
    lines: row.lines.map(paymentLineView),
  };
}

export async function listPaymentConsultants(): Promise<
  { id: string; name: string }[]
> {
  return prisma.consultant.findMany({
    where: { payments: { some: {} } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listConsultantPayments(input: {
  month: number;
  year: number;
  consultantId?: string;
  status?: ConsultantPaymentStatus;
  contractType?: ConsultantContractType;
}): Promise<ConsultantPaymentView[]> {
  const rows = await prisma.consultantPayment.findMany({
    where: {
      month: input.month,
      year: input.year,
      // CLT puro é folha e sai do fluxo (P18): sempre restringe a PJ/CLT_FLEX.
      // Um filtro explícito só pode estreitar dentro desse conjunto.
      contractType: input.contractType
        ? { equals: input.contractType, in: PAYMENT_CONTRACT_TYPES }
        : { in: PAYMENT_CONTRACT_TYPES },
      ...(input.consultantId ? { consultantId: input.consultantId } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    include: paymentViewInclude,
    orderBy: [{ consultant: { name: "asc" } }],
  });

  return rows.map(toPaymentView);
}

/**
 * Consultant self-service read (melhoria #3): the payments that belong to the
 * LOGGED-IN user only. The owner scope is applied IN THE QUERY (`consultant:
 * { userId }`) — never trusted from the client — so a consultant can never see
 * another consultant's payment/NF. Same PJ/CLT_FLEX restriction and DTO shape as
 * the finance list; the raw NF file is only reachable through the signed-URL
 * download endpoint, which re-checks ownership.
 */
export async function listOwnConsultantPayments(input: {
  userId: string;
  month?: number;
  year?: number;
}): Promise<ConsultantPaymentView[]> {
  const rows = await prisma.consultantPayment.findMany({
    where: {
      consultant: { userId: input.userId },
      contractType: { in: PAYMENT_CONTRACT_TYPES },
      ...(input.month ? { month: input.month } : {}),
      ...(input.year ? { year: input.year } : {}),
    },
    include: paymentViewInclude,
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  return rows.map(toPaymentView);
}

/**
 * Dados para o Excel de Pagamentos (P19). Mesmo `where` da tela (PJ/CLT_FLEX +
 * filtros), trazendo o CNPJ (empresa), o CPF (pessoa física, fallback) e as
 * contas bancárias (para o PIX). O achatamento em linhas fica no helper puro
 * `buildPaymentExportRows`. RBAC e auditoria são responsabilidade da rota.
 */
export async function listConsultantPaymentsForExport(input: {
  month: number;
  year: number;
  consultantId?: string;
  status?: ConsultantPaymentStatus;
  contractType?: ConsultantContractType;
}): Promise<PaymentExportConsultant[]> {
  const rows = await prisma.consultantPayment.findMany({
    where: {
      month: input.month,
      year: input.year,
      contractType: input.contractType
        ? { equals: input.contractType, in: PAYMENT_CONTRACT_TYPES }
        : { in: PAYMENT_CONTRACT_TYPES },
      ...(input.consultantId ? { consultantId: input.consultantId } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    include: {
      consultant: {
        select: {
          name: true,
          companyInfo: { select: { cnpj: true } },
          personalInfo: { select: { cpf: true } },
          bankAccounts: {
            where: { active: true },
            select: { kind: true, pixKey: true },
          },
        },
      },
      lines: {
        include: { project: { select: { name: true } } },
        orderBy: [{ project: { name: "asc" } }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ consultant: { name: "asc" } }],
  });

  return rows.map((row) => ({
    consultantName: row.consultant.name,
    cnpj: row.consultant.companyInfo?.cnpj ?? null,
    cpf: row.consultant.personalInfo?.cpf ?? null,
    bankAccounts: row.consultant.bankAccounts.map((account) => ({
      kind: account.kind,
      pixKey: account.pixKey,
    })),
    lines: row.lines.map((line) => ({
      projectName: line.project?.name ?? "Beneficios",
      amount: toNumber(line.amount),
    })),
  }));
}

export async function listPaymentForecasts(input: {
  month: number;
  year: number;
}): Promise<PaymentForecastView[]> {
  const rows = await prisma.consultantPaymentForecast.findMany({
    where: { closingMonth: input.month, closingYear: input.year },
    include: {
      consultant: { select: { name: true } },
      payments: { select: { id: true } },
    },
    orderBy: [{ expectedPaymentAt: "asc" }, { createdAt: "desc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    consultantName: row.consultant?.name ?? "Competencia inteira",
    closingMonth: row.closingMonth,
    closingYear: row.closingYear,
    responseDeadlineAt: toIsoDateTime(row.responseDeadlineAt),
    expectedPaymentAt: toIsoDateTime(row.expectedPaymentAt),
    linkedPayments: row.payments.length,
  }));
}

export async function createPaymentForecast(input: {
  month: number;
  year: number;
  consultantId?: string | null;
  responseDeadlineAt: Date;
  expectedPaymentAt: Date;
  actorUserId: string | null;
}): Promise<{ id: string; linkedPayments: number }> {
  return prisma.$transaction(async (tx) => {
    const forecast = await tx.consultantPaymentForecast.create({
      data: {
        consultantId: input.consultantId ?? null,
        closingMonth: input.month,
        closingYear: input.year,
        responseDeadlineAt: input.responseDeadlineAt,
        expectedPaymentAt: input.expectedPaymentAt,
        createdByUserId: input.actorUserId,
      },
    });
    const linked = await tx.consultantPayment.updateMany({
      where: {
        month: input.month,
        year: input.year,
        forecastId: null,
        ...(input.consultantId ? { consultantId: input.consultantId } : {}),
      },
      data: {
        forecastId: forecast.id,
        expectedPaymentAt: input.expectedPaymentAt,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "ConsultantPaymentForecast",
        entityId: forecast.id,
        action: "CONSULTANT_PAYMENT_FORECAST_CREATED",
        before: Prisma.JsonNull,
        after: {
          closingMonth: input.month,
          closingYear: input.year,
          consultantId: input.consultantId ?? null,
          linkedPayments: linked.count,
        },
      },
    });
    return { id: forecast.id, linkedPayments: linked.count };
  });
}

// ---------------------------------------------------------------------------
// Cálculo por-consultor reutilizável (A) — extraído do loop de
// generateConsultantPayments para ser compartilhado com a reconciliação
// disparada pelo Fechamento Operacional. Função PURA (sem I/O): recebe os dados
// já carregados (compensação/benefícios do consultor, lançamentos aprovados do
// mês, pontuais do mês e as vigências de valor/hora por projeto) e devolve as
// LINHAS congeladas + os montantes (cltNetAmount/pjAmount/benefitAmount/
// totalAmount) e o contractType. Retorna null quando o consultor NÃO tem
// compensação vigente na virada do mês (mesmo critério do skip anterior).
// ---------------------------------------------------------------------------

export interface ComputedConsultantPaymentLine {
  projectId: string | null;
  description: string;
  hours: number;
  unitRate: number;
  amount: number;
}

export interface ComputedConsultantPayment {
  contractType: ConsultantContractType;
  cltNetAmount: number;
  pjAmount: number;
  benefitAmount: number;
  totalAmount: number;
  lines: ComputedConsultantPaymentLine[];
}

interface ComputeConsultantCompensation {
  contractType: ConsultantContractType;
  hourlyRate: Prisma.Decimal | number | null;
  cltAmount: Prisma.Decimal | number | null;
  pjAmount: Prisma.Decimal | number | null;
  benefitCardAmount: Prisma.Decimal | number | null;
  discountRules: Prisma.JsonValue;
  startsAt: Date;
  endsAt: Date | null;
}

interface ComputeConsultantBenefit {
  type: string;
  amount: Prisma.Decimal | number | null;
  startsAt: Date;
  endsAt: Date | null;
}

export interface ComputeConsultantRecord {
  compensations: ComputeConsultantCompensation[];
  benefits: ComputeConsultantBenefit[];
}

interface ComputeConsultantEntry {
  projectId: string;
  date: Date;
  hours: Prisma.Decimal | number | null;
  multiplier: Prisma.Decimal | number | null;
  project: { name: string };
}

interface ComputeConsultantAdHoc {
  projectId: string;
  kind: string;
  amount: Prisma.Decimal | number | null;
  project: { name: string } | null;
}

/**
 * Computa as linhas + montantes de UM consultor para um mês. Regras (idênticas
 * às aplicadas hoje na geração mensal):
 *  - Sem compensação vigente => null (consultor pulado).
 *  - Pontuais (ad-hoc) viram linhas extras que SEMPRE somam ao total, mesmo sem
 *    horas (consultor só-pontual recebe apenas as pontuais).
 *  - A BASE (salário/pjAmount + benefícios + benefitCard) só compõe quando há
 *    horas aprovadas no mês; sem horas, a base é zerada.
 *  - Valor/hora por projeto (vigente na data do lançamento) tem precedência
 *    sobre o hourlyRate acordado.
 */
export function computeConsultantMonthlyPayment(input: {
  consultantId: string;
  consultantRecord: ComputeConsultantRecord;
  approvedEntries: ComputeConsultantEntry[];
  adHocs: ComputeConsultantAdHoc[];
  start: Date;
  projectRateWindows: Map<string, ProjectRateWindow[]>;
}): ComputedConsultantPayment | null {
  const {
    consultantId,
    consultantRecord,
    approvedEntries,
    adHocs,
    start,
    projectRateWindows,
  } = input;

  const compensation = activeOn(consultantRecord.compensations, start);
  if (!compensation) return null;

  // Linhas de remuneração pontual (D2): uma por ConsultantAdHocPayment do mês.
  // hours=0, unitRate=amount (valor cheio). Somam SEMPRE por cima.
  const adHocLines: ComputedConsultantPaymentLine[] = adHocs.map((payment) => ({
    projectId: payment.projectId,
    description: `${AD_HOC_LINE_PREFIX} (${payment.kind}) - ${payment.project?.name ?? "projeto"}`,
    hours: 0,
    unitRate: toNumber(payment.amount),
    amount: toNumber(payment.amount),
  }));
  const adHocTotal = adHocLines.reduce((sum, line) => sum + line.amount, 0);

  // C2 (folha): base só compõe quando há horas aprovadas no mês.
  const hasApprovedHours = approvedEntries.length > 0;
  const benefits = hasApprovedHours
    ? consultantRecord.benefits.filter(
        (benefit) =>
          benefit.startsAt <= start && (!benefit.endsAt || start < benefit.endsAt),
      )
    : [];

  const byProject = new Map<
    string,
    { projectName: string; hours: number; amount: number; unitRate: number }
  >();
  for (const entry of approvedEntries) {
    const hours = timeEntryEffectiveHours(
      toNumber(entry.hours),
      toNumber(entry.multiplier),
    );
    const overrideRate = resolveProjectRate(
      projectRateWindows.get(projectRateKey(consultantId, entry.projectId)) ?? [],
      entry.date,
    );
    const rate = overrideRate ?? toNumber(compensation.hourlyRate);
    const amount = hours * rate;
    const current = byProject.get(entry.projectId) ?? {
      projectName: entry.project.name,
      hours: 0,
      amount: 0,
      unitRate: rate,
    };
    current.hours += hours;
    current.amount += amount;
    byProject.set(entry.projectId, current);
  }

  const projectLines: ComputedConsultantPaymentLine[] = [
    ...byProject.entries(),
  ].map(([projectId, line]) => ({
    projectId,
    description: `Horas aprovadas - ${line.projectName}`,
    hours: line.hours,
    unitRate: line.unitRate,
    amount: line.amount,
  }));
  const benefitLines: ComputedConsultantPaymentLine[] = benefits.map((benefit) => ({
    projectId: null,
    description: `Beneficio ${benefit.type}`,
    hours: 0,
    unitRate: toNumber(benefit.amount),
    amount: toNumber(benefit.amount),
  }));
  const benefitCardAmount = hasApprovedHours
    ? toNumber(compensation.benefitCardAmount)
    : 0;
  if (benefitCardAmount > 0) {
    benefitLines.push({
      projectId: null,
      description: "Beneficio BENEFIT_CARD",
      hours: 0,
      unitRate: benefitCardAmount,
      amount: benefitCardAmount,
    });
  }

  const baseAmounts = hasApprovedHours
    ? buildConsultantPaymentAmounts(
        {
          contractType: compensation.contractType,
          hourlyRate: toNumber(compensation.hourlyRate),
          cltAmount: toNumber(compensation.cltAmount),
          pjAmount: toNumber(compensation.pjAmount),
          benefitCardAmount: toNumber(compensation.benefitCardAmount),
          discountRules: compensation.discountRules as never,
        },
        benefits.map((benefit) => ({ amount: toNumber(benefit.amount) })),
        projectLines,
      )
    : { cltNetAmount: 0, pjAmount: 0, benefitAmount: 0, totalAmount: 0 };

  return {
    contractType: compensation.contractType,
    cltNetAmount: baseAmounts.cltNetAmount,
    pjAmount: baseAmounts.pjAmount,
    benefitAmount: baseAmounts.benefitAmount,
    totalAmount: baseAmounts.totalAmount + adHocTotal,
    lines: [...projectLines, ...benefitLines, ...adHocLines],
  };
}

export async function generateConsultantPayments(input: {
  month: number;
  year: number;
  audit?: {
    actorUserId: string | null;
    entityId: string;
    action: string;
  };
}): Promise<GenerateConsultantPaymentsResult> {
  const { start, end } = monthBounds(input.month, input.year);
  const entries = await prisma.timeEntry.findMany({
    where: {
      status: "APPROVED",
      date: { gte: start, lt: end },
    },
    include: {
      project: { select: { name: true } },
      consultant: {
        include: {
          compensations: true,
          benefits: true,
        },
      },
    },
  });

  // Remuneracoes pontuais (Onda D / D2) cujo payAt cai no mes fechado. Regra de
  // inclusao: entram no pagamento do mes as pontuais com status != CANCELLED
  // (PLANNED + PAID). Cada uma vira uma LINHA extra do ConsultantPayment,
  // vinculada ao projeto (projectId sempre presente), e SOMA ao total. A
  // idempotencia segue o mesmo skip por consultor: se ja existe ConsultantPayment
  // do mes, nada e regerado (as pontuais tampouco duplicam).
  const adHocPayments = await prisma.consultantAdHocPayment.findMany({
    where: {
      status: { not: "CANCELLED" },
      payAt: { gte: start, lt: end },
    },
    include: { project: { select: { name: true } } },
  });

  const byConsultant = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = byConsultant.get(entry.consultantId) ?? [];
    list.push(entry);
    byConsultant.set(entry.consultantId, list);
  }

  // M2: valor/hora diferenciado por projeto. Pré-carrega as vigências dos
  // consultores com horas no mês e indexa por consultor+projeto. Quando ativa
  // para a data do lançamento, a taxa substitui o hourlyRate acordado no cálculo
  // de pagamento (mesma taxa também vale como custo/margem em project-tracking).
  const projectRateRows =
    byConsultant.size > 0
      ? await prisma.consultantProjectRate.findMany({
          where: { consultantId: { in: [...byConsultant.keys()] } },
        })
      : [];
  const projectRateWindows = new Map<string, ProjectRateWindow[]>();
  for (const rate of projectRateRows) {
    const key = projectRateKey(rate.consultantId, rate.projectId);
    const list = projectRateWindows.get(key) ?? [];
    list.push({
      startsAt: rate.startsAt,
      endsAt: rate.endsAt,
      hourlyRate: toNumber(rate.hourlyRate),
    });
    projectRateWindows.set(key, list);
  }

  const adHocByConsultant = new Map<string, typeof adHocPayments>();
  for (const payment of adHocPayments) {
    const list = adHocByConsultant.get(payment.consultantId) ?? [];
    list.push(payment);
    adHocByConsultant.set(payment.consultantId, list);
  }

  // Consultores que so tem pontuais no mes (sem horas aprovadas) tambem devem
  // ser pagos: buscamos a compensacao/beneficios deles a parte.
  const adHocOnlyIds = [...adHocByConsultant.keys()].filter(
    (id) => !byConsultant.has(id),
  );
  const adHocOnlyConsultants =
    adHocOnlyIds.length > 0
      ? await prisma.consultant.findMany({
          where: { id: { in: adHocOnlyIds } },
          include: { compensations: true, benefits: true },
        })
      : [];
  const consultantById = new Map(
    adHocOnlyConsultants.map((consultant) => [consultant.id, consultant]),
  );

  const allConsultantIds = new Set<string>([
    ...byConsultant.keys(),
    ...adHocByConsultant.keys(),
  ]);

  let generated = 0;
  let skippedExisting = 0;
  const skippedWithUnreflectedAdHoc: SkippedAdHocWarning[] = [];
  await prisma.$transaction(async (tx) => {
    for (const consultantId of allConsultantIds) {
      const consultantEntries = byConsultant.get(consultantId) ?? [];
      const adHocForConsultant = adHocByConsultant.get(consultantId) ?? [];

      const existing = await tx.consultantPayment.findUnique({
        where: {
          consultantId_month_year: {
            consultantId,
            month: input.month,
            year: input.year,
          },
        },
        select: { id: true },
      });
      if (existing) {
        skippedExisting += 1;
        // M2: se ha pontuais no mes mas o pagamento existente NAO as reflete
        // (foram cadastradas depois da geracao), sinaliza para o operador. Nao
        // regeramos automaticamente — apenas damos visibilidade.
        if (adHocForConsultant.length > 0) {
          const adHocTotal = adHocForConsultant.reduce(
            (sum, payment) => sum + toNumber(payment.amount),
            0,
          );
          const reflectedLines = await tx.consultantPaymentLine.findMany({
            where: {
              consultantPaymentId: existing.id,
              description: { startsWith: AD_HOC_LINE_PREFIX },
            },
            select: { amount: true },
          });
          const reflectedAdHoc = reflectedLines.reduce(
            (sum, line) => sum + toNumber(line.amount),
            0,
          );
          if (round2(adHocTotal) > round2(reflectedAdHoc) + 0.001) {
            skippedWithUnreflectedAdHoc.push({
              consultantId,
              adHocTotal: round2(adHocTotal),
              reflectedAdHoc: round2(reflectedAdHoc),
            });
          }
        }
        continue;
      }

      const consultantRecord =
        consultantEntries[0]?.consultant ?? consultantById.get(consultantId);
      if (!consultantRecord) continue;

      const computed = computeConsultantMonthlyPayment({
        consultantId,
        consultantRecord,
        approvedEntries: consultantEntries,
        adHocs: adHocForConsultant,
        start,
        projectRateWindows,
      });
      if (!computed) continue;

      const payment = await tx.consultantPayment.create({
        data: {
          consultantId,
          month: input.month,
          year: input.year,
          contractType: computed.contractType,
          cltNetAmount: computed.cltNetAmount,
          pjAmount: computed.pjAmount,
          benefitAmount: computed.benefitAmount,
          totalAmount: computed.totalAmount,
        },
      });
      await tx.consultantPaymentLine.createMany({
        data: computed.lines.map((line) => ({
          consultantPaymentId: payment.id,
          ...line,
        })),
      });
      generated += 1;
    }
    if (input.audit) {
      await tx.auditEvent.create({
        data: {
          actorUserId: input.audit.actorUserId,
          entityType: "ConsultantPayment",
          entityId: input.audit.entityId,
          action: input.audit.action,
          before: Prisma.JsonNull,
          after: {
            generated,
            skippedExisting,
            skippedWithUnreflectedAdHoc: skippedWithUnreflectedAdHoc.length,
          },
        },
      });
    }
  });

  return { generated, skippedExisting, skippedWithUnreflectedAdHoc };
}

// ---------------------------------------------------------------------------
// Reconciliação escopada (B) — disparada pelo Fechamento Operacional.
//
// Ao FECHAR um projeto/mês, recomputa o pagamento SÓ dos consultores daquele
// projeto. Regra de produto ("atualiza a cada fechamento enquanto em aberto"):
//   - Não existe pagamento no mês => CRIA (status OPEN).
//   - Existe e status == OPEN      => RECONCILIA (substitui linhas + recalcula
//                                     montantes; recomputa de TODAS as horas
//                                     aprovadas do mês, todos os projetos).
//   - Existe e status != OPEN      => NÃO ALTERA. Se o valor recomputado diverge
//                                     do atual, reporta em `lockedDivergent`.
//
// SEGURANÇA FINANCEIRA: nunca reescreve um pagamento fora de OPEN. O update de
// reconciliação é condicional (`where status = OPEN`) para ser robusto a corrida
// — se o status sair de OPEN entre a leitura e a escrita, o update não afeta
// nenhuma linha e o pagamento é tratado como travado.
//
// PRESERVAÇÃO DA NF: a reconciliação só apaga/recria ConsultantPaymentLine e
// atualiza os montantes de remuneração. NÃO toca em invoiceAmount nem nos
// ConsultantInvoiceAttachment (tabela separada; o cascade só dispara no delete
// do próprio ConsultantPayment, que nunca ocorre aqui).
// ---------------------------------------------------------------------------

/**
 * Tolerância para considerar dois totais como divergentes. Menor que 1 centavo:
 * como `currentTotal`/`recomputedTotal` já passam por `round2` (centavos), uma
 * diferença real de exatamente R$ 0,01 PRECISA ser sinalizada — por isso o
 * limite fica abaixo de 0,01.
 */
const RECONCILE_DIVERGENCE_EPSILON = 0.005;

export interface ReconcileLockedDivergent {
  consultantId: string;
  name: string;
  currentTotal: number;
  recomputedTotal: number;
  status: ConsultantPaymentStatus;
}

export interface ReconcileConsultantPaymentsResult {
  created: number;
  refreshed: number;
  lockedDivergent: ReconcileLockedDivergent[];
  skippedNoCompensation: { consultantId: string; name: string }[];
  /**
   * Consultores cujo contrato NÃO é pagável neste fluxo (CLT puro sai como
   * folha — só PJ/CLT_FLEX geram ConsultantPayment aqui). Não criamos/reconcili-
   * amos: apenas contabilizamos para dar visibilidade.
   */
  skippedNotPayable: {
    consultantId: string;
    name: string;
    contractType: ConsultantContractType;
  }[];
}

export async function reconcileConsultantPaymentsForConsultants(input: {
  month: number;
  year: number;
  consultantIds: string[];
  audit?: {
    actorUserId: string | null;
    entityId: string;
    action: string;
  };
}): Promise<ReconcileConsultantPaymentsResult> {
  const result: ReconcileConsultantPaymentsResult = {
    created: 0,
    refreshed: 0,
    lockedDivergent: [],
    skippedNoCompensation: [],
    skippedNotPayable: [],
  };

  const consultantIds = [...new Set(input.consultantIds)].filter(Boolean);
  if (consultantIds.length === 0) return result;

  /**
   * Registra UMA divergência travada (status != OPEN, ou corrida que tirou o
   * pagamento de OPEN): sinaliza no retorno E grava um AuditEvent com os valores
   * sensíveis (currentTotal/recomputedTotal). Assim o dado financeiro fica no
   * audit server-side — o payload devolvido ao cliente pelo `closeOperation` é
   * sanitizado (sem valores).
   */
  const recordLockedDivergence = async (params: {
    paymentId: string;
    consultantId: string;
    name: string;
    status: ConsultantPaymentStatus;
    currentTotal: number;
    recomputedTotal: number;
  }): Promise<void> => {
    result.lockedDivergent.push({
      consultantId: params.consultantId,
      name: params.name,
      currentTotal: params.currentTotal,
      recomputedTotal: params.recomputedTotal,
      status: params.status,
    });
    await prisma.auditEvent.create({
      data: buildAuditEventData({
        actorUserId: input.audit?.actorUserId ?? null,
        entityType: "ConsultantPayment",
        entityId: params.paymentId,
        action: "CONSULTANT_PAYMENT_RECONCILE_LOCKED_DIVERGENT",
        after: {
          consultantId: params.consultantId,
          status: params.status,
          currentTotal: params.currentTotal,
          recomputedTotal: params.recomputedTotal,
          source: "OPERATION_CLOSING",
        },
      }),
    });
  };

  const { start, end } = monthBounds(input.month, input.year);

  // ESCOPO: só os consultores do projeto fechado. O `consultantId in` restringe
  // TODAS as leituras — nunca tocamos consultores fora do escopo.
  const entries = await prisma.timeEntry.findMany({
    where: {
      status: "APPROVED",
      date: { gte: start, lt: end },
      consultantId: { in: consultantIds },
    },
    include: { project: { select: { name: true } } },
  });
  const adHocPayments = await prisma.consultantAdHocPayment.findMany({
    where: {
      status: { not: "CANCELLED" },
      payAt: { gte: start, lt: end },
      consultantId: { in: consultantIds },
    },
    include: { project: { select: { name: true } } },
  });

  const byConsultant = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = byConsultant.get(entry.consultantId) ?? [];
    list.push(entry);
    byConsultant.set(entry.consultantId, list);
  }
  const adHocByConsultant = new Map<string, typeof adHocPayments>();
  for (const payment of adHocPayments) {
    const list = adHocByConsultant.get(payment.consultantId) ?? [];
    list.push(payment);
    adHocByConsultant.set(payment.consultantId, list);
  }

  const projectRateRows = await prisma.consultantProjectRate.findMany({
    where: { consultantId: { in: consultantIds } },
  });
  const projectRateWindows = new Map<string, ProjectRateWindow[]>();
  for (const rate of projectRateRows) {
    const key = projectRateKey(rate.consultantId, rate.projectId);
    const list = projectRateWindows.get(key) ?? [];
    list.push({
      startsAt: rate.startsAt,
      endsAt: rate.endsAt,
      hourlyRate: toNumber(rate.hourlyRate),
    });
    projectRateWindows.set(key, list);
  }

  const consultants = await prisma.consultant.findMany({
    where: { id: { in: consultantIds } },
    include: { compensations: true, benefits: true },
  });
  const consultantById = new Map(consultants.map((c) => [c.id, c]));

  for (const consultantId of consultantIds) {
    const record = consultantById.get(consultantId);
    const name = record?.name ?? "Consultor";
    if (!record) {
      result.skippedNoCompensation.push({ consultantId, name });
      continue;
    }

    const computed = computeConsultantMonthlyPayment({
      consultantId,
      consultantRecord: record,
      approvedEntries: byConsultant.get(consultantId) ?? [],
      adHocs: adHocByConsultant.get(consultantId) ?? [],
      start,
      projectRateWindows,
    });
    if (!computed) {
      // Sem compensação vigente: nada a computar. Não tocamos em nada.
      result.skippedNoCompensation.push({ consultantId, name });
      continue;
    }

    // CLT puro é folha (jump-hr-compensation-agent) e NÃO gera ConsultantPayment
    // aqui: só PJ/CLT_FLEX são pagáveis neste fluxo. Sem este guard, um CLT
    // ganharia um pagamento invisível na tela (filtra PAYMENT_CONTRACT_TYPES) e
    // inflaria o "N gerados". Não cria nem reconcilia; só contabiliza.
    if (!PAYMENT_CONTRACT_TYPES.includes(computed.contractType)) {
      result.skippedNotPayable.push({
        consultantId,
        name,
        contractType: computed.contractType,
      });
      continue;
    }

    let existing = await prisma.consultantPayment.findUnique({
      where: {
        consultantId_month_year: {
          consultantId,
          month: input.month,
          year: input.year,
        },
      },
      select: { id: true, status: true, totalAmount: true },
    });

    // CRIAR — não existe pagamento no mês. Idempotente sob corrida: dois
    // fechamentos concorrentes de projetos que compartilham um consultor podem
    // ambos ler existing=null; o segundo viola o unique consultantId_month_year.
    // Capturamos o P2002, re-lemos o pagamento e caímos no caminho de "existente"
    // (que já é robusto), em vez de derrubar todo o reconcile num erro espúrio.
    if (!existing) {
      let createdRow: { id: string } | null = null;
      try {
        createdRow = await prisma.$transaction(async (tx) => {
          const payment = await tx.consultantPayment.create({
            data: {
              consultantId,
              month: input.month,
              year: input.year,
              contractType: computed.contractType,
              cltNetAmount: computed.cltNetAmount,
              pjAmount: computed.pjAmount,
              benefitAmount: computed.benefitAmount,
              totalAmount: computed.totalAmount,
            },
          });
          await tx.consultantPaymentLine.createMany({
            data: computed.lines.map((line) => ({
              consultantPaymentId: payment.id,
              ...line,
            })),
          });
          await tx.auditEvent.create({
            data: buildAuditEventData({
              actorUserId: input.audit?.actorUserId ?? null,
              entityType: "ConsultantPayment",
              entityId: payment.id,
              action: "CONSULTANT_PAYMENT_RECONCILE_CREATED",
              after: {
                consultantId,
                month: input.month,
                year: input.year,
                totalAmount: computed.totalAmount,
                source: "OPERATION_CLOSING",
              },
            }),
          });
          return { id: payment.id };
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          // Criação concorrente: re-lê e trata como existente abaixo.
          existing = await prisma.consultantPayment.findUnique({
            where: {
              consultantId_month_year: {
                consultantId,
                month: input.month,
                year: input.year,
              },
            },
            select: { id: true, status: true, totalAmount: true },
          });
        } else {
          throw error;
        }
      }
      if (createdRow) {
        result.created += 1;
        continue;
      }
      // Se caiu aqui sem createdRow, houve P2002 e existing foi re-lido; num caso
      // impossível de existing ainda null, não há o que fazer.
      if (!existing) continue;
    }

    // RECONCILIAR — só quando ainda em OPEN. Update condicional por status.
    if (existing.status === "OPEN") {
      const previousTotal = toNumber(existing.totalAmount);
      const paymentId = existing.id;
      const reconciled = await prisma.$transaction(async (tx) => {
        const updated = await tx.consultantPayment.updateMany({
          where: { id: paymentId, status: "OPEN" },
          data: {
            contractType: computed.contractType,
            cltNetAmount: computed.cltNetAmount,
            pjAmount: computed.pjAmount,
            benefitAmount: computed.benefitAmount,
            totalAmount: computed.totalAmount,
          },
        });
        // Corrida: saiu de OPEN entre a leitura e a escrita — não mexe em linhas.
        if (updated.count !== 1) return false;
        await tx.consultantPaymentLine.deleteMany({
          where: { consultantPaymentId: paymentId },
        });
        await tx.consultantPaymentLine.createMany({
          data: computed.lines.map((line) => ({
            consultantPaymentId: paymentId,
            ...line,
          })),
        });
        await tx.auditEvent.create({
          data: buildAuditEventData({
            actorUserId: input.audit?.actorUserId ?? null,
            entityType: "ConsultantPayment",
            entityId: paymentId,
            action: "CONSULTANT_PAYMENT_RECONCILE_REFRESHED",
            before: { status: "OPEN", totalAmount: previousTotal },
            after: {
              totalAmount: computed.totalAmount,
              source: "OPERATION_CLOSING",
            },
          }),
        });
        return true;
      });
      if (reconciled) {
        result.refreshed += 1;
      } else {
        // Corrida: status mudou; trata como travado e avalia divergência.
        const current = round2(previousTotal);
        const recomputed = round2(computed.totalAmount);
        if (Math.abs(current - recomputed) > RECONCILE_DIVERGENCE_EPSILON) {
          await recordLockedDivergence({
            paymentId,
            consultantId,
            name,
            status: existing.status,
            currentTotal: current,
            recomputedTotal: recomputed,
          });
        }
      }
      continue;
    }

    // TRAVADO — Financeiro já começou (WAITING_FOR_INVOICE em diante) ou
    // CANCELLED. NUNCA reescreve; só reporta divergência (audit + retorno).
    const current = round2(toNumber(existing.totalAmount));
    const recomputed = round2(computed.totalAmount);
    if (Math.abs(current - recomputed) > RECONCILE_DIVERGENCE_EPSILON) {
      await recordLockedDivergence({
        paymentId: existing.id,
        consultantId,
        name,
        status: existing.status,
        currentTotal: current,
        recomputedTotal: recomputed,
      });
    }
  }

  if (input.audit) {
    await prisma.auditEvent.create({
      data: buildAuditEventData({
        actorUserId: input.audit.actorUserId,
        entityType: "ConsultantPayment",
        entityId: input.audit.entityId,
        action: input.audit.action,
        after: {
          created: result.created,
          refreshed: result.refreshed,
          lockedDivergent: result.lockedDivergent.length,
          skippedNoCompensation: result.skippedNoCompensation.length,
          skippedNotPayable: result.skippedNotPayable.length,
          consultants: consultantIds.length,
        },
      }),
    });
  }

  return result;
}

export async function sendConsultantPaymentForecast(input: {
  paymentId: string;
  responseDeadlineAt: Date;
  expectedPaymentAt: Date;
  actorUserId: string | null;
}) {
  const payment = await prisma.consultantPayment.findUnique({
    where: { id: input.paymentId },
    include: {
      consultant: { select: { id: true, name: true, email: true } },
      lines: {
        where: { projectId: { not: null } },
        include: { project: { select: { name: true } } },
        orderBy: [{ project: { name: "asc" } }, { createdAt: "asc" }],
      },
    },
  });
  if (!payment) return null;

  const projectLines = payment.lines.map((line) => ({
    projectName: line.project?.name ?? line.description,
    hours: toNumber(line.hours),
    unitRate: toNumber(line.unitRate),
    amount: toNumber(line.amount),
  }));

  const sent = await sendPaymentForecastEmail({
    consultantName: payment.consultant.name,
    consultantEmail: payment.consultant.email,
    month: payment.month,
    year: payment.year,
    totalAmount: toNumber(payment.totalAmount),
    expectedPaymentAt: toIsoDate(input.expectedPaymentAt)!,
    responseDeadlineAt: toIsoDate(input.responseDeadlineAt)!,
    projectLines,
  });

  await prisma.$transaction(async (tx) => {
    const forecast = await tx.consultantPaymentForecast.create({
      data: {
        consultantId: payment.consultant.id,
        closingMonth: payment.month,
        closingYear: payment.year,
        responseDeadlineAt: input.responseDeadlineAt,
        expectedPaymentAt: input.expectedPaymentAt,
        createdByUserId: input.actorUserId,
      },
    });
    await tx.consultantPayment.update({
      where: { id: payment.id },
      data: {
        forecastId: forecast.id,
        expectedPaymentAt: input.expectedPaymentAt,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "ConsultantPayment",
        entityId: payment.id,
        action: "CONSULTANT_PAYMENT_FORECAST_EMAIL_SENT",
        before: Prisma.JsonNull,
        after: {
          emailId: sent.id,
          provider: sent.provider,
          forecastId: forecast.id,
        },
      },
    });
  });

  return sent;
}

// ---------------------------------------------------------------------------
// Melhoria #3 — download da NF (URL assinada), com escopo anti-enumeração.
// ---------------------------------------------------------------------------

/**
 * Escopo de dono para o download da NF quando o solicitante NÃO é Financeiro.
 * Restringe ao consultor dono do pagamento — por id de User (produção) ou por
 * e-mail do consultor (dev-auth). O Financeiro chama sem escopo (baixa qualquer).
 */
export interface InvoiceAttachmentOwnerScope {
  ownerUserId?: string;
  ownerEmail?: string;
}

export interface InvoiceAttachmentDownload {
  id: string;
  fileName: string;
  contentType: string;
  storageBucket: string;
  storageKey: string;
  consultantPaymentId: string;
}

/**
 * Resolve UM anexo de NF para download. O escopo é aplicado NA QUERY (via
 * `consultantPayment.consultant`), então um consultor jamais enumera a NF de
 * outro por id: fora do escopo, a linha simplesmente não retorna (=> 404).
 */
export async function getInvoiceAttachmentForDownload(
  attachmentId: string,
  scope: InvoiceAttachmentOwnerScope = {},
): Promise<InvoiceAttachmentDownload | null> {
  const ownerWhere = scope.ownerUserId
    ? { consultantPayment: { consultant: { userId: scope.ownerUserId } } }
    : scope.ownerEmail
      ? {
          consultantPayment: {
            consultant: {
              email: { equals: scope.ownerEmail, mode: "insensitive" as const },
            },
          },
        }
      : {};
  const row = await prisma.consultantInvoiceAttachment.findFirst({
    where: { id: attachmentId, ...ownerWhere },
    select: {
      id: true,
      fileName: true,
      contentType: true,
      storageBucket: true,
      storageKey: true,
      consultantPaymentId: true,
    },
  });
  return row;
}

// ---------------------------------------------------------------------------
// Melhoria #1 — e-mail pedindo a NF ao consultor PJ.
// ---------------------------------------------------------------------------

/** AutomationEmailLog type/key for the "solicitar NF" email (idempotência). */
const INVOICE_REQUEST_EMAIL_TYPE = "CONSULTANT_INVOICE_REQUEST" as const;

/**
 * Statuses onde pedir a NF ainda faz sentido (a nota ainda não chegou). Só PJ
 * passa por NF neste fluxo; CLT_FLEX também recebe NF, mas a MELHORIA pede o
 * lembrete restrito a PJ — a restrição de contrato é aplicada no envio.
 */
const INVOICE_REQUEST_ELIGIBLE_STATUSES: ConsultantPaymentStatus[] = [
  "OPEN",
  "WAITING_FOR_INVOICE",
];

export interface ConsultantInvoiceRequestResult {
  status:
    | "SENT"
    | "SKIPPED_ALREADY_SENT"
    | "SKIPPED_NO_RULE"
    | "NOT_PJ"
    | "NOT_ELIGIBLE"
    | "NOT_FOUND";
  emailId?: string;
  provider?: string;
}

/**
 * Envia (idempotentemente) o e-mail pedindo a NF ao consultor PJ de UM
 * pagamento. Idempotência por AutomationEmailLog(type, referenceKey=paymentId):
 * um SENT já registrado não reenvia (a menos de `force`). O destinatário é o
 * consultor (EVENT_TARGET), rastreável no log. Best-effort quanto ao provedor:
 * uma falha de envio é registrada como FAILED e pode ser retentada.
 */
export async function sendConsultantInvoiceRequest(input: {
  paymentId: string;
  actorUserId: string | null;
  force?: boolean;
}): Promise<ConsultantInvoiceRequestResult> {
  const payment = await prisma.consultantPayment.findUnique({
    where: { id: input.paymentId },
    select: {
      id: true,
      month: true,
      year: true,
      status: true,
      contractType: true,
      pjAmount: true,
      totalAmount: true,
      consultant: { select: { name: true, email: true } },
    },
  });
  if (!payment) return { status: "NOT_FOUND" };
  // Melhoria pede lembrete só para PJ.
  if (payment.contractType !== "PJ") return { status: "NOT_PJ" };
  if (!INVOICE_REQUEST_ELIGIBLE_STATUSES.includes(payment.status)) {
    return { status: "NOT_ELIGIBLE" };
  }

  const referenceKey = payment.id;
  const existing = await prisma.automationEmailLog.findUnique({
    where: {
      type_referenceKey: {
        type: INVOICE_REQUEST_EMAIL_TYPE,
        referenceKey,
      },
    },
    select: { status: true },
  });
  if (existing?.status === "SENT" && !input.force) {
    return { status: "SKIPPED_ALREADY_SENT" };
  }

  // A regra CONSULTANT_INVOICE_REQUEST (/app/admin/notificacoes) pode desligar
  // ou adicionar destinatários; o consultor é o EVENT_TARGET (fail-open: sem
  // regra, envia ao consultor mesmo assim).
  const delivery = await resolveEventDelivery(INVOICE_REQUEST_EMAIL_TYPE, {
    targets: [
      { email: payment.consultant.email, name: payment.consultant.name },
    ],
  });
  if (delivery.skip || delivery.emails.length === 0) {
    return { status: "SKIPPED_NO_RULE" };
  }

  // Link direto para a tela do consultor "Minhas Notas" (/app/minhas-notas).
  // /app/pagamentos é restrito ao Financeiro — o consultor tomaria 403 lá.
  const notasUrl = appConfig.url
    ? `${appConfig.url}/app/minhas-notas`
    : undefined;
  const email = buildConsultantInvoiceRequestEmail({
    consultantName: payment.consultant.name,
    month: payment.month,
    year: payment.year,
    expectedAmount: toNumber(payment.pjAmount),
    notasUrl,
  });

  let sentId = "";
  let provider = "";
  let logStatus: "SENT" | "FAILED" = "SENT";
  let error: string | null = null;
  try {
    const sent = await getEmailTransport().send({
      to: delivery.emails,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    sentId = sent.id;
    provider = sent.provider;
  } catch (e) {
    logStatus = "FAILED";
    error = e instanceof Error ? e.message : String(e);
  }

  await prisma.$transaction(async (tx) => {
    // Upsert mantém idempotência: um FAILED anterior é promovido a SENT no
    // retry; nunca sobrescrevemos um SENT (curto-circuitado acima).
    await tx.automationEmailLog.upsert({
      where: {
        type_referenceKey: {
          type: INVOICE_REQUEST_EMAIL_TYPE,
          referenceKey,
        },
      },
      create: {
        type: INVOICE_REQUEST_EMAIL_TYPE,
        referenceKey,
        recipient: delivery.emails.join(", "),
        status: logStatus,
        error,
        meta: {
          messageId: sentId,
          provider,
          month: payment.month,
          year: payment.year,
        },
      },
      update: {
        recipient: delivery.emails.join(", "),
        status: logStatus,
        error,
        meta: {
          messageId: sentId,
          provider,
          month: payment.month,
          year: payment.year,
        },
      },
    });
    await tx.auditEvent.create({
      data: buildAuditEventData({
        actorUserId: input.actorUserId,
        entityType: "ConsultantPayment",
        entityId: payment.id,
        action: "CONSULTANT_PAYMENT_INVOICE_REQUEST_EMAIL_SENT",
        after: {
          status: logStatus,
          provider,
          recipients: delivery.emails,
          month: payment.month,
          year: payment.year,
        },
      }),
    });
  });

  if (logStatus === "FAILED") {
    return { status: "SKIPPED_NO_RULE", emailId: sentId, provider };
  }
  return { status: "SENT", emailId: sentId, provider };
}

export interface RequestMonthlyInvoicesResult {
  eligible: number;
  sent: number;
  skipped: number;
}

/**
 * Ação em massa "Solicitar NF do mês": envia o lembrete a TODOS os pagamentos PJ
 * elegíveis (status OPEN/WAITING_FOR_INVOICE) da competência. Idempotente por
 * pagamento — reexecutar não reenvia a quem já recebeu (SENT no log).
 */
export async function requestMonthlyConsultantInvoices(input: {
  month: number;
  year: number;
  actorUserId: string | null;
}): Promise<RequestMonthlyInvoicesResult> {
  const payments = await prisma.consultantPayment.findMany({
    where: {
      month: input.month,
      year: input.year,
      contractType: "PJ",
      status: { in: INVOICE_REQUEST_ELIGIBLE_STATUSES },
    },
    select: { id: true },
  });

  let sent = 0;
  let skipped = 0;
  for (const payment of payments) {
    const result = await sendConsultantInvoiceRequest({
      paymentId: payment.id,
      actorUserId: input.actorUserId,
    });
    if (result.status === "SENT") sent += 1;
    else skipped += 1;
  }
  return { eligible: payments.length, sent, skipped };
}
