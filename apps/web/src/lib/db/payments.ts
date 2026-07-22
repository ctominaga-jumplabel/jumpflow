import { Prisma, prisma } from "@jumpflow/database";
import { buildConsultantPaymentAmounts } from "@/lib/payments/amounts";
import { timeEntryEffectiveHours } from "@/lib/timesheet/effective-hours";
import type { ConsultantPaymentStatus } from "@/lib/payments/state-machine";
import type {
  PaymentForecastView,
  ConsultantPaymentLineView,
  ConsultantPaymentView,
} from "@/lib/payments/types";

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
    include: {
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
    },
    orderBy: [{ consultant: { name: "asc" } }],
  });

  return rows.map((row) => ({
    id: row.id,
    consultantName: row.consultant.name,
    consultantEmail: row.consultant.email,
    contractType: row.contractType,
    cnpj: row.consultant.companyInfo?.cnpj ?? null,
    month: row.month,
    year: row.year,
    status: row.status,
    cltNetAmount: toNumber(row.cltNetAmount),
    pjAmount: toNumber(row.pjAmount),
    benefitAmount: toNumber(row.benefitAmount),
    totalAmount: toNumber(row.totalAmount),
    expectedPaymentAt: toIsoDate(row.expectedPaymentAt),
    confirmedPaidAt: toIsoDate(row.confirmedPaidAt),
    invoiceReceivedAt: toIsoDate(row.invoiceReceivedAt),
    invoiceValidatedAt: toIsoDate(row.invoiceValidatedAt),
    lines: row.lines.map(paymentLineView),
  }));
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
      // Linhas de remuneracao pontual (D2): uma por ConsultantAdHocPayment do
      // mes, vinculada ao projeto (projectId sempre presente). hours=0 e
      // unitRate=amount (valor cheio, nao horario). SOMAM SEMPRE por cima; nao
      // passam pelos buckets de compensacao (CLT/PJ), pois nao derivam de horas
      // nem de beneficio recorrente — sao acertos avulsos.
      const adHocForConsultant = adHocByConsultant.get(consultantId) ?? [];
      const adHocLines = adHocForConsultant.map((payment) => ({
        projectId: payment.projectId,
        description: `${AD_HOC_LINE_PREFIX} (${payment.kind}) - ${payment.project?.name ?? "projeto"}`,
        hours: 0,
        unitRate: toNumber(payment.amount),
        amount: toNumber(payment.amount),
      }));
      const adHocTotal = adHocLines.reduce((sum, line) => sum + line.amount, 0);

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
      const compensation = activeOn(consultantRecord.compensations, start);
      if (!compensation) continue;

      // C2 (folha): a BASE (salario CLT liquido / pjAmount fixo + beneficios) so
      // compoe o pagamento quando ha HORAS APROVADAS no mes — comportamento
      // anterior a pontual. Consultor SEM horas (so-pontual) recebe APENAS as
      // linhas de pontual; nao entra na folha com salario integral.
      const hasApprovedHours = consultantEntries.length > 0;

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
      for (const entry of consultantEntries) {
        // Consultor é SEMPRE remunerado pelo equivalente (hours x multiplier).
        // Atividades normais têm multiplier=1.00 (effectiveHours == hours);
        // ON_CALL carrega fator fracionário (ex.: 0.33). Fonte única de cálculo:
        // timeEntryEffectiveHours. A flag `billable` não afeta pagamento.
        const hours = timeEntryEffectiveHours(
          toNumber(entry.hours),
          toNumber(entry.multiplier),
        );
        const rate = toNumber(compensation.hourlyRate);
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

      const projectLines = [...byProject.entries()].map(([projectId, line]) => ({
        projectId,
        description: `Horas aprovadas - ${line.projectName}`,
        hours: line.hours,
        unitRate: line.unitRate,
        amount: line.amount,
      }));
      const benefitLines = benefits.map((benefit) => ({
        projectId: null as string | null,
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

      // Base zerada quando nao ha horas: nada de salario/beneficios sem folha.
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

      const payment = await tx.consultantPayment.create({
        data: {
          consultantId,
          month: input.month,
          year: input.year,
          contractType: compensation.contractType,
          cltNetAmount: baseAmounts.cltNetAmount,
          pjAmount: baseAmounts.pjAmount,
          benefitAmount: baseAmounts.benefitAmount,
          totalAmount: baseAmounts.totalAmount + adHocTotal,
        },
      });
      await tx.consultantPaymentLine.createMany({
        data: [...projectLines, ...benefitLines, ...adHocLines].map((line) => ({
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
