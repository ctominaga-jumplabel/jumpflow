/**
 * Shared, pure types for the Pesquisa de Clima / NPS interno module (EP 7.1).
 *
 * No server-only imports so these are safe to import from client components,
 * schemas and tests. Mirrors the Prisma models `Survey`, `SurveyQuestion`,
 * `SurveyInvitation`, `SurveyResponse` and `SurveyAnswer`. The dashboard/eNPS
 * read-models are derived shapes. See docs/roadmap-talentos-gcpec.md §7.1 and
 * docs/backlog-talentos.md §3 (LGPD / anonimato).
 */

export type SurveyType =
  | "CLIMATE"
  | "NPS"
  | "SATISFACTION"
  | "LEADERSHIP"
  | "PULSE";
export type SurveyStatus = "DRAFT" | "OPEN" | "CLOSED";
export type SurveyQuestionType = "SCALE" | "NPS" | "TEXT" | "CHOICE";
export type SurveyInvitationStatus = "PENDING" | "ANSWERED" | "EXPIRED";

export const surveyTypeLabels: Record<SurveyType, string> = {
  CLIMATE: "Clima organizacional",
  NPS: "eNPS (recomendação)",
  SATISFACTION: "Satisfação",
  LEADERSHIP: "Liderança",
  PULSE: "Pulso",
};

export const surveyStatusLabels: Record<SurveyStatus, string> = {
  DRAFT: "Rascunho",
  OPEN: "Aberta",
  CLOSED: "Encerrada",
};

export const surveyQuestionTypeLabels: Record<SurveyQuestionType, string> = {
  SCALE: "Escala (1-5)",
  NPS: "NPS (0-10)",
  TEXT: "Resposta aberta",
  CHOICE: "Escolha única",
};

export const surveyInvitationStatusLabels: Record<
  SurveyInvitationStatus,
  string
> = {
  PENDING: "Pendente",
  ANSWERED: "Respondida",
  EXPIRED: "Expirada",
};

// ── Escala usada por SCALE e NPS ────────────────────────────────────────────

/** Escala fechada de SCALE (1-5). */
export const SCALE_MIN = 1;
export const SCALE_MAX = 5;
/** Escala fechada de NPS (0-10). */
export const NPS_MIN = 0;
export const NPS_MAX = 10;

// ── Piso mínimo de exibição (LGPD / anonimato) ──────────────────────────────

/**
 * Piso mínimo de respostas submetidas para exibir QUALQUER agregação de uma
 * pesquisa anônima. Abaixo deste piso o dashboard não revela médias, NPS nem
 * distribuição, para impedir reidentificação por inferência em amostras
 * pequenas (docs/backlog-talentos.md §3). Documentado e centralizado aqui.
 */
export const MIN_RESPONSES_TO_DISCLOSE = 3;

// ── Gestão: resumo de pesquisa (lista) ──────────────────────────────────────

/** Resumo de uma pesquisa para a lista de gestão. */
export interface SurveySummary {
  id: string;
  title: string;
  description: string | null;
  type: SurveyType;
  anonymous: boolean;
  status: SurveyStatus;
  periodStart: string | null;
  periodEnd: string | null;
  questionCount: number;
  /** Convites gerados (público-alvo). */
  invitationCount: number;
  /** Convites já respondidos (status ANSWERED). */
  answeredCount: number;
  /** Respostas submetidas (SurveyResponse). */
  responseCount: number;
}

// ── Responder: formulário do convidado ──────────────────────────────────────

/** Questão exibida no formulário de resposta. */
export interface SurveyFormQuestion {
  id: string;
  text: string;
  type: SurveyQuestionType;
  /** Alternativas quando type = CHOICE. */
  options: string[];
  order: number;
}

/** Convite + questões para o consultor responder (uma vez). */
export interface SurveyAssignment {
  invitationId: string;
  surveyId: string;
  surveyTitle: string;
  surveyDescription: string | null;
  surveyType: SurveyType;
  anonymous: boolean;
  status: SurveyInvitationStatus;
  /** Pesquisa aberta? Só responde com OPEN + invitation PENDING. */
  surveyStatus: SurveyStatus;
  questions: SurveyFormQuestion[];
}

// ── Dashboard agregado ──────────────────────────────────────────────────────

/** Distribuição NPS/eNPS de uma questão NPS (0-10). */
export interface NpsBreakdown {
  questionId: string;
  questionText: string;
  /** 9-10 */
  promoters: number;
  /** 7-8 */
  passives: number;
  /** 0-6 */
  detractors: number;
  total: number;
  /** Score -100..100 = %promotores - %detratores (arredondado). */
  score: number;
}

/** Média de uma questão SCALE (1-5). */
export interface ScaleAverage {
  questionId: string;
  questionText: string;
  average: number;
  count: number;
}

/** Distribuição de uma questão CHOICE. */
export interface ChoiceDistributionItem {
  option: string;
  count: number;
}
export interface ChoiceDistribution {
  questionId: string;
  questionText: string;
  total: number;
  items: ChoiceDistributionItem[];
}

/**
 * Dashboard agregado de uma pesquisa. `disclosed` indica se o piso mínimo de
 * respostas foi atingido; quando false, todas as agregações vêm vazias e a UI
 * mostra apenas a taxa de resposta + aviso de anonimato.
 */
export interface SurveyDashboard {
  surveyId: string;
  surveyTitle: string;
  surveyType: SurveyType;
  status: SurveyStatus;
  anonymous: boolean;
  invitationCount: number;
  responseCount: number;
  /** responseCount / invitationCount (0..1); 0 quando sem convites. */
  responseRate: number;
  /** Piso mínimo configurado (MIN_RESPONSES_TO_DISCLOSE). */
  minToDisclose: number;
  /** true quando responseCount >= minToDisclose. */
  disclosed: boolean;
  nps: NpsBreakdown[];
  scales: ScaleAverage[];
  choices: ChoiceDistribution[];
}
