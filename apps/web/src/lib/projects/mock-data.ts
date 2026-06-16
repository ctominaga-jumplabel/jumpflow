import type {
  ProjectClientOption,
  ProjectConsultantOption,
  ProjectItem,
  ProjectManagerOption,
  ProjectSkillOption,
} from "./types";

export const demoProjectSkills: ProjectSkillOption[] = [
  { id: "skill-qa-automation", name: "QA Automation", category: "Qualidade" },
  { id: "skill-react", name: "React", category: "Frontend" },
  { id: "skill-node", name: "Node.js", category: "Backend" },
  { id: "skill-data", name: "Data Analysis", category: "Dados" },
];

export const demoProjectClients: ProjectClientOption[] = [
  { id: "cli-atlas", name: "Atlas Energia" },
  { id: "cli-nova", name: "Nova Retail" },
  { id: "cli-meridian", name: "Meridian Saude" },
];

export const demoProjectConsultants: ProjectConsultantOption[] = [
  { id: "con-ana", name: "Ana Tester" },
  { id: "con-bruno", name: "Bruno Lima" },
  { id: "con-julia", name: "Julia Reis" },
];

export const demoProjectManagers: ProjectManagerOption[] = [
  { id: "usr-bruno", name: "Bruno Lima" },
  { id: "usr-helena", name: "Helena Costa" },
];

export const demoProjects: ProjectItem[] = [
  {
    id: "prj-atlas",
    clientId: "cli-atlas",
    clientName: "Atlas Energia",
    name: "Atlas",
    description: "Sustentacao e evolucao do portal de energia.",
    status: "ACTIVE",
    managerUserId: "usr-bruno",
    managerName: "Bruno Lima",
    startDate: "2026-01-15",
    endDate: "2026-12-31",
    billingHourlyRate: 320,
    budgetHours: 2400,
    costCenter: "ENERGIA-001",
    consumedHours: 1320,
    allocatedConsultants: 2,
    allocations: [
      {
        id: "alloc-atlas-ana",
        projectId: "prj-atlas",
        consultantId: "con-ana",
        consultantName: "Ana Tester",
        role: "QA Senior",
        allocationPercent: 80,
        startDate: "2026-01-15",
        status: "ACTIVE",
        skills: [
          {
            id: "alloc-skill-atlas-ana-qa",
            allocationId: "alloc-atlas-ana",
            skillId: "skill-qa-automation",
            skillName: "QA Automation",
            skillCategory: "Qualidade",
            level: "ADVANCED",
            note: "Cobertura E2E do portal.",
          },
        ],
      },
    ],
    saleRates: [
      {
        id: "rate-atlas-project",
        projectId: "prj-atlas",
        startsAt: "2026-01-15",
        hourlyRate: 320,
        currency: "BRL",
        note: "Valor base do contrato.",
      },
    ],
  },
  {
    id: "prj-nova",
    clientId: "cli-nova",
    clientName: "Nova Retail",
    name: "Checkout B2B",
    status: "PROPOSAL",
    startDate: "2026-07-01",
    billingHourlyRate: 280,
    budgetHours: 900,
    consumedHours: 0,
    allocatedConsultants: 0,
    allocations: [],
    saleRates: [],
  },
];

