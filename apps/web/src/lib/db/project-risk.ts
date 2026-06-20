import { Prisma, prisma } from "@jumpflow/database";
import type { AppUser } from "@/lib/auth/types";
import { resolveDbUser } from "@/lib/db/users";
import { computeProjectRisks } from "@/lib/project-risk/engine";
import {
  includeFinancialSignal,
  resolveProjectRiskScope,
  type ProjectRiskScope,
} from "@/lib/project-risk/visibility";
import type { RiskProjectInput, RiskResult } from "@/lib/project-risk/types";
import type { ProjectRiskQueryInput } from "@/lib/project-risk/schemas";
import { isDatabaseConfigured } from "./config";
import { buildProjectRiskMock } from "./project-risk.mock";

/**
 * Prisma reads for the IA de Risco de Projeto (§8.3). RBAC scope (quais projetos)
 * e o gate financeiro (includeFinancial) são aplicados AQUI — nunca confie no
 * cliente. O cálculo puro vive em lib/project-risk/engine.ts; este módulo só
 * busca/molda rows e degrada para um mock quando o DB não está configurado
 * (docs/p3-inteligencia-design.md §5/§6). Sem novo schema — tudo é derivado sob
 * demanda dos dados existentes.
 */

/** Janela (dias) para considerar um feedback CONCERN como "recente". */
export const RECENT_FEEDBACK_WINDOW_DAYS = 90;

