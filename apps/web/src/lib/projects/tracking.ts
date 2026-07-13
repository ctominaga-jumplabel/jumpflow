/**
 * Acompanhamento do projeto (Onda C) — PREVISTO × REALIZADO de receita, custo e
 * margem, mais consumo de budget. Camada PURA (sem I/O): recebe as taxas já
 * resolvidas, as horas planejadas e as horas aprovadas, e projeta os totais.
 *
 * Reusa integralmente os helpers de `@/lib/billing/margin`
 * (computeAllocationMargin / computeProjectMargin) — a mesma matemática do
 * MarginPanel — para não duplicar a regra de margem.
 *
 * Fontes de verdade (documentadas para auditoria):
 * - PREVISTO: taxa de venda/custo por alocação × horas planejadas.
 *   Base das horas planejadas = `plannedBasis`:
 *     "BUDGET"  -> Project.budgetHours rateado pela % de cada alocação (soma do
 *                  budget do projeto), quando há budget e alocações ativas.
 *     "MONTHLY" -> capacidade mensal padrão (allocationPercent% × 160h), o mesmo
 *                  critério do MarginPanel, quando não há budget definido.
 * - REALIZADO: horas APROVADAS (equivalente hours×multiplier) × taxa vigente.
 *     Receita   -> só lançamentos billable aprovados × valor de venda.
 *     Custo     -> todos os lançamentos aprovados × custo/h (o consultor é pago
 *                  pelo equivalente, billable ou não).
 * - Complementares: faturamento fechado (RevenueClosing) e recebíveis previstos
 *   (ProjectReceivableSchedule) entram como visão de recebimento, sem alterar a
 *   margem realizada (que é medida por horas × taxa, base comum com o custo).
 */
import {
  computeAllocationMargin,
  computeProjectMargin,
  type ProjectMarginTotals,
} from "@/lib/billing/margin";

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export type PlannedBasis = "BUDGET" | "MONTHLY";

/** Alocação com taxas resolvidas + horas planejadas/aprovadas (entrada pura). */
export interface TrackingAllocationInput {
  allocationId: string;
  consultantName: string;
  role: string;
  allocationPercent: number;
  status: string;
  saleRate: number | null;
  costRate: number | null;
  /** Horas planejadas conforme `plannedBasis`; null quando não há plano. */
  plannedHours: number | null;
  /** Horas aprovadas billable (equivalente), base da receita realizada. */
  approvedBillableHours: number;
  /** Horas aprovadas totais (equivalente), base do custo realizado. */
  approvedTotalHours: number;
}

export interface ProjectTrackingInput {
  projectId: string;
  projectName: string;
  clientName: string;
  plannedBasis: PlannedBasis;
  budgetHours: number | null;
  allocations: TrackingAllocationInput[];
  /** Horas aprovadas sem vínculo de alocação (legado) — contam para o budget. */
  unallocatedApprovedHours: number;
  /** Faturamento fechado (soma de RevenueClosing não cancelados). */
  closingsBilled: number | null;
  closingsHours: number;
  closingsCount: number;
  receivablesForecast: number;
  receivablesReceived: number;
  /**
   * PONTO DE EXTENSÃO — Onda D (D2): remuneração pontual por projeto
   * (ConsultantAdHocPayment). Quando o modelo existir, somar aqui o custo dos
   * pagamentos pontuais REALIZADOS do projeto. Default 0 = sem efeito hoje.
   * (O previsto pontual, quando orçado, entraria em `plannedHours`/custo à parte
   * numa evolução — fora do escopo desta onda.)
   */
  additionalRealizedCost?: number;
}

export interface TrackingAllocationRow {
  allocationId: string;
  consultantName: string;
  role: string;
  allocationPercent: number;
  status: string;
  saleRate: number | null;
  costRate: number | null;
  plannedHours: number | null;
  approvedBillableHours: number;
  approvedTotalHours: number;
  plannedRevenue: number | null;
  plannedCost: number | null;
  plannedMargin: number | null;
  plannedMarginPct: number | null;
  realizedRevenue: number | null;
  realizedCost: number | null;
  realizedMargin: number | null;
  realizedMarginPct: number | null;
  hasCost: boolean;
}

export interface ProjectTracking {
  projectId: string;
  projectName: string;
  clientName: string;
  plannedBasis: PlannedBasis;
  budgetHours: number | null;
  approvedHoursTotal: number;
  budgetConsumptionPct: number | null;
  rows: TrackingAllocationRow[];
  planned: ProjectMarginTotals;
  realized: ProjectMarginTotals;
  hasUnallocatedApprovedHours: boolean;
  closingsBilled: number | null;
  closingsHours: number;
  closingsCount: number;
  receivablesForecast: number;
  receivablesReceived: number;
}

