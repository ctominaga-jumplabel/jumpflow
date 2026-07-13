/**
 * Acompanhamento do projeto (Onda C) — camada de dados.
 *
 * Resolve, por alocação, a taxa de venda vigente (resolveSaleRate) e o custo/h
 * vigente (o mesmo critério do MarginPanel em `lib/db/margin.ts`), soma as horas
 * APROVADAS a partir dos TimeEntry e alimenta o builder puro
 * `computeProjectTracking`. RBAC/escopo (D5) é aplicado pelo CHAMADOR (a server
 * action `getProjectTracking`), não aqui.
 */
import { prisma } from "@jumpflow/database";
import { resolveSaleRate, type SaleRateRange } from "@/lib/projects/rates";
import { timeEntryEffectiveHours } from "@/lib/timesheet/effective-hours";
import {
  computeProjectTracking,
  type ProjectTracking,
  type PlannedBasis,
  type TrackingAllocationInput,
} from "@/lib/projects/tracking";

const STANDARD_MONTH_HOURS = 160;
const num = (v: unknown): number => Number(v ?? 0);
const iso = (d: Date): string => d.toISOString().slice(0, 10);
const round2 = (v: number): number =>
  Math.round((v + Number.EPSILON) * 100) / 100;

// Alocações que participam do PLANO (previsto). Mesma semântica do MarginPanel.
const PLANNED_STATUSES = new Set(["ACTIVE", "PLANNED"]);

export async function loadProjectTracking(
  projectId: string,
): Promise<ProjectTracking | null> {
  const today = iso(new Date());

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      budgetHours: true,
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
        where: { status: { not: "CANCELLED" } },
        orderBy: [{ status: "asc" }, { startDate: "desc" }],
        select: {
          id: true,
          role: true,
          allocationPercent: true,
          status: true,
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
  if (!project) return null;

  // Horas APROVADAS do projeto, agrupadas por alocação (equivalente
  // hours×multiplier). billable separa a base de receita da base de custo.
  const entries = await prisma.timeEntry.findMany({
    where: { projectId, status: "APPROVED" },
    select: { allocationId: true, hours: true, multiplier: true, billable: true },
  });
  const byAllocation = new Map<string, { billable: number; total: number }>();
  let unallocatedApprovedHours = 0;
  for (const entry of entries) {
    const eff = timeEntryEffectiveHours(num(entry.hours), num(entry.multiplier));
    if (!entry.allocationId) {
      unallocatedApprovedHours += eff;
      continue;
    }
    const acc = byAllocation.get(entry.allocationId) ?? { billable: 0, total: 0 };
    acc.total += eff;
    if (entry.billable) acc.billable += eff;
    byAllocation.set(entry.allocationId, acc);
  }

  const saleRanges: SaleRateRange[] = project.saleRates.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    consultantId: r.consultantId,
    allocationId: r.allocationId,
    startsAt: iso(r.startsAt),
    endsAt: r.endsAt ? iso(r.endsAt) : null,
    hourlyRate: num(r.hourlyRate),
  }));

  const budgetHours =
    project.budgetHours == null ? null : num(project.budgetHours);
  // Peso do rateio do budget = soma das % das alocações do PLANO.
  const plannedWeight = project.allocations
    .filter((a) => PLANNED_STATUSES.has(a.status))
    .reduce((sum, a) => sum + a.allocationPercent, 0);
  const plannedBasis: PlannedBasis =
    budgetHours != null && budgetHours > 0 && plannedWeight > 0
      ? "BUDGET"
      : "MONTHLY";

  const allocations: TrackingAllocationInput[] = project.allocations.map((a) => {
    const sale = resolveSaleRate(saleRanges, {
      date: today,
      consultantId: a.consultantId,
      allocationId: a.id,
    });
    const cost = a.costRates.find((c) => {
      const start = iso(c.startsAt);
      const end = c.endsAt ? iso(c.endsAt) : null;
      return start <= today && (end === null || today < end);
    });
    const saleRate = sale?.hourlyRate ?? null;
    const costRate = cost ? num(cost.hourlyCost) : null;

    let plannedHours: number | null = null;
    if (PLANNED_STATUSES.has(a.status)) {
      plannedHours =
        plannedBasis === "BUDGET"
          ? round2((budgetHours as number) * (a.allocationPercent / plannedWeight))
          : Math.round((a.allocationPercent / 100) * STANDARD_MONTH_HOURS);
    }

    const approved = byAllocation.get(a.id) ?? { billable: 0, total: 0 };
    return {
      allocationId: a.id,
      consultantName: a.consultant.name,
      role: a.role,
      allocationPercent: a.allocationPercent,
      status: a.status,
      saleRate,
      costRate,
      plannedHours,
      approvedBillableHours: round2(approved.billable),
      approvedTotalHours: round2(approved.total),
    };
  });

  // Faturamento fechado (complementar): soma de RevenueClosing não cancelados.
  const [closingAgg, closingCount, receivableGroups, adHocAgg] =
    await Promise.all([
      prisma.revenueClosing.aggregate({
        where: { projectId, status: { not: "CANCELLED" } },
        _sum: { totalAmount: true, totalHours: true },
      }),
      prisma.revenueClosing.count({
        where: { projectId, status: { not: "CANCELLED" } },
      }),
      prisma.projectReceivableSchedule.groupBy({
        by: ["status"],
        where: { projectId },
        _sum: { amount: true },
      }),
      // D2 (Onda D) + M3: custo REALIZADO das remunerações pontuais do projeto.
      // Só conta o que foi de fato PAGO (status PAID) — PLANNED é previsto, não
      // realizado, e não pode inflar o custo realizado. Janela = TODO o histórico
      // do projeto, coerente com a base CUMULATIVA do realizado (horas aprovadas
      // + fechamentos são acumulados, sem filtro de mês).
      prisma.consultantAdHocPayment.aggregate({
        where: { projectId, status: "PAID" },
        _sum: { amount: true },
      }),
    ]);
  const receivablesForecast = num(
    receivableGroups.find((g) => g.status === "FORECAST")?._sum.amount,
  );
  const receivablesReceived = num(
    receivableGroups.find((g) => g.status === "RECEIVED")?._sum.amount,
  );

  return computeProjectTracking({
    projectId: project.id,
    projectName: project.name,
    clientName: project.client.name,
    plannedBasis,
    budgetHours,
    allocations,
    unallocatedApprovedHours: round2(unallocatedApprovedHours),
    closingsBilled: closingCount > 0 ? num(closingAgg._sum.totalAmount) : null,
    closingsHours: num(closingAgg._sum.totalHours),
    closingsCount: closingCount,
    receivablesForecast,
    receivablesReceived,
    // D2 (Onda D) + M3: custo das remunerações pontuais PAGAS (status PAID) do
    // projeto entra no custo realizado da margem, via o ponto de extensão
    // `additionalRealizedCost` do builder puro. PLANNED não conta como realizado.
    // Janela: todo o histórico do projeto (base cumulativa do realizado).
    additionalRealizedCost: round2(num(adHocAgg._sum.amount)),
  });
}
