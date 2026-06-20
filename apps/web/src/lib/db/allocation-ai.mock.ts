import { rankCandidates } from "@/lib/allocation-ai/engine";
import type {
  FitCandidateInput,
  FitTargetInput,
  RequiredSkillInput,
} from "@/lib/allocation-ai/types";
import type { AllocationFitQueryInput } from "@/lib/allocation-ai/schemas";
import type { AllocationFitResultBundle } from "./allocation-ai";

/**
 * Mock para degradação graciosa da IA de Alocação quando o banco não está
 * configurado (docs/p3-inteligencia-design.md §6). Roda a MESMA engine pura
 * sobre dados sintéticos, para a tela demonstrar o ranking e o breakdown sem DB.
 * Honesto: o bundle marca `fromMock: true` para a UI sinalizar dados de exemplo.
 */

const MOCK_REQUIRED_SKILLS: RequiredSkillInput[] = [
  { skillId: "mock-skill-react", skillName: "React", requiredLevel: "ADVANCED" },
  {
    skillId: "mock-skill-node",
    skillName: "Node.js",
    requiredLevel: "INTERMEDIATE",
  },
];

const MOCK_CANDIDATES: FitCandidateInput[] = [
  {
    consultantId: "mock-c1",
    consultantName: "Ana Souza",
    seniority: "SENIOR",
    area: "Engenharia",
    jobTitle: "Engenheira de Software",
    skills: [
      { skillId: "mock-skill-react", level: "SPECIALIST" },
      { skillId: "mock-skill-node", level: "ADVANCED" },
    ],
    availabilityState: "FREE",
    pastAllocationsWithClient: 2,
    hourlyCost: 120,
    status: "ACTIVE",
  },
  {
    consultantId: "mock-c2",
    consultantName: "Bruno Lima",
    seniority: "MID_LEVEL",
    area: "Engenharia",
    jobTitle: "Desenvolvedor",
    skills: [{ skillId: "mock-skill-react", level: "INTERMEDIATE" }],
    availabilityState: "PARTIAL",
    pastAllocationsWithClient: 0,
    hourlyCost: 90,
    status: "ACTIVE",
  },
  {
    consultantId: "mock-c3",
    consultantName: "Carla Dias",
    seniority: "SPECIALIST",
    area: "Dados",
    jobTitle: "Arquiteta",
    skills: [
      { skillId: "mock-skill-react", level: "ADVANCED" },
      { skillId: "mock-skill-node", level: "SPECIALIST" },
    ],
    availabilityState: "FULL",
    pastAllocationsWithClient: 3,
    hourlyCost: 160,
    status: "ACTIVE",
  },
];

export function buildAllocationFitMock(
  query: AllocationFitQueryInput,
  includeFinancial: boolean,
): AllocationFitResultBundle {
  // Usa as skills do mock (a query pode pedir skills inexistentes no mock; o
  // exemplo serve apenas para demonstrar o ranking sem DB).
  void query;
  const target: FitTargetInput = {
    requiredSkills: MOCK_REQUIRED_SKILLS,
    saleRate: 200,
  };
  const results = rankCandidates(target, MOCK_CANDIDATES, includeFinancial);
  return {
    results,
    requiredSkills: MOCK_REQUIRED_SKILLS,
    clientName: "Cliente Exemplo",
    projectName: "Projeto Exemplo",
    financialIncluded: includeFinancial,
    periodLabel: query.periodStart ? "Período de exemplo" : null,
    fromMock: true,
  };
}
