import { Prisma, prisma } from "@jumpflow/database";
import type {
  RevenueClosingOverview,
  RevenueClosingRow,
} from "@/lib/financial/types";
import { resolveSaleRate, type SaleRateRange } from "@/lib/projects/rates";

function monthBounds(month: number, year: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

function toRateRange(row: {
  id: string;
  projectId: string;
  consultantId: string | null;
  allocationId: string | null;
  startsAt: Date;
  endsAt: Date | null;
  hourlyRate: Prisma.Decimal;
}): SaleRateRange {
  return {
    id: row.id,
    projectId: row.projectId,
    consultantId: row.consultantId,
    allocationId: row.allocationId,
    startsAt: toIsoDate(row.startsAt),
    endsAt: row.endsAt ? toIsoDate(row.endsAt) : null,
    hourlyRate: Number(row.hourlyRate),
  };
}

export function closingAverageRate(hours: number, amount: number): number {
  if (hours <= 0) return 0;
  return amount / hours;
}

export type RevenueClosingAdvanceAction =
  | "SUBMIT_REVIEW"
  | "MARK_READY"
  | "CLOSE"
  | "MARK_INVOICED"
  | "CANCEL";

export const revenueClosingTransitions: Record<
  RevenueClosingAdvanceAction,
  {
    expected: "OPEN" | "IN_REVIEW" | "READY_TO_CLOSE" | "CLOSED";
    next: "IN_REVIEW" | "READY_TO_CLOSE" | "CLOSED" | "INVOICED" | "CANCELLED";
    auditAction: string;
  }
> = {
  SUBMIT_REVIEW: {
    expected: "OPEN",
    next: "IN_REVIEW",
    auditAction: "REVENUE_CLOSING_SUBMITTED_REVIEW",
  },
  MARK_READY: {
    expected: "IN_REVIEW",
    next: "READY_TO_CLOSE",
    auditAction: "REVENUE_CLOSING_MARKED_READY",
  },
  CLOSE: {
    expected: "READY_TO_CLOSE",
    next: "CLOSED",
    auditAction: "REVENUE_CLOSING_CLOSED",
  },
  MARK_INVOICED: {
    expected: "CLOSED",
    next: "INVOICED",
    auditAction: "REVENUE_CLOSING_INVOICED",
  },
  CANCEL: {
    expected: "OPEN",
    next: "CANCELLED",
    auditAction: "REVENUE_CLOSING_CANCELLED",
  },
};

export async function listRevenueClosings(input: {
  month: number;
  year: number;
}): Promise<RevenueClosingOverview> {
  const rows = await prisma.revenueClosing.findMany({
    where: { month: input.month, year: input.year },
    include: {
      client: { select: { name: true } },
      project: { select: { name: true } },
      fiscalDocuments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          invoiceNumber: true,
          protocol: true,
          issuedAt: true,
        },
      },
    },
    orderBy: [{ client: { name: "asc" } }, { project: { name: "asc" } }],
  });

  return {
    month: input.month,
    year: input.year,
    rows: rows.map<RevenueClosingRow>((row) => {
      const hours = toNumber(row.totalHours);
      const amount = toNumber(row.totalAmount);
      const fiscal = row.fiscalDocuments[0] ?? null;
      return {
        id: row.id,
        clientName: row.client.name,
        projectName: row.project?.name ?? "Sem projeto",
        approvedHours: hours,
        billingHourlyRate: closingAverageRate(hours, amount),
        amount,
        status: row.status,
        fiscalDocument: fiscal
          ? {
              id: fiscal.id,
              status: fiscal.status,
              invoiceNumber: fiscal.invoiceNumber,
              protocol: fiscal.protocol,
              issuedAt: fiscal.issuedAt ? fiscal.issuedAt.toISOString() : null,
            }
          : null,
      };
    }),
  };
}

export async function generateRevenueClosings(input: {
  month: number;
  year: number;
  audit?: {
    actorUserId: string | null;
    entityId: string;
    action: string;
  };
}): Promise<{ generated: number; skippedClosed: number }> {
  const { start, end } = monthBounds(input.month, input.year);
  const entries = await prisma.timeEntry.findMany({
    where: {
      status: "APPROVED",
      billable: true,
      date: { gte: start, lt: end },
    },
    include: {
      project: {
        include: {
          client: { select: { id: true, defaultHourlyRate: true } },
          saleRates: true,
        },
      },
    },
    orderBy: [{ projectId: "asc" }, { date: "asc" }],
  });

  const byProject = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = byProject.get(entry.projectId) ?? [];
    list.push(entry);
    byProject.set(entry.projectId, list);
  }

  let generated = 0;
  let skippedClosed = 0;
  await prisma.$transaction(async (tx) => {
    for (const [projectId, projectEntries] of byProject) {
      const first = projectEntries[0]!;
      const existing = await tx.revenueClosing.findFirst({
        where: {
          clientId: first.project.clientId,
          projectId,
          month: input.month,
          year: input.year,
        },
        select: { id: true, status: true },
      });
      if (
        existing &&
        ["CLOSED", "INVOICED", "CANCELLED"].includes(existing.status)
      ) {
        skippedClosed += 1;
        continue;
      }

      let totalHours = 0;
      let grossAmount = 0;
      const rates = first.project.saleRates.map(toRateRange);
      const lineData = projectEntries.map((entry) => {
        const hours = Number(entry.hours);
        const resolved = resolveSaleRate(rates, {
          date: toIsoDate(entry.date),
          consultantId: entry.consultantId,
          allocationId: entry.allocationId,
          projectFallbackRate: toNumber(first.project.billingHourlyRate),
          clientFallbackRate: toNumber(first.project.client.defaultHourlyRate),
        });
        const unitRate = resolved?.hourlyRate ?? 0;
        const amount = hours * unitRate;
        totalHours += hours;
        grossAmount += amount;
        return {
          projectId,
          timeEntryId: entry.id,
          description: entry.description,
          hours,
          unitRate,
          amount,
        };
      });

      const closing = existing
        ? await tx.revenueClosing.update({
            where: { id: existing.id },
            data: {
              totalHours,
              grossAmount,
              totalAmount: grossAmount,
              adjustmentAmount: 0,
            },
          })
        : await tx.revenueClosing.create({
            data: {
              clientId: first.project.clientId,
              projectId,
              month: input.month,
              year: input.year,
              totalHours,
              grossAmount,
              totalAmount: grossAmount,
              adjustmentAmount: 0,
            },
          });

      await tx.revenueClosingLine.deleteMany({
        where: { revenueClosingId: closing.id },
      });
      if (lineData.length > 0) {
        await tx.revenueClosingLine.createMany({
          data: lineData.map((line) => ({
            revenueClosingId: closing.id,
            ...line,
          })),
        });
      }
      generated += 1;
    }
    if (input.audit) {
      await tx.auditEvent.create({
        data: {
          actorUserId: input.audit.actorUserId,
          entityType: "RevenueClosing",
          entityId: input.audit.entityId,
          action: input.audit.action,
          before: Prisma.JsonNull,
          after: { generated, skippedClosed },
        },
      });
    }
  });

  return { generated, skippedClosed };
}
