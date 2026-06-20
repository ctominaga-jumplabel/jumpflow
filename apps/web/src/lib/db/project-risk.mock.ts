import { computeProjectRisks } from "@/lib/project-risk/engine";
import type { RiskProjectInput } from "@/lib/project-risk/types";
import type { ProjectRiskResultBundle } from "./project-risk";

/**
 * Mock para degradação graciosa da IA de Risco de Projeto quando o banco não está
 * configurado (docs/p3-inteligencia-design.md §6). Roda a MESMA engine pura sobre
 * dados sintéticos, para a tela demonstrar o semáforo, o breakdown e as
 * recomendações sem DB. Honesto: o bundle marca `fromMock: true`.
 *
 * `now` é fixado para que o mock seja estável (o consumo adiantado / atraso não
 * dependem da data real do ambiente).
 */

const MOCK_NOW = new Date("2026-06-19T00:00:00.000Z");

function daysFromNow(days: number): Date {
  return new Date(MOCK_NOW.getTime() + days * 24 * 60 * 60 * 1000);
}

const MOCK_PROJECTS: RiskProjectInput[] = [
  {
    // RED: orçamento estourado, prazo vencido, margem negativa, feedbacks CONCERN.
    projectId: "mock-prj-1",
    projectName: "Plataforma Atlas",
    clientName: "Cliente Norte",
    status: "ACTIVE",
    budgetHours: 800,
    approvedHours: 980,
    startDate: daysFromNow(-120),
    endDate: daysFromNow(-10),
    estimatedCost: 220000,
    estimatedRevenue: 200000,
    recentConcernFeedbacks: 3,
  },
  {
    // YELLOW: consumo adiantado e prazo apertado, margem fina.
    projectId: "mock-prj-2",
    projectName: "App Mobile Vega",
    clientName: "Cliente Sul",
    status: "ACTIVE",
    budgetHours: 600,
    approvedHours: 520,
    startDate: daysFromNow(-60),
    endDate: daysFromNow(20),
    estimatedCost: 90000,
    estimatedRevenue: 120000,
    recentConcernFeedbacks: 1,
  },
  {
    // GREEN: dentro do orçamento e do prazo, margem saudável.
    projectId: "mock-prj-3",
    projectName: "Portal Helios",
    clientName: "Cliente Leste",
    status: "ACTIVE",
    budgetHours: 1000,
    approvedHours: 300,
    startDate: daysFromNow(-30),
    endDate: daysFromNow(120),
    estimatedCost: 60000,
    estimatedRevenue: 150000,
    recentConcernFeedbacks: 0,
  },
];

export function buildProjectRiskMock(
  includeFinancial: boolean,
  projectId: string | null,
): ProjectRiskResultBundle {
  const all = computeProjectRisks(MOCK_PROJECTS, includeFinancial, MOCK_NOW);
  const results = projectId ? all.filter((r) => r.projectId === projectId) : all;
  return {
    results,
    financialIncluded: includeFinancial,
    selectedProjectId: projectId,
    fromMock: true,
  };
}
