import { Prisma, prisma } from "@jumpflow/database";
import type { AppUser } from "@/lib/auth/types";
import {
  buildAvailabilityMap,
  buildWeeklyPeriods,
} from "@/lib/availability/map";
import type {
  AvailabilityConsultantInput,
  AvailabilityState,
} from "@/lib/availability/types";
import { toIsoDate } from "@/lib/timesheet/week";
import { rankCandidates } from "@/lib/allocation-ai/engine";
import { includeFinancialFactor } from "@/lib/allocation-ai/visibility";
import type {
  AllocationProjectOption,
  AllocationSkillOption,
  CandidateSkillInput,
  FitCandidateInput,
  FitResult,
  FitTargetInput,
  RequiredSkillInput,
} from "@/lib/allocation-ai/types";
import type { SkillLevel } from "@/lib/competencies/types";
import type { AllocationFitQueryInput } from "@/lib/allocation-ai/schemas";
import { isDatabaseConfigured } from "./config";
import { buildAllocationFitMock } from "./allocation-ai.mock";

/**
 * Prisma reads for the IA de Alocação (§8.2). RBAC scope (which candidates) and
 * the financial gate (includeFinancial) are applied HERE — never trust the
 * client. The pure ranking lives in lib/allocation-ai/engine.ts; this module only
 * fetches/shapes rows and degrades to a mock when the DB is not configured
 * (docs/p3-inteligencia-design.md §5/§6). No new schema — everything is derived
 * on demand from existing data.
 */

function decimalToNumber(value: Prisma.Decimal | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/** Mapeia ConsultantStatus do banco para o subconjunto usado na engine. */
function mapStatus(status: string): FitCandidateInput["status"] {
  if (status === "INACTIVE") return "INACTIVE";
  if (status === "ON_LEAVE") return "ON_LEAVE";
  return "ACTIVE";
}

export interface AllocationFitResultBundle {
  /** Ranking ordenado (pode estar vazio). */
  results: FitResult[];
  /** Skills exigidas resolvidas (projeto + manuais), para a UI. */
  requiredSkills: RequiredSkillInput[];
  /** Nome do cliente do projeto-alvo, quando há projeto. */
  clientName: string | null;
  /** Nome do projeto-alvo, quando há projeto. */
  projectName: string | null;
  /** true quando o fator financeiro entrou (requisitante FINANCIAL_ROLES). */
  financialIncluded: boolean;
  /** Janela de disponibilidade considerada (rótulo curto), ou null. */
  periodLabel: string | null;
  /** true quando o resultado veio do mock (DB indisponível). */
  fromMock: boolean;
}

// ── Opções para os seletores da UI ──────────────────────────────────────────

export async function listAllocationProjectOptions(): Promise<
  AllocationProjectOption[]
> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.project.findMany({
    where: { status: { in: ["PROPOSAL", "ACTIVE", "PAUSED"] } },
    select: {
      id: true,
      name: true,
      clientId: true,
      client: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    clientId: r.clientId,
    clientName: r.client.name,
  }));
}

export async function listAllocationSkillOptions(): Promise<
  AllocationSkillOption[]
> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.skill.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, category: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, category: r.category }));
}

// ── Resolução de skills requeridas do projeto ───────────────────────────────

interface ResolvedTargetMeta {
  requiredSkills: RequiredSkillInput[];
  clientId: string | null;
  clientName: string | null;
  projectName: string | null;
  saleRate: number | null;
}

