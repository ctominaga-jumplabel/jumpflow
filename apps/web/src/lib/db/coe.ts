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
import { seniorityLabels } from "@/lib/consultants/labels";
import type { ConsultantSeniority } from "@/lib/consultants/schemas";
import type { SkillLevel } from "@/lib/competencies/types";
import type {
  AllocationProjectOption,
  AllocationSkillOption,
  RequiredSkillInput,
} from "@/lib/allocation-ai/types";
import { composeSquad } from "@/lib/coe/engine";
import { includeFinancialFactor } from "@/lib/coe/visibility";
import { MAX_SLOTS, type CoeCompositionQueryInput } from "@/lib/coe/schemas";
import type {
  CoeAvailabilityRow,
  CoeCandidateInput,
  CoeCandidateOption,
  CoeCompositionBundle,
  CoeMemberView,
  CoeSlotInput,
  CoeSlotsSource,
  CoeSquadStatus,
  CoeSquadView,
} from "@/lib/coe/types";
import { isDatabaseConfigured } from "./config";
import { buildCoeCompositionMock, buildCoeMembersMock } from "./coe.mock";

/**
 * Prisma reads for the COE — Centro Operacional de Excelência.
 *
 * O RBAC (quem lê) e o gate financeiro (`includeFinancial`) são aplicados AQUI —
 * o cliente nunca é fonte de verdade. A composição em si é um read-model
 * derivado calculado pela engine pura (`lib/coe/engine.ts`); este módulo apenas
 * busca/molda as linhas. Sem banco, degrada para dados de demonstração
 * claramente rotulados (`fromMock`).
 *
 * O que persiste é só a curadoria (`CoeMember`) e a proposta (`CoeSquad`); a
 * sugestão nunca é gravada como Allocation.
 */

/**
 * A migration do COE ainda nao foi aplicada neste banco.
 *
 * Existe porque o build do Railway roda `db:generate && build` — ele NAO aplica
 * migrations. Entao o codigo pode chegar em producao antes do schema, e as
 * tabelas do COE simplesmente nao existem ainda. Sem este tratamento a tela
 * quebrava com 500; com ele o modulo aparece vazio e DIZ o que falta.
 *
 * O recorte e estreito de proposito: so P2021 (tabela inexistente) e P2022
 * (coluna inexistente). Qualquer outro erro continua subindo — engolir falha de
 * banco de verdade transformaria um incidente em "lista vazia".
 */
function isCoeSchemaPending(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

/** Mensagem unica exibida enquanto o schema do COE nao existe. */
export const SCHEMA_PENDING_NOTICE =
  "O modulo COE esta no ar, mas a migracao do banco ainda nao foi aplicada. Rode `npm run db:deploy` (e `npm run db:seed`) para liberar a curadoria e a composicao.";

/**
 * Executa uma leitura do COE devolvendo `fallback` quando o schema ainda nao
 * existe. Registra em log para o estado nao passar silencioso em producao.
 */
async function readOrPending<T>(
  label: string,
  read: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (isCoeSchemaPending(error)) {
      console.warn(`[coe] schema ainda nao migrado (${label})`);
      return fallback;
    }
    throw error;
  }
}

function decimalToNumber(
  value: Prisma.Decimal | null | undefined,
): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/** Mapeia ConsultantStatus do banco para o subconjunto usado na engine. */
function mapStatus(status: string): CoeCandidateInput["status"] {
  if (status === "INACTIVE") return "INACTIVE";
  if (status === "ON_LEAVE") return "ON_LEAVE";
  return "ACTIVE";
}

function seniorityLabel(seniority: string): string {
  return seniorityLabels[seniority as ConsultantSeniority] ?? seniority;
}

// ── Opções para os seletores da UI ──────────────────────────────────────────

export async function listCoeProjectOptions(): Promise<
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

export async function listCoeSkillOptions(): Promise<AllocationSkillOption[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.skill.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, category: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, category: r.category }));
}

// ── Curadoria do núcleo ─────────────────────────────────────────────────────

/**
 * O núcleo completo (ativos e inativos), com as skills VALIDADAS de cada membro.
 * A tela separa por `active`; manter os inativos na lista é o que permite
 * reativar alguém sem recriar o registro.
 */
export async function listCoeMembers(): Promise<CoeMemberView[]> {
  if (!isDatabaseConfigured()) return buildCoeMembersMock();
  return readOrPending("listCoeMembers", () => readCoeMembers(), []);
}