/** Margem/% a partir de receita e custo já resolvidos (mesma regra do margin.ts). */
function marginFrom(
  revenue: number | null,
  cost: number | null,
): { margin: number | null; marginPct: number | null } {
  if (revenue == null || cost == null) return { margin: null, marginPct: null };
  const margin = round2(revenue - cost);
  const marginPct = revenue > 0 ? round1((margin / revenue) * 100) : null;
  return { margin, marginPct };
}

export function computeProjectTracking(
  input: ProjectTrackingInput,
): ProjectTracking {
  const rows: TrackingAllocationRow[] = input.allocations.map((a) => {
    // PREVISTO: uma única base de horas (plannedHours) para venda e custo.
    const planned =
      a.plannedHours == null
        ? { revenue: null, cost: null, margin: null, marginPct: null }
        : computeAllocationMargin({
            hours: a.plannedHours,
            saleRate: a.saleRate,
            costRate: a.costRate,
          });
    // REALIZADO: bases de horas distintas (billable p/ receita, total p/ custo),
    // então resolvemos cada lado separadamente reusando computeAllocationMargin.
    const realizedRevenue = computeAllocationMargin({
      hours: a.approvedBillableHours,
      saleRate: a.saleRate,
      costRate: null,
    }).revenue;
    const realizedCost = computeAllocationMargin({
      hours: a.approvedTotalHours,
      saleRate: null,
      costRate: a.costRate,
    }).cost;
    const realized = marginFrom(realizedRevenue, realizedCost);
    return {
      allocationId: a.allocationId,
      consultantName: a.consultantName,
      role: a.role,
      allocationPercent: a.allocationPercent,
      status: a.status,
      saleRate: a.saleRate,
      costRate: a.costRate,
      plannedHours: a.plannedHours,
      approvedBillableHours: a.approvedBillableHours,
      approvedTotalHours: a.approvedTotalHours,
      plannedRevenue: planned.revenue,
      plannedCost: planned.cost,
      plannedMargin: planned.margin,
      plannedMarginPct: planned.marginPct,
      realizedRevenue,
      realizedCost,
      realizedMargin: realized.margin,
      realizedMarginPct: realized.marginPct,
      hasCost: a.costRate != null,
    };
  });

  // Totais PREVISTOS: só alocações COM plano (plannedHours != null), para não
  // marcar "custo incompleto" em quem simplesmente não tem plano.
  const planned = computeProjectMargin(
    rows
      .filter((r) => r.plannedHours != null)
      .map((r) => ({
        revenue: r.plannedRevenue,
        cost: r.plannedCost,
        margin: r.plannedMargin,
        marginPct: r.plannedMarginPct,
      })),
  );

  // Totais REALIZADOS: só alocações com horas aprovadas.
  const realizedBase = computeProjectMargin(
    rows
      .filter((r) => r.approvedTotalHours > 0 || r.approvedBillableHours > 0)
      .map((r) => ({
        revenue: r.realizedRevenue,
        cost: r.realizedCost,
        margin: r.realizedMargin,
        marginPct: r.realizedMarginPct,
      })),
  );

  // Aplica o ponto de extensão D2 (remuneração pontual) ao custo realizado.
  const adHoc = input.additionalRealizedCost ?? 0;
  const realizedCostTotal = round2(realizedBase.cost + adHoc);
  const realizedMarginTotal = round2(realizedBase.revenue - realizedCostTotal);
  const realized: ProjectMarginTotals = {
    revenue: realizedBase.revenue,
    cost: realizedCostTotal,
    margin: realizedMarginTotal,
    marginPct:
      realizedBase.revenue > 0
        ? round1((realizedMarginTotal / realizedBase.revenue) * 100)
        : null,
    // Horas aprovadas sem custo (alocação sem custo/h OU horas sem alocação)
    // deixam o custo realizado parcial.
    hasMissingCost:
      realizedBase.hasMissingCost || input.unallocatedApprovedHours > 0,
  };

  const approvedHoursTotal = round2(
    rows.reduce((sum, r) => sum + r.approvedTotalHours, 0) +
      input.unallocatedApprovedHours,
  );
  const budgetConsumptionPct =
    input.budgetHours != null && input.budgetHours > 0
      ? round1((approvedHoursTotal / input.budgetHours) * 100)
      : null;

  return {
    projectId: input.projectId,
    projectName: input.projectName,
    clientName: input.clientName,
    plannedBasis: input.plannedBasis,
    budgetHours: input.budgetHours,
    approvedHoursTotal,
    budgetConsumptionPct,
    rows,
    planned,
    realized,
    hasUnallocatedApprovedHours: input.unallocatedApprovedHours > 0,
    closingsBilled: input.closingsBilled,
    closingsHours: input.closingsHours,
    closingsCount: input.closingsCount,
    receivablesForecast: input.receivablesForecast,
    receivablesReceived: input.receivablesReceived,
  };
}
