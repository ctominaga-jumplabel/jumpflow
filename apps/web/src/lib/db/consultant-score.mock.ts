import { computeConsultantScores } from "@/lib/consultant-score/engine";
import type { ScoreConsultantInput } from "@/lib/consultant-score/types";
import type { ConsultantScoreResultBundle } from "./consultant-score";

/**
 * Mock para degradação graciosa do Score do Consultor quando o banco não está
 * configurado (docs/p3-inteligencia-design.md §6). Roda a MESMA engine pura sobre
 * dados sintéticos, para a tela demonstrar o score, o breakdown por fator e a
 * tendência sem DB. Honesto: o bundle marca `fromMock: true`.
 */

const MOCK_CONSULTANTS: ScoreConsultantInput[] = [
  {
    // HIGH: forte em avaliação, presença, certificações e feedback; em evolução.
    consultantId: "mock-cons-1",
    consultantName: "Ana Souza",
    seniority: "SENIOR",
    area: "Engenharia",
    jobTitle: "Engenheira de Software Sênior",
    status: "ACTIVE",
    evaluationAverage: 4.6,
    previousEvaluationAverage: 4.1,
    approvedHours: 480,
    expectedHours: 504,
    validCertificates: 3,
    expiredCertificates: 0,
    completedCourses: 4,
    positiveFeedbacks: 6,
    concernFeedbacks: 0,
    realizedRevenue: 96000,
    realizedCost: 52000,
  },
  {
    // MEDIUM: avaliação mediana, presença ok, alguns sinais de atenção; estável.
    consultantId: "mock-cons-2",
    consultantName: "Bruno Lima",
    seniority: "MID_LEVEL",
    area: "Dados",
    jobTitle: "Analista de Dados Pleno",
    status: "ACTIVE",
    evaluationAverage: 3.4,
    previousEvaluationAverage: 3.4,
    approvedHours: 360,
    expectedHours: 504,
    validCertificates: 1,
    expiredCertificates: 1,
    completedCourses: 1,
    positiveFeedbacks: 2,
    concernFeedbacks: 1,
    realizedRevenue: 60000,
    realizedCost: 50000,
  },
  {
    // LOW: avaliação baixa, presença fraca, saldo de feedback negativo; em queda.
    consultantId: "mock-cons-3",
    consultantName: "Carla Dias",
    seniority: "JUNIOR",
    area: "Design",
    jobTitle: "Designer Júnior",
    status: "ACTIVE",
    evaluationAverage: 2.4,
    previousEvaluationAverage: 3.0,
    approvedHours: 180,
    expectedHours: 504,
    validCertificates: 0,
    expiredCertificates: 0,
    completedCourses: 0,
    positiveFeedbacks: 1,
    concernFeedbacks: 3,
    realizedRevenue: 24000,
    realizedCost: 30000,
  },
  {
    // Sem dados: recém-chegado, sem avaliação/horas/feedback — score neutro.
    consultantId: "mock-cons-4",
    consultantName: "Diego Ramos",
    seniority: "INTERN",
    area: "Engenharia",
    jobTitle: "Estagiário",
    status: "ACTIVE",
    evaluationAverage: null,
    previousEvaluationAverage: null,
    approvedHours: 0,
    expectedHours: 0,
    validCertificates: 0,
    expiredCertificates: 0,
    completedCourses: 0,
    positiveFeedbacks: 0,
    concernFeedbacks: 0,
    realizedRevenue: null,
    realizedCost: null,
  },
];

export function buildConsultantScoreMock(
  includeFinancial: boolean,
  consultantId: string | null,
): ConsultantScoreResultBundle {
  const all = computeConsultantScores(MOCK_CONSULTANTS, includeFinancial);
  const results = consultantId
    ? all.filter((r) => r.consultantId === consultantId)
    : all;
  return {
    results,
    financialIncluded: includeFinancial,
    selectedConsultantId: consultantId,
    fromMock: true,
  };
}
