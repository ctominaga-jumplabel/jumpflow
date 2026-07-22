import { Prisma, prisma } from "@jumpflow/database";
import type {
  RevenueClosingOverview,
  RevenueClosingRow,
} from "@/lib/financial/types";
import { resolveSaleRate, type SaleRateRange } from "@/lib/projects/rates";
import {
  computeProjectBilling,
  DEFAULT_BILLING_CONFIG,
  type BillingEngineConfig,
} from "@/lib/billing/charge-engine";
import type { BillingChargeType } from "@/lib/clients/types";
import { timeEntryEffectiveHours } from "@/lib/timesheet/effective-hours";

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

// Charge types that can be billed even without any approved hours in the
// period (a fixed/recurring value or a per-consultant value). These projects
// must generate a closing on their own, not only when hours were logged.
const FIXED_BILLING_TYPES: BillingChargeType[] = [
  "MONTHLY",
  "FIXED",
  "SUBSCRIPTION",
  "PER_PROJECT",
  "PER_ALLOCATED_CONSULTANT",
];

type BillingConfigRow = {
  roundingRule: string;
  fixedAmount: Prisma.Decimal | null;
  includedHours: Prisma.Decimal | null;
  overageRate: Prisma.Decimal | null;
  overageTreatment: string;
  perConsultantAmount: Prisma.Decimal | null;
  reimbursableExpenses: boolean;
  reimbursableMarkupPct: Prisma.Decimal | null;
  discountPct: Prisma.Decimal | null;
  penaltyPct: Prisma.Decimal | null;
  adjustmentIndex: string;
  adjustmentPct: Prisma.Decimal | null;
};

function toEngineConfig(
  row: BillingConfigRow | null | undefined,
): BillingEngineConfig {
  if (!row) return DEFAULT_BILLING_CONFIG;
  const num = (v: Prisma.Decimal | null) => (v == null ? undefined : Number(v));
  return {
    roundingRule: row.roundingRule as BillingEngineConfig["roundingRule"],
    fixedAmount: num(row.fixedAmount),
    includedHours: num(row.includedHours),
    overageRate: num(row.overageRate),
    overageTreatment:
      row.overageTreatment as BillingEngineConfig["overageTreatment"],
    perConsultantAmount: num(row.perConsultantAmount),
    reimbursableExpenses: row.reimbursableExpenses,
    reimbursableMarkupPct: num(row.reimbursableMarkupPct),
    discountPct: num(row.discountPct),
    penaltyPct: num(row.penaltyPct),
    adjustmentIndex: row.adjustmentIndex as BillingEngineConfig["adjustmentIndex"],
    adjustmentPct: num(row.adjustmentPct),
  };
}

export type RevenueClosingAdvanceAction =
  | "SUBMIT_REVIEW"
  | "MARK_READY"
  | "CLOSE"
  | "MARK_INVOICED"
  | "CANCEL"
  // Reverse transitions ("voltar status"). Reopening a CLOSED closing is a
  // sensitive change (audited) and is blocked upstream when a non-cancelled
  // fiscal document exists. Un-invoicing (INVOICED -> CLOSED) is NOT offered:
  // an issued NFS-e must be cancelled through the fiscal flow first.
  | "REVERT_TO_OPEN"
  | "REVERT_TO_REVIEW"
  | "REOPEN";

