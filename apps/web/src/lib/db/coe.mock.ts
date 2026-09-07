import { buildWeeklyPeriods } from "@/lib/availability/map";
import { toIsoDate } from "@/lib/timesheet/week";
import { composeSquad } from "@/lib/coe/engine";
import type { CoeCompositionQueryInput } from "@/lib/coe/schemas";
import type {
  CoeAvailabilityRow,
  CoeCandidateInput,
  CoeCompositionBundle,
  CoeMemberView,
  CoeSlotInput,
} from "@/lib/coe/types";
import type { RequiredSkillInput } from "@/lib/allocation-ai/types";

/**
 * Dados de demonstração do COE para quando o banco não está configurado.
 *
 * Roda a MESMA engine pura sobre um núcleo sintético, para a tela demonstrar a
 * composição, a cobertura agregada e a capacidade sem DB. Honesto: o bundle
 * marca `fromMock: true` e a UI rotula os dados como exemplo. Espelha a
 * degradação graciosa já adotada pela IA de Alocação e pelo Mapa de
 * Disponibilidade.
 */

const MOCK_SKILLS: RequiredSkillInput[] = [
  {
    skillId: "mock-skill-react",
    skillName: "React",
    requiredLevel: "ADVANCED",
  },
  {
    skillId: "mock-skill-node",
    skillName: "Node.js",
    requiredLevel: "INTERMEDIATE",
  },
  {
    skillId: "mock-skill-sql",
    skillName: "SQL",
    requiredLevel: "INTERMEDIATE",
  },
];

interface MockPerson {
  id: string;
  name: string;
  seniority: string;
  area: string;
  jobTitle: string;
  focusArea: string;
  skills: CoeCandidateInput["skills"];
  availabilityState: CoeCandidateInput["availabilityState"];
  allocationPercent: number;
  pastAllocationsWithClient: number;
  hourlyCost: number;
}

const MOCK_PEOPLE: MockPerson[] = [
  {
    id: "mock-coe-1",
    name: "Ana Souza",
    seniority: "SENIOR",
    area: "Engenharia",
    jobTitle: "Engenheira de Software",
    focusArea: "Front-end & Design System",
    skills: [
      { skillId: "mock-skill-react", level: "SPECIALIST" },
      { skillId: "mock-skill-node", level: "ADVANCED" },
    ],
    availabilityState: "FREE",
    allocationPercent: 0,
    pastAllocationsWithClient: 2,
    hourlyCost: 120,
  },
  {
    id: "mock-coe-2",
    name: "Bruno Lima",
    seniority: "MID_LEVEL",
    area: "Engenharia",
    jobTitle: "Desenvolvedor",
    focusArea: "Integrações",
    skills: [
      { skillId: "mock-skill-react", level: "INTERMEDIATE" },
      { skillId: "mock-skill-node", level: "INTERMEDIATE" },
    ],
    availabilityState: "PARTIAL",
    allocationPercent: 50,
    pastAllocationsWithClient: 0,
    hourlyCost: 90,
  },
  {
    id: "mock-coe-3",
    name: "Carla Dias",
    seniority: "ARCHITECT",
    area: "Dados",
    jobTitle: "Arquiteta de Dados",
    focusArea: "Dados & Analytics",
    skills: [
      { skillId: "mock-skill-sql", level: "SPECIALIST" },
      { skillId: "mock-skill-node", level: "ADVANCED" },
    ],
    availabilityState: "FREE",
    allocationPercent: 20,
    pastAllocationsWithClient: 3,
    hourlyCost: 160,
  },
  {
    id: "mock-coe-4",
    name: "Diego Alves",
    seniority: "JUNIOR",
    area: "Engenharia",
    jobTitle: "Desenvolvedor",
    focusArea: "Automação de testes",
    skills: [{ skillId: "mock-skill-react", level: "BASIC" }],
    availabilityState: "BENCH",
    allocationPercent: 0,
    pastAllocationsWithClient: 0,
    hourlyCost: 60,
  },
];

const MOCK_SLOT_SPECS: { roleName: string; seniority: string }[] = [
  { roleName: "Desenvolvedor", seniority: "SENIOR" },
  { roleName: "Desenvolvedor", seniority: "MID_LEVEL" },
  { roleName: "Especialista de dados", seniority: "ARCHITECT" },
];

/** O núcleo sintético, no formato da tela de curadoria. */
export function buildCoeMembersMock(): CoeMemberView[] {
  return MOCK_PEOPLE.map((p, index) => ({
    id: `mock-member-${index + 1}`,
    consultantId: p.id,
    consultantName: p.name,
    seniority: p.seniority,
    area: p.area,
    jobTitle: p.jobTitle,
    status: "ACTIVE" as const,
    focusArea: p.focusArea,
    note: null,
    active: true,
    skills: p.skills.map((s) => ({
      skillId: s.skillId,
      skillName:
        MOCK_SKILLS.find((m) => m.skillId === s.skillId)?.skillName ??
        s.skillId,
      level: s.level,
    })),
    addedByName: null,
    createdAt: new Date().toISOString(),
  }));
}

export function buildCoeCompositionMock(
  query: CoeCompositionQueryInput,
  includeFinancial: boolean,
): CoeCompositionBundle {
  const periodStart = query.periodStart
    ? new Date(`${query.periodStart}T00:00:00.000Z`)
    : new Date(`${toIsoDate(new Date())}T00:00:00.000Z`);
  const periods = buildWeeklyPeriods(periodStart, query.weeks);

  const slots: CoeSlotInput[] = MOCK_SLOT_SPECS.map((spec, index) => ({
    key: `mock-slot#${index}`,
    label: `${spec.roleName} · ${spec.seniority}`,
    roleName: spec.roleName,
    seniority: spec.seniority,
    requiredSkills: MOCK_SKILLS,
    saleRate: includeFinancial ? 200 : null,
    sourceProfileId: null,
  }));

  const candidates: CoeCandidateInput[] = MOCK_PEOPLE.map((p) => ({
    consultantId: p.id,
    consultantName: p.name,
    seniority: p.seniority,
    area: p.area,
    jobTitle: p.jobTitle,
    skills: p.skills,
    availabilityState: p.availabilityState,
    pastAllocationsWithClient: p.pastAllocationsWithClient,
    hourlyCost: includeFinancial ? p.hourlyCost : null,
    status: "ACTIVE",
    isCoeMember: true,
    coeFocusArea: p.focusArea,
  }));

  const composition = composeSquad(slots, candidates, includeFinancial);

  // Disponibilidade sintética: o mesmo percentual em toda a janela, suficiente
  // para a capacidade agregada demonstrar o comportamento.
  const availabilityRows: CoeAvailabilityRow[] = MOCK_PEOPLE.map((p) => ({
    consultantId: p.id,
    cells: periods.map((period) => ({
      periodKey: period.key,
      state: p.availabilityState ?? "FREE",
      allocationPercent: p.allocationPercent,
    })),
  }));

  return {
    projectId: query.projectId ?? null,
    projectName: "Projeto de demonstração",
    clientName: "Cliente de demonstração",
    slotsSource: "PLANNED_PROFILES",
    composition,
    periods,
    availabilityRows,
    requiredSkills: MOCK_SKILLS,
    financialIncluded: includeFinancial,
    scope: query.scope,
    candidatePoolSize: candidates.length,
    coePoolSize: candidates.length,
    notice: null,
    fromMock: true,
  };
}