/** Nível mais alto entre vários (para consolidar a mesma skill em alocações). */
function highestLevel(
  a: SkillLevel | null,
  b: SkillLevel | null,
): SkillLevel | null {
  const order: SkillLevel[] = ["BASIC", "INTERMEDIATE", "ADVANCED", "SPECIALIST"];
  if (a === null) return b;
  if (b === null) return a;
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

/**
 * Resolve as skills exigidas e os metadados do alvo: do projeto (skills das suas
 * AllocationSkill + cliente + valor de venda) e/ou das skills informadas
 * manualmente. Quando ambos, a união é feita por skillId pegando o maior nível.
 */
async function resolveTargetMeta(
  query: AllocationFitQueryInput,
  includeFinancial: boolean,
): Promise<ResolvedTargetMeta> {
  const bySkill = new Map<string, RequiredSkillInput>();
  let clientId: string | null = null;
  let clientName: string | null = null;
  let projectName: string | null = null;
  let saleRate: number | null = null;

  if (query.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: query.projectId },
      select: {
        name: true,
        clientId: true,
        client: { select: { name: true } },
        allocations: {
          select: {
            allocationSkills: {
              select: {
                level: true,
                skill: { select: { id: true, name: true } },
              },
            },
            // Valor de venda da alocação (só buscado para financial roles).
            saleRates: includeFinancial
              ? {
                  orderBy: { startsAt: "desc" },
                  take: 1,
                  select: { hourlyRate: true },
                }
              : false,
          },
        },
      },
    });
    if (project) {
      projectName = project.name;
      clientId = project.clientId;
      clientName = project.client.name;
      const rates: number[] = [];
      for (const alloc of project.allocations) {
        for (const as of alloc.allocationSkills) {
          const existing = bySkill.get(as.skill.id);
          bySkill.set(as.skill.id, {
            skillId: as.skill.id,
            skillName: as.skill.name,
            requiredLevel: highestLevel(
              existing?.requiredLevel ?? null,
              (as.level as SkillLevel | null) ?? null,
            ),
          });
        }
        if (includeFinancial && "saleRates" in alloc && alloc.saleRates) {
          const rate = decimalToNumber(alloc.saleRates[0]?.hourlyRate ?? null);
          if (rate !== null) rates.push(rate);
        }
      }
      if (rates.length > 0) {
        // Média dos valores de venda das alocações como referência do projeto.
        saleRate = rates.reduce((a, b) => a + b, 0) / rates.length;
      }
    }
  }

  if (query.skills.length > 0) {
    const ids = query.skills.map((s) => s.skillId);
    const skills = await prisma.skill.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const nameById = new Map(skills.map((s) => [s.id, s.name]));
    for (const s of query.skills) {
      const name = nameById.get(s.skillId);
      if (!name) continue; // skill inexistente: ignora silenciosamente
      const existing = bySkill.get(s.skillId);
      bySkill.set(s.skillId, {
        skillId: s.skillId,
        skillName: name,
        requiredLevel: highestLevel(
          existing?.requiredLevel ?? null,
          (s.requiredLevel as SkillLevel | null) ?? null,
        ),
      });
    }
  }

  return {
    requiredSkills: [...bySkill.values()],
    clientId,
    clientName,
    projectName,
    saleRate,
  };
}

// ── Disponibilidade no período-alvo (reusa o read-model de availability) ────

/**
 * Estado de disponibilidade por consultor no primeiro período da janela
 * (o período-alvo da alocação). null quando não há período informado.
 */
function buildAvailabilityStateByConsultant(
  consultants: AvailabilityConsultantInput[],
  periodStart: Date | null,
  weeks: number,
): Map<string, AvailabilityState> {
  const map = new Map<string, AvailabilityState>();
  if (!periodStart) return map;
  const periods = buildWeeklyPeriods(periodStart, weeks);
  const availability = buildAvailabilityMap(consultants, periods);
  const targetKey = periods[0]?.key;
  for (const row of availability.rows) {
    const cell = targetKey
      ? row.cells.find((c) => c.periodKey === targetKey)
      : row.cells[0];
    if (cell) map.set(row.consultantId, cell.state);
  }
  return map;
}

// ── Read principal ──────────────────────────────────────────────────────────

/**
 * Computa o ranking de candidatos para o alvo informado, aplicando RBAC
 * (includeFinancial) no servidor. Degradação graciosa: sem DB → mock.
 */