function decimalToNumber(value: Prisma.Decimal | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * O Prisma infere os campos financeiros condicionais como `false | rows[]`.
 * Esta função estreita para um array tipado quando presente (e `[]` quando o
 * campo não foi selecionado), evitando `any` no agregador.
 */
function extractRateRows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export interface ProjectRiskResultBundle {
  /** Risco por projeto, ordenado por gravidade (pode estar vazio). */
  results: RiskResult[];
  /** true quando o sinal de margem entrou (requisitante FINANCIAL_ROLES). */
  financialIncluded: boolean;
  /** Projeto selecionado para o detalhe, quando há. */
  selectedProjectId: string | null;
  /** true quando o resultado veio do mock (DB indisponível). */
  fromMock: boolean;
}

/** Traduz o escopo de RBAC em um `where` de Project. `null` = sem universo. */
function projectWhereForScope(
  scope: ProjectRiskScope,
): Prisma.ProjectWhereInput | null {
  // Projetos encerrados não entram na avaliação de risco operacional ativo
  // (CLOSED é tratado pela engine como sem risco de prazo, mas mantê-los fora da
  // lista reduz ruído; o detalhe por id ainda pode incluí-los explicitamente).
  const base: Prisma.ProjectWhereInput = {
    status: { in: ["PROPOSAL", "ACTIVE", "PAUSED"] },
  };
  if (scope.kind === "broad") return base;
  if (scope.kind === "manager") {
    return { ...base, managerUserId: scope.managerUserId };
  }
  return null;
}

interface ResolvedScope {
  scope: ProjectRiskScope;
}

async function resolveScope(user: AppUser): Promise<ResolvedScope> {
  const broadOrFinance = user.roles.some((r) =>
    ["ADMIN", "AREA_MANAGER", "FINANCE"].includes(r),
  );
  if (broadOrFinance) {
    return { scope: resolveProjectRiskScope({ roles: user.roles, userId: null }) };
  }
  const dbUser = await resolveDbUser(user);
  return {
    scope: resolveProjectRiskScope({
      roles: user.roles,
      userId: dbUser?.id ?? null,
    }),
  };
}

/**
 * Computa o risco dos projetos no escopo do requisitante, aplicando RBAC e o gate
 * financeiro no servidor. Degradação graciosa: sem DB → mock (mesma engine).
 */
export async function getProjectRisks(
  user: AppUser,
  query: ProjectRiskQueryInput,
): Promise<ProjectRiskResultBundle> {
  const includeFinancial = includeFinancialSignal(user.roles);
  const selectedProjectId = query.projectId ?? null;

  if (!isDatabaseConfigured()) {
    return buildProjectRiskMock(includeFinancial, selectedProjectId);
  }

  const { scope } = await resolveScope(user);
  const where = projectWhereForScope(scope);
  if (where === null) {
    return {
      results: [],
      financialIncluded: includeFinancial,
      selectedProjectId,
      fromMock: false,
    };
  }

  // Detalhe por projeto: restringe ao id pedido (ainda dentro do escopo).
  const effectiveWhere: Prisma.ProjectWhereInput = selectedProjectId
    ? { AND: [where, { id: selectedProjectId }] }
    : where;

  const recentCutoff = new Date(
    Date.now() - RECENT_FEEDBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const projects = await prisma.project.findMany({
    where: effectiveWhere,
    select: {
      id: true,
      name: true,
      status: true,
      budgetHours: true,
      startDate: true,
      endDate: true,
      client: { select: { name: true } },
      // Feedbacks CONCERN recentes ancorados ao projeto (relatedProjectId).
      feedbacks: {
        where: { type: "CONCERN", createdAt: { gte: recentCutoff } },
        select: { id: true },
      },
      // Horas aprovadas agregadas via groupBy abaixo (mais barato que carregar
      // todas as linhas). Aqui só trazemos o que a margem precisa, quando aplicável.
      saleRates: includeFinancial
        ? { orderBy: { startsAt: "desc" }, select: { hourlyRate: true } }
        : false,
      allocations: includeFinancial
        ? {
            select: {
              costRates: {
                orderBy: { startsAt: "desc" },
                take: 1,
                select: { hourlyCost: true },
              },
            },
          }
        : false,
    },
    orderBy: { name: "asc" },
  });

  if (projects.length === 0) {
    return {
      results: [],
      financialIncluded: includeFinancial,
      selectedProjectId,
      fromMock: false,
    };
  }

  // Horas APROVADAS por projeto (agregação no banco).
  const projectIds = projects.map((p) => p.id);
  const approvedByProject = await prisma.timeEntry.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projectIds }, status: "APPROVED" },
    _sum: { hours: true },
  });
  const approvedHoursById = new Map<string, number>();
  for (const row of approvedByProject) {
    approvedHoursById.set(row.projectId, decimalToNumber(row._sum.hours) ?? 0);
  }

  const inputs: RiskProjectInput[] = projects.map((p) => {
    const approvedHours = approvedHoursById.get(p.id) ?? 0;
    const budgetHours = decimalToNumber(p.budgetHours);

    let estimatedCost: number | null = null;
    let estimatedRevenue: number | null = null;
    if (includeFinancial) {
      // Os campos financeiros só são selecionados para FINANCIAL_ROLES; a
      // inferência condicional do Prisma os deixa como `false | rows[]`, então
      // moldamos com tipos explícitos (sem `any`) antes de agregar.
      const saleRows = extractRateRows<{ hourlyRate: Prisma.Decimal }>(
        (p as Record<string, unknown>).saleRates,
      );
      const avgSale = avg(
        saleRows
          .map((s) => decimalToNumber(s.hourlyRate))
          .filter((v): v is number => v !== null),
      );
      // Custo hora de referência: média do custo mais recente por alocação.
      const allocRows = extractRateRows<{
        costRates: { hourlyCost: Prisma.Decimal }[];
      }>((p as Record<string, unknown>).allocations);
      const avgCost = avg(
        allocRows
          .map((a) => decimalToNumber(a.costRates[0]?.hourlyCost ?? null))
          .filter((v): v is number => v !== null),
      );
      // Receita/custo estimados sobre as horas já aprovadas (proxy de realização).
      if (avgSale !== null) estimatedRevenue = avgSale * approvedHours;
      if (avgCost !== null) estimatedCost = avgCost * approvedHours;
    }

    return {
      projectId: p.id,
      projectName: p.name,
      clientName: p.client?.name ?? null,
      status: p.status as RiskProjectInput["status"],
      budgetHours,
      approvedHours,
      startDate: p.startDate,
      endDate: p.endDate ?? null,
      estimatedCost,
      estimatedRevenue,
      recentConcernFeedbacks: p.feedbacks.length,
    };
  });

  const results = computeProjectRisks(inputs, includeFinancial);

  return {
    results,
    financialIncluded: includeFinancial,
    selectedProjectId,
    fromMock: false,
  };
}