async function readCoeMembers(): Promise<CoeMemberView[]> {
  const rows = await prisma.coeMember.findMany({
    select: {
      id: true,
      consultantId: true,
      focusArea: true,
      note: true,
      active: true,
      createdAt: true,
      addedBy: { select: { name: true } },
      consultant: {
        select: {
          name: true,
          seniority: true,
          area: true,
          jobTitle: true,
          status: true,
          skills: {
            where: { validationStatus: "VALIDATED" },
            select: {
              level: true,
              skill: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: [{ active: "desc" }, { consultant: { name: "asc" } }],
  });
  return rows.map((r) => ({
    id: r.id,
    consultantId: r.consultantId,
    consultantName: r.consultant.name,
    seniority: r.consultant.seniority,
    area: r.consultant.area,
    jobTitle: r.consultant.jobTitle,
    status: mapStatus(r.consultant.status),
    focusArea: r.focusArea,
    note: r.note,
    active: r.active,
    skills: r.consultant.skills.map((s) => ({
      skillId: s.skill.id,
      skillName: s.skill.name,
      level: s.level as SkillLevel,
    })),
    addedByName: r.addedBy?.name ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Consultores que podem ENTRAR no núcleo: os ativos que ainda não são membros
 * ativos. Quem já teve registro aparece marcado (`previouslyMember`) porque
 * entrar de novo reativa a linha existente em vez de criar outra.
 */
export async function listCoeCandidateOptions(): Promise<CoeCandidateOption[]> {
  if (!isDatabaseConfigured()) return [];
  return readOrPending(
    "listCoeCandidateOptions",
    () => readCoeCandidates(),
    [],
  );
}

async function readCoeCandidates(): Promise<CoeCandidateOption[]> {
  const rows = await prisma.consultant.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ coeMembership: null }, { coeMembership: { active: false } }],
    },
    select: {
      id: true,
      name: true,
      seniority: true,
      area: true,
      jobTitle: true,
      coeMembership: { select: { id: true } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    consultantId: r.id,
    consultantName: r.name,
    seniority: r.seniority,
    area: r.area,
    jobTitle: r.jobTitle,
    previouslyMember: r.coeMembership !== null,
  }));
}

// ── Resolução das frentes (slots) e das skills exigidas ─────────────────────

interface ResolvedTarget {
  slots: CoeSlotInput[];
  slotsSource: CoeSlotsSource;
  requiredSkills: RequiredSkillInput[];
  clientId: string | null;
  clientName: string | null;
  projectName: string | null;
  notice: string | null;
}

/** Nível mais alto entre vários (consolida a mesma skill em várias alocações). */
function highestLevel(
  a: SkillLevel | null,
  b: SkillLevel | null,
): SkillLevel | null {
  const order: SkillLevel[] = [
    "BASIC",
    "INTERMEDIATE",
    "ADVANCED",
    "SPECIALIST",
  ];
  if (a === null) return b;
  if (b === null) return a;
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

/**
 * Resolve as frentes a paralelizar e a exigência técnica.
 *
 * Frentes vêm dos `ProjectPlannedProfile` (a demanda orçada do CRM: cargo +
 * senioridade + quantidade), expandidos por quantidade. Quando o projeto não tem
 * perfis planejados, caem para frentes genéricas informadas na tela — e o bundle
 * diz isso em `notice`, sem fingir que a demanda veio do CRM.
 *
 * As skills exigidas são as do PROJETO (união das `AllocationSkill`) mais as
 * informadas manualmente: o schema não liga skill a perfil planejado, então
 * todos os slots compartilham a exigência técnica e a senioridade é o que os
 * diferencia. Documentado em docs/coe-centro-operacional-excelencia.md.
 */
async function resolveTarget(
  query: CoeCompositionQueryInput,
  includeFinancial: boolean,
): Promise<ResolvedTarget> {
  const bySkill = new Map<string, RequiredSkillInput>();
  let clientId: string | null = null;
  let clientName: string | null = null;
  let projectName: string | null = null;
  let saleRate: number | null = null;
  let plannedProfiles: {
    id: string;
    roleName: string;
    seniority: string;
    quantity: number;
  }[] = [];

  if (query.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: query.projectId },
      select: {
        name: true,
        clientId: true,
        client: { select: { name: true } },
        plannedProfiles: {
          select: { id: true, roleName: true, seniority: true, quantity: true },
          orderBy: [{ seniority: "asc" }, { roleName: "asc" }],
        },
        allocations: {
          select: {
            allocationSkills: {
              select: {
                level: true,
                skill: { select: { id: true, name: true } },
              },
            },
            // Valor de venda: só buscado para papéis financeiros.
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
      plannedProfiles = project.plannedProfiles;
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
        saleRate = rates.reduce((a, b) => a + b, 0) / rates.length;
      }
    }
  }

  // Skills adicionais informadas na tela.
  if (query.skills.length > 0) {
    const skills = await prisma.skill.findMany({
      where: { id: { in: query.skills } },
      select: { id: true, name: true },
    });
    for (const s of skills) {
      if (!bySkill.has(s.id)) {
        bySkill.set(s.id, {
          skillId: s.id,
          skillName: s.name,
          requiredLevel: null,
        });
      }
    }
  }

  const requiredSkills = [...bySkill.values()];

  // Frentes a partir dos perfis planejados, expandidas por quantidade.
  const slots: CoeSlotInput[] = [];
  for (const profile of plannedProfiles) {
    const quantity = Math.max(1, profile.quantity);
    for (let i = 0; i < quantity && slots.length < MAX_SLOTS; i += 1) {
      slots.push({
        key: `profile:${profile.id}#${i}`,
        label: `${profile.roleName} · ${seniorityLabel(profile.seniority)}`,
        roleName: profile.roleName,
        seniority: profile.seniority,
        requiredSkills,
        saleRate,
        sourceProfileId: profile.id,
      });
    }
  }

  if (slots.length > 0) {
    const demanded = plannedProfiles.reduce(
      (acc, p) => acc + Math.max(1, p.quantity),
      0,
    );
    return {
      slots,
      slotsSource: "PLANNED_PROFILES",
      requiredSkills,
      clientId,
      clientName,
      projectName,
      notice:
        demanded > MAX_SLOTS
          ? `O projeto tem ${demanded} posições planejadas; a composição mostra as primeiras ${MAX_SLOTS}.`
          : null,
    };
  }

  // Sem projeto selecionado não há o que compor.
  if (!query.projectId) {
    return {
      slots: [],
      slotsSource: "NONE",
      requiredSkills,
      clientId,
      clientName,
      projectName,
      notice: null,
    };
  }

  // Projeto informado que NÃO existe (ou saiu do escopo). Sem este ramo, o
  // fluxo caía no fallback de frentes genéricas e avisava "este projeto não tem
  // perfis planejados" — uma mensagem falsa sobre um projeto que não existe.
  if (projectName === null) {
    return {
      slots: [],
      slotsSource: "NONE",
      requiredSkills,
      clientId,
      clientName,
      projectName,
      notice:
        "Projeto não encontrado. Selecione um projeto da lista para compor o time.",
    };
  }

  // Fallback honesto: frentes genéricas, sem senioridade exigida.
  const manual = Math.min(MAX_SLOTS, Math.max(1, query.manualSlots));
  for (let i = 0; i < manual; i += 1) {
    slots.push({
      key: `manual#${i}`,
      label: `Frente ${i + 1}`,
      roleName: `Frente ${i + 1}`,
      seniority: null,
      requiredSkills,
      saleRate,
      sourceProfileId: null,
    });
  }
  return {
    slots,
    slotsSource: "MANUAL",
    requiredSkills,
    clientId,
    clientName,
    projectName,
    notice:
      "Este projeto não tem perfis planejados vindos do CRM. As frentes abaixo são genéricas e não exigem senioridade — ajuste a quantidade conforme a paralelização pretendida.",
  };
}

// ── Read principal: composição ──────────────────────────────────────────────

/**
 * Monta a composição do time para o projeto-alvo, aplicando RBAC no servidor.
 *
 * Diferença deliberada frente à IA de Alocação: aqui a janela de disponibilidade
 * SEMPRE existe (sem `periodStart` usamos a semana corrente), porque capacidade
 * agregada é entregável desta tela — e capacidade não medida não pode virar
 * capacidade presumida. A janela usada aparece no bundle (`periods`).
 */
export async function getCoeComposition(
  user: AppUser,
  query: CoeCompositionQueryInput,
): Promise<CoeCompositionBundle> {
  const includeFinancial = includeFinancialFactor(user.roles);

  if (!isDatabaseConfigured()) {
    return buildCoeCompositionMock(query, includeFinancial);
  }

  return readOrPending(
    "getCoeComposition",
    () => readCoeComposition(query, includeFinancial),
    emptyCompositionBundle(query, includeFinancial, SCHEMA_PENDING_NOTICE),
  );
}

/** Bundle vazio, usado sem frentes e enquanto o schema nao existe. */
function emptyCompositionBundle(
  query: CoeCompositionQueryInput,
  includeFinancial: boolean,
  notice: string | null,
): CoeCompositionBundle {
  return {
    projectId: null,
    projectName: null,
    clientName: null,
    slotsSource: "NONE",
    composition: { assignments: [], unfilled: 0 },
    periods: [],
    availabilityRows: [],
    requiredSkills: [],
    financialIncluded: includeFinancial,
    scope: query.scope,
    candidatePoolSize: 0,
    coePoolSize: 0,
    notice,
    fromMock: false,
  };
}

async function readCoeComposition(
  query: CoeCompositionQueryInput,
  includeFinancial: boolean,
): Promise<CoeCompositionBundle> {
  const target = await resolveTarget(query, includeFinancial);

  const periodStart = query.periodStart
    ? new Date(`${query.periodStart}T00:00:00.000Z`)
    : new Date(`${toIsoDate(new Date())}T00:00:00.000Z`);
  const periods = buildWeeklyPeriods(periodStart, query.weeks);

  // `projectId` do bundle é o projeto que REALMENTE resolveu, não o que veio na
  // query: com um id inexistente `resolveTarget` cai no fallback manual, e
  // ecoar o id faria a tela habilitar "Salvar proposta" para um projeto que não
  // existe — só para falhar com NOT_FOUND no servidor.
  const resolvedProjectId =
    target.projectName === null ? null : (query.projectId ?? null);

  // Sem frentes não há o que compor — e este é o estado PADRÃO da tela (nenhum
  // projeto selecionado). Sair aqui evita carregar o quadro inteiro com skills,
  // ausências e alocações só para devolver `assignments: []`.
  if (target.slots.length === 0) {
    return {
      projectId: resolvedProjectId,
      projectName: target.projectName,
      clientName: target.clientName,
      slotsSource: target.slotsSource,
      composition: { assignments: [], unfilled: 0 },
      periods,
      availabilityRows: [],
      requiredSkills: target.requiredSkills,
      financialIncluded: includeFinancial,
      scope: query.scope,
      candidatePoolSize: 0,
      coePoolSize: await prisma.coeMember.count({
        where: {
          active: true,
          consultant: { status: { in: ["ACTIVE", "ON_LEAVE"] } },
        },
      }),
      notice: target.notice,
      fromMock: false,
    };
  }

  const windowStart = new Date(`${periods[0]!.start}T00:00:00.000Z`);
  const windowEnd = new Date(
    `${periods[periods.length - 1]!.end}T00:00:00.000Z`,
  );

  // Universo de candidatos. `scope=COE` restringe ao núcleo ATIVO — é o
  // propósito da tela; `scope=ALL` amplia quando o núcleo não cobre a conta.
  // A troca de escopo não dá bônus a ninguém, só muda quem entra na conta.
  const consultants = await prisma.consultant.findMany({
    where: {
      status: { in: ["ACTIVE", "ON_LEAVE"] },
      ...(query.scope === "COE"
        ? { coeMembership: { is: { active: true } } }
        : {}),
    },
    select: {
      id: true,
      name: true,
      seniority: true,
      area: true,
      jobTitle: true,
      status: true,
      coeMembership: { select: { active: true, focusArea: true } },
      skills: {
        where: { validationStatus: "VALIDATED" },
        select: { skillId: true, level: true },
      },
      // Ausências e alocações são recortadas pela JANELA: sem isso o payload
      // cresce com todo o histórico do consultor, indefinidamente.
      timeOffs: {
        where: {
          status: { in: ["PLANNED", "CONFIRMED"] },
          startDate: { lte: windowEnd },
          endDate: { gte: windowStart },
        },
        select: { kind: true, startDate: true, endDate: true },
      },
      allocations: {
        // O recorte cobre os DOIS usos: disponibilidade na janela e histórico
        // com o cliente do projeto-alvo (que ignora datas, por isso o OR).
        where: target.clientId
          ? {
              OR: [
                { startDate: { lte: windowEnd }, endDate: null },
                {
                  startDate: { lte: windowEnd },
                  endDate: { gte: windowStart },
                },
                { project: { clientId: target.clientId } },
              ],
            }
          : {
              OR: [
                { startDate: { lte: windowEnd }, endDate: null },
                {
                  startDate: { lte: windowEnd },
                  endDate: { gte: windowStart },
                },
              ],
            },
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

  // Conta só o núcleo REALMENTE disponível: um membro ativo cujo consultor foi
  // desligado não é candidato (a engine descarta INACTIVE). Sem o recorte, o
  // aviso "o núcleo está vazio" deixava de aparecer justamente quando o núcleo
  // inteiro tinha saído da empresa.
  const coePoolSize = await prisma.coeMember.count({
    where: {
      active: true,
      consultant: { status: { in: ["ACTIVE", "ON_LEAVE"] } },
    },
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
      absences: c.timeOffs.map((t) => ({
        kind: t.kind,
        start: toIsoDate(t.startDate),
        end: toIsoDate(t.endDate),
      })),
    }),
  );
  const availabilityMap = buildAvailabilityMap(availabilityInputs, periods);
  const rowByConsultant = new Map(
    availabilityMap.rows.map((r) => [r.consultantId, r]),
  );
  const firstPeriodKey = periods[0]?.key;
  const stateByConsultant = new Map<string, AvailabilityState>();
  for (const row of availabilityMap.rows) {
    const cell = firstPeriodKey
      ? row.cells.find((c) => c.periodKey === firstPeriodKey)
      : row.cells[0];
    if (cell) stateByConsultant.set(row.consultantId, cell.state);
  }

  const candidates: CoeCandidateInput[] = consultants.map((c) => {
    const pastAllocationsWithClient =
      target.clientId === null
        ? 0
        : c.allocations.filter((a) => a.project.clientId === target.clientId)
            .length;
    let hourlyCost: number | null = null;
    if (includeFinancial) {
      for (const a of c.allocations) {
        if ("costRates" in a && a.costRates) {
          const cost = decimalToNumber(a.costRates[0]?.hourlyCost ?? null);
          if (cost !== null) {
            hourlyCost =
              hourlyCost === null ? cost : Math.min(hourlyCost, cost);
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
      skills: c.skills.map((s) => ({
        skillId: s.skillId,
        level: s.level as SkillLevel,
      })),
      availabilityState: stateByConsultant.get(c.id) ?? null,
      pastAllocationsWithClient,
      hourlyCost,
      status: mapStatus(c.status),
      isCoeMember: c.coeMembership?.active === true,
      coeFocusArea: c.coeMembership?.focusArea ?? null,
    };
  });

  const composition = composeSquad(target.slots, candidates, includeFinancial);

  // Só devolvemos disponibilidade de quem aparece na composição (atribuídos +
  // alternativas). Mantém o payload proporcional às frentes, não ao quadro.
  const shownIds = new Set<string>();
  for (const assignment of composition.assignments) {
    if (assignment.assigned) shownIds.add(assignment.assigned.consultantId);
    for (const alt of assignment.alternatives) shownIds.add(alt.consultantId);
  }
  const availabilityRows: CoeAvailabilityRow[] = [...shownIds]
    .map((id) => rowByConsultant.get(id))
    .filter((row): row is NonNullable<typeof row> => row !== undefined)
    .map((row) => ({
      consultantId: row.consultantId,
      cells: row.cells.map((cell) => ({
        periodKey: cell.periodKey,
        state: cell.state,
        allocationPercent: cell.allocationPercent,
      })),
    }));

  return {
    projectId: resolvedProjectId,
    projectName: target.projectName,
    clientName: target.clientName,
    slotsSource: target.slotsSource,
    composition,
    periods,
    availabilityRows,
    requiredSkills: target.requiredSkills,
    financialIncluded: includeFinancial,
    scope: query.scope,
    candidatePoolSize: candidates.length,
    coePoolSize,
    notice: target.notice,
    fromMock: false,
  };
}

// ── Propostas salvas ────────────────────────────────────────────────────────

/** As propostas de time, mais recentes primeiro. Arquivadas incluídas. */
export async function listCoeSquads(): Promise<CoeSquadView[]> {
  if (!isDatabaseConfigured()) return [];
  return readOrPending("listCoeSquads", () => readCoeSquads(), []);
}

async function readCoeSquads(): Promise<CoeSquadView[]> {
  const rows = await prisma.coeSquad.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      projectId: true,
      periodStart: true,
      weeks: true,
      note: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      project: { select: { name: true, client: { select: { name: true } } } },
      members: {
        select: {
          consultantId: true,
          slotKey: true,
          slotLabel: true,
          slotScore: true,
          consultant: { select: { name: true } },
        },
        orderBy: { slotKey: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status as CoeSquadStatus,
    projectId: r.projectId,
    projectName: r.project.name,
    clientName: r.project.client.name,
    periodStart: r.periodStart ? toIsoDate(r.periodStart) : null,
    weeks: r.weeks,
    note: r.note,
    members: r.members.map((m) => ({
      consultantId: m.consultantId,
      consultantName: m.consultant.name,
      slotKey: m.slotKey,
      slotLabel: m.slotLabel,
      slotScore: m.slotScore,
    })),
    createdByName: r.createdBy?.name ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}