export async function getAllocationFit(
  user: AppUser,
  query: AllocationFitQueryInput,
): Promise<AllocationFitResultBundle> {
  const includeFinancial = includeFinancialFactor(user.roles);

  if (!isDatabaseConfigured()) {
    return buildAllocationFitMock(query, includeFinancial);
  }

  const meta = await resolveTargetMeta(query, includeFinancial);
  const periodStart = query.periodStart
    ? new Date(`${query.periodStart}T00:00:00.000Z`)
    : null;
  const weeks = query.weeks;

  // Universo de candidatos: consultores ativos/afastados (inativos são
  // descartados pela engine). Trazemos skills validadas, alocações (para
  // disponibilidade + histórico com cliente) e, só para financial, o custo hora.
  const consultants = await prisma.consultant.findMany({
    where: { status: { in: ["ACTIVE", "ON_LEAVE"] } },
    select: {
      id: true,
      name: true,
      seniority: true,
      area: true,
      jobTitle: true,
      status: true,
      skills: {
        where: { validationStatus: "VALIDATED" },
        select: { skillId: true, level: true },
      },
      allocations: {
        select: {
          status: true,
          allocationPercent: true,
          startDate: true,
          endDate: true,
          project: { select: { clientId: true } },
          costRates: includeFinancial
            ? {
                orderBy: { startsAt: "desc" },
                take: 1,
                select: { hourlyCost: true },
              }
            : false,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  // Read-model de disponibilidade: só alocações ACTIVE contam como capacidade.
  const availabilityInputs: AvailabilityConsultantInput[] = consultants.map(
    (c) => ({
      id: c.id,
      name: c.name,
      seniority: c.seniority,
      area: c.area,
      jobTitle: c.jobTitle,
      status: mapStatus(c.status),
      allocations: c.allocations
        .filter((a) => a.status === "ACTIVE")
        .map((a) => ({
          allocationPercent: a.allocationPercent,
          startDate: toIsoDate(a.startDate),
          endDate: a.endDate ? toIsoDate(a.endDate) : null,
        })),
      absences: [],
    }),
  );
  const stateByConsultant = buildAvailabilityStateByConsultant(
    availabilityInputs,
    periodStart,
    weeks,
  );

  const candidates: FitCandidateInput[] = consultants.map((c) => {
    const skills: CandidateSkillInput[] = c.skills.map((s) => ({
      skillId: s.skillId,
      level: s.level as SkillLevel,
    }));
    // Histórico com o cliente: alocações (qualquer status) em projetos do cliente.
    const pastAllocationsWithClient =
      meta.clientId === null
        ? 0
        : c.allocations.filter((a) => a.project.clientId === meta.clientId)
            .length;
    // Custo hora: o mais recente entre as alocações (só para financial roles).
    let hourlyCost: number | null = null;
    if (includeFinancial) {
      for (const a of c.allocations) {
        if ("costRates" in a && a.costRates) {
          const cost = decimalToNumber(a.costRates[0]?.hourlyCost ?? null);
          if (cost !== null) {
            hourlyCost = hourlyCost === null ? cost : Math.min(hourlyCost, cost);
          }
        }
      }
    }
    return {
      consultantId: c.id,
      consultantName: c.name,
      seniority: c.seniority,
      area: c.area,
      jobTitle: c.jobTitle,
      skills,
      availabilityState: periodStart
        ? stateByConsultant.get(c.id) ?? null
        : null,
      pastAllocationsWithClient,
      hourlyCost,
      status: mapStatus(c.status),
    };
  });

  const target: FitTargetInput = {
    requiredSkills: meta.requiredSkills,
    saleRate: meta.saleRate,
  };
  const results = rankCandidates(target, candidates, includeFinancial);

  const periodLabel = periodStart
    ? buildWeeklyPeriods(periodStart, weeks)[0]?.shortLabel ?? null
    : null;

  return {
    results,
    requiredSkills: meta.requiredSkills,
    clientName: meta.clientName,
    projectName: meta.projectName,
    financialIncluded: includeFinancial,
    periodLabel,
    fromMock: false,
  };
}
