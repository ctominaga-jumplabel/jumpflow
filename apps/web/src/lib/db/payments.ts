import { Prisma, prisma } from "@jumpflow/database";
import { buildConsultantPaymentAmounts } from "@/lib/payments/amounts";
import type {
  PaymentForecastView,
  ConsultantPaymentLineView,
  ConsultantPaymentView,
} from "@/lib/payments/types";
import { sendPaymentForecastEmail } from "@/lib/payments/notify";

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

export async function listConsultantPayments(input: {
  month: number;
  year: number;
}): Promise<ConsultantPaymentView[]> {
  const rows = await prisma.consultantPayment.findMany({
    where: { month: input.month, year: input.year },
    include: {
      consultant: { select: { name: true, email: true } },
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
}): Promise<{ generated: number; skippedExisting: number }> {
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

  const byConsultant = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = byConsultant.get(entry.consultantId) ?? [];
    list.push(entry);
    byConsultant.set(entry.consultantId, list);
  }

  let generated = 0;
  let skippedExisting = 0;
  await prisma.$transaction(async (tx) => {
    for (const [consultantId, consultantEntries] of byConsultant) {
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
        continue;
      }

      const first = consultantEntries[0]!;
      const compensation = activeOn(first.consultant.compensations, start);
      if (!compensation) continue;
      const benefits = first.consultant.benefits.filter(
        (benefit) => benefit.startsAt <= start && (!benefit.endsAt || start < benefit.endsAt),
      );
      const byProject = new Map<
        string,
        { projectName: string; hours: number; amount: number; unitRate: number }
      >();
      for (const entry of consultantEntries) {
        const hours = toNumber(entry.hours);
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
        projectId: null,
        description: `Beneficio ${benefit.type}`,
        hours: 0,
        unitRate: toNumber(benefit.amount),
        amount: toNumber(benefit.amount),
      }));
      const benefitCardAmount = toNumber(compensation.benefitCardAmount);
      if (benefitCardAmount > 0) {
        benefitLines.push({
          projectId: null,
          description: "Beneficio BENEFIT_CARD",
          hours: 0,
          unitRate: benefitCardAmount,
          amount: benefitCardAmount,
        });
      }
      const amounts = buildConsultantPaymentAmounts(
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
      );

      const payment = await tx.consultantPayment.create({
        data: {
          consultantId,
          month: input.month,
          year: input.year,
          contractType: compensation.contractType,
          cltNetAmount: amounts.cltNetAmount,
          pjAmount: amounts.pjAmount,
          benefitAmount: amounts.benefitAmount,
          totalAmount: amounts.totalAmount,
        },
      });
      await tx.consultantPaymentLine.createMany({
        data: [...projectLines, ...benefitLines].map((line) => ({
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
          after: { generated, skippedExisting },
        },
      });
    }
  });

  return { generated, skippedExisting };
}

export async function sendConsultantPaymentForecast(input: {
  paymentId: string;
  responseDeadlineAt: Date;
  expectedPaymentAt: Date;
  actorUserId: string | null;
}) {
  const payment = await prisma.consultantPayment.findUnique({
    where: { id: input.paymentId },
    include: { consultant: { select: { id: true, name: true, email: true } } },
  });
  if (!payment) return null;

  const sent = await sendPaymentForecastEmail({
    consultantName: payment.consultant.name,
    consultantEmail: payment.consultant.email,
    month: payment.month,
    year: payment.year,
    totalAmount: toNumber(payment.totalAmount),
    expectedPaymentAt: toIsoDate(input.expectedPaymentAt)!,
    responseDeadlineAt: toIsoDate(input.responseDeadlineAt)!,
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