export const revenueClosingTransitions: Record<
  RevenueClosingAdvanceAction,
  {
    expected: "OPEN" | "IN_REVIEW" | "READY_TO_CLOSE" | "CLOSED";
    next:
      | "OPEN"
      | "IN_REVIEW"
      | "READY_TO_CLOSE"
      | "CLOSED"
      | "INVOICED"
      | "CANCELLED";
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
  REVERT_TO_OPEN: {
    expected: "IN_REVIEW",
    next: "OPEN",
    auditAction: "REVENUE_CLOSING_REVERTED_OPEN",
  },
  REVERT_TO_REVIEW: {
    expected: "READY_TO_CLOSE",
    next: "IN_REVIEW",
    auditAction: "REVENUE_CLOSING_REVERTED_REVIEW",
  },
  REOPEN: {
    expected: "CLOSED",
    next: "READY_TO_CLOSE",
    auditAction: "REVENUE_CLOSING_REOPENED",
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
      project: { select: { name: true, opportunityType: true } },
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
        projectId: row.projectId ?? null,
        clientName: row.client.name,
        projectName: row.project?.name ?? "Sem projeto",
        opportunityType:
          (row.project
            ?.opportunityType as RevenueClosingRow["opportunityType"]) ?? null,
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

export interface RevenueClosingForPreInvoice {
  closing: {
    id: string;
    month: number;
    year: number;
    status: string;
    adjustmentAmount: number;
  };
  client: {
    id: string;
    name: string;
    document: string | null;
    contactEmail: string | null;
    municipality: string | null;
    issRate: number | null;
  };
  lines: Array<{
    projectId: string;
    projectName: string;
    hours: number;
    unitRate: number;
    amount: number;
  }>;
}

/**
 * Load everything the pure pre-invoice builder needs: the closing, its client
 * billing data (document, municipality, issRate, contactEmail) and the lines
 * grouped by project. Lines are summed per project so the pre-invoice shows one
 * row per project (not one per time entry).
 */
export async function getRevenueClosingForPreInvoice(
  id: string,
): Promise<RevenueClosingForPreInvoice | null> {
  const closing = await prisma.revenueClosing.findUnique({
    where: { id },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          document: true,
          contactEmail: true,
          municipality: true,
          issRate: true,
        },
      },
      project: { select: { id: true, name: true } },
    },
  });
  if (!closing) return null;

  // One closing = one project. The billable hours/amount come from the engine
  // (closing totals), not from re-summing the per-entry lines — those are raw
  // hour detail and do not include fixed/excess/discount adjustments.
  const billableHours = toNumber(closing.totalHours);
  const billableAmount = toNumber(closing.totalAmount);
  const lines = closing.project
    ? [
        {
          projectId: closing.project.id,
          projectName: closing.project.name,
          hours: billableHours,
          unitRate: closingAverageRate(billableHours, billableAmount),
          amount: billableAmount,
        },
      ]
    : [];

  return {
    closing: {
      id: closing.id,
      month: closing.month,
      year: closing.year,
      status: closing.status,
      adjustmentAmount: toNumber(closing.adjustmentAmount),
    },
    client: {
      id: closing.client.id,
      name: closing.client.name,
      document: closing.client.document,
      contactEmail: closing.client.contactEmail,
      municipality: closing.client.municipality,
      issRate: closing.client.issRate == null ? null : toNumber(closing.client.issRate),
    },
    lines,
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
  const projectInclude = {
    client: { select: { id: true, defaultHourlyRate: true } },
    saleRates: true,
    billingType: { select: { chargeType: true } },
    billingConfig: true,
    allocations: { where: { status: "ACTIVE" as const }, select: { id: true } },
  };

  const entries = await prisma.timeEntry.findMany({
    where: {
      status: "APPROVED",
      billable: true,
      date: { gte: start, lt: end },
    },
    include: { project: { include: projectInclude } },
    orderBy: [{ projectId: "asc" }, { date: "asc" }],
  });

  type ProjectWithMeta = (typeof entries)[number]["project"];
  const projects = new Map<string, ProjectWithMeta>();
  const byProject = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = byProject.get(entry.projectId) ?? [];
    list.push(entry);
    byProject.set(entry.projectId, list);
    projects.set(entry.projectId, entry.project);
  }

  // Fixed/recurring projects bill even without logged hours: include active
  // projects with a billing config whose charge model is hour-independent.
  const fixedProjects = await prisma.project.findMany({
    where: {
      status: "ACTIVE",
      id: { notIn: [...projects.keys()] },
      billingConfig: { isNot: null },
      billingType: { is: { chargeType: { in: FIXED_BILLING_TYPES } } },
    },
    include: projectInclude,
  });
  for (const project of fixedProjects) projects.set(project.id, project);

  // Approved reimbursable expenses in the period, per project (used by T&M).
  const expenseRows = await prisma.expense.groupBy({
    by: ["projectId"],
    where: {
      projectId: { in: [...projects.keys()] },
      date: { gte: start, lt: end },
      status: { in: ["FINANCE_APPROVED", "PAYMENT_SCHEDULED", "PAID"] },
    },
    _sum: { amount: true },
  });
  const expensesByProject = new Map<string, number>(
    expenseRows.map((row) => [row.projectId, toNumber(row._sum.amount)]),
  );

  let generated = 0;
  let skippedClosed = 0;
  await prisma.$transaction(async (tx) => {
    for (const [projectId, project] of projects) {
      const existing = await tx.revenueClosing.findFirst({
        where: {
          clientId: project.clientId,
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

      const projectEntries = byProject.get(projectId) ?? [];
      let approvedHours = 0;
      let hourlyAmount = 0;
      const rates = project.saleRates.map(toRateRange);
      const lineData = projectEntries.map((entry) => {
        // Faturamento usa o equivalente (hours x multiplier) como base de horas.
        // Só chegam aqui lançamentos billable=true (filtro na query acima);
        // não faturáveis são excluídos da receita. Atividades normais têm
        // multiplier=1.00, então effectiveHours == hours (sem regressão).
        const hours = timeEntryEffectiveHours(
          Number(entry.hours),
          Number(entry.multiplier),
        );
        const resolved = resolveSaleRate(rates, {
          date: toIsoDate(entry.date),
          consultantId: entry.consultantId,
          allocationId: entry.allocationId,
          projectFallbackRate: toNumber(project.billingHourlyRate),
          clientFallbackRate: toNumber(project.client.defaultHourlyRate),
        });
        const unitRate = resolved?.hourlyRate ?? 0;
        const amount = hours * unitRate;
        approvedHours += hours;
        hourlyAmount += amount;
        return {
          projectId,
          timeEntryId: entry.id,
          description: entry.description,
          hours,
          unitRate,
          amount,
        };
      });

      // Dispatch to the billing rules engine. No billing type -> legacy hourly.
      const chargeType = (project.billingType?.chargeType ??
        "HOURLY") as BillingChargeType;
      const billing = computeProjectBilling({
        chargeType,
        config: toEngineConfig(project.billingConfig),
        context: {
          approvedHours,
          hourlyAmount,
          allocatedConsultants: project.allocations.length,
          reimbursableExpenseTotal: expensesByProject.get(projectId) ?? 0,
        },
      });
      const notes = billing.notes.length > 0 ? billing.notes.join(" ") : null;

      const closing = existing
        ? await tx.revenueClosing.update({
            where: { id: existing.id },
            data: {
              totalHours: billing.hours,
              grossAmount: billing.subtotal,
              totalAmount: billing.amount,
              adjustmentAmount: 0,
              notes,
            },
          })
        : await tx.revenueClosing.create({
            data: {
              clientId: project.clientId,
              projectId,
              month: input.month,
              year: input.year,
              totalHours: billing.hours,
              grossAmount: billing.subtotal,
              totalAmount: billing.amount,
              adjustmentAmount: 0,
              notes,
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
