/**
 * Project margin (PR) data — Onda 4. Resolves each active allocation's sale
 * rate and cost rate and projects an EXPECTED MONTHLY margin
 * (monthlyHours = allocationPercent% × 160h). FINANCIAL_ROLES only — callers
 * gate with includeFinancialSignal before invoking.
 */
import { prisma } from "@jumpflow/database";
import {
  computeAllocationMargin,
  computeProjectMargin,
  type ProjectMarginTotals,
} from "@/lib/billing/margin";
import { resolveSaleRate, type SaleRateRange } from "@/lib/projects/rates";

const STANDARD_MONTH_HOURS = 160;
const num = (v: unknown): number => Number(v ?? 0);
const iso = (d: Date): string => d.toISOString().slice(0, 10);

export interface AllocationMarginRow {
  allocationId: string;
  consultantName: string;
  role: string;
  allocationPercent: number;
  monthlyHours: number;
  saleRate: number | null;
  costRate: number | null;
  revenue: number | null;
  cost: number | null;
  margin: number | null;
  marginPct: number | null;
  hasCost: boolean;
}

export interface ProjectMarginRow {
  projectId: string;
  projectName: string;
  clientName: string;
  allocations: AllocationMarginRow[];
  totals: ProjectMarginTotals;
}

export async function listProjectMargins(): Promise<ProjectMarginRow[]> {
  const today = iso(new Date());

  const projects = await prisma.project.findMany({
    where: { status: { in: ["ACTIVE", "PROPOSAL", "PAUSED"] } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      client: { select: { name: true } },
      saleRates: {
        select: {
          id: true,
          projectId: true,
          consultantId: true,
          allocationId: true,
          startsAt: true,
          endsAt: true,
          hourlyRate: true,
        },
      },
      allocations: {
        where: { status: { in: ["ACTIVE", "PLANNED"] } },
        select: {
          id: true,
          role: true,
          allocationPercent: true,
          consultantId: true,
          consultant: { select: { name: true } },
          costRates: {
            orderBy: { startsAt: "desc" },
            select: { startsAt: true, endsAt: true, hourlyCost: true },
          },
        },
      },
    },
  });

  return projects.map((project) => {
    const saleRanges: SaleRateRange[] = project.saleRates.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      consultantId: r.consultantId,
      allocationId: r.allocationId,
      startsAt: iso(r.startsAt),
      endsAt: r.endsAt ? iso(r.endsAt) : null,
      hourlyRate: num(r.hourlyRate),
    }));

    const allocations: AllocationMarginRow[] = project.allocations.map((a) => {
      const monthlyHours = Math.round(
        (a.allocationPercent / 100) * STANDARD_MONTH_HOURS,
      );
      const sale = resolveSaleRate(saleRanges, {
        date: today,
        consultantId: a.consultantId,
        allocationId: a.id,
      });
      // Cost vigent today: first (newest) rate whose range covers today.
      const cost = a.costRates.find((c) => {
        const start = iso(c.startsAt);
        const end = c.endsAt ? iso(c.endsAt) : null;
        return start <= today && (end === null || today < end);
      });
      const saleRate = sale?.hourlyRate ?? null;
      const costRate = cost ? num(cost.hourlyCost) : null;
      const m = computeAllocationMargin({ hours: monthlyHours, saleRate, costRate });
      return {
        allocationId: a.id,
        consultantName: a.consultant.name,
        role: a.role,
        allocationPercent: a.allocationPercent,
        monthlyHours,
        saleRate,
        costRate,
        revenue: m.revenue,
        cost: m.cost,
        margin: m.margin,
        marginPct: m.marginPct,
        hasCost: costRate != null,
      };
    });

    const totals = computeProjectMargin(
      allocations.map((a) => ({
        revenue: a.revenue,
        cost: a.cost,
        margin: a.margin,
        marginPct: a.marginPct,
      })),
    );

    return {
      projectId: project.id,
      projectName: project.name,
      clientName: project.client.name,
      allocations,
      totals,
    };
  });
}
