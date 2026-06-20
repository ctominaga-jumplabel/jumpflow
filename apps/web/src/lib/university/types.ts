/**
 * Shared, pure types for a Universidade Jump (EP 7.3 / docs/roadmap-talentos-gcpec.md).
 *
 * No server-only imports so these are safe from client components, schemas and
 * tests. Mirrors the Prisma models `LearningTrack`, `Course` and `Enrollment`
 * (+ their enums) and the DERIVED read-models de gamificação e progresso de
 * trilha (pontos/ranking/progresso são calculados no servidor, nunca persistidos
 * — ver lib/university/points.ts e lib/university/track-progress.ts).
 */

export type LearningStatus = "ACTIVE" | "INACTIVE";

export type EnrollmentStatus =
  | "ENROLLED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export const learningStatusLabels: Record<LearningStatus, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
};

export const enrollmentStatusLabels: Record<EnrollmentStatus, string> = {
  ENROLLED: "Matriculado",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

// ── Curadoria (catálogo da gestão) ──────────────────────────────────────────

/** Trilha com a contagem de cursos, para a curadoria (gestão). */
export interface TrackView {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: LearningStatus;
  /** Cursos ATIVOS vinculados (denominador do progresso da trilha). */
  activeCourseCount: number;
  /** Total de cursos vinculados (inclui inativos), para a curadoria. */
  totalCourseCount: number;
}

/** Curso do catálogo, com vínculos opcionais a trilha e skill. */
export interface CourseView {
  id: string;
  trackId: string | null;
  trackTitle: string | null;
  title: string;
  provider: string | null;
  hours: number | null;
  externalUrl: string | null;
  skillId: string | null;
  skillName: string | null;
  status: LearningStatus;
  enrollmentCount: number;
}

/** Opção leve de trilha ATIVA para o seletor de curso. */
export interface TrackOption {
  id: string;
  title: string;
}

// ── Catálogo do consultor (navegação + matrícula) ───────────────────────────

/**
 * Curso visto pelo consultor no catálogo, com a SUA matrícula (se houver). O
 * campo `enrollment` é null quando o consultor ainda não se matriculou.
 */
export interface CatalogCourseView {
  id: string;
  title: string;
  provider: string | null;
  hours: number | null;
  externalUrl: string | null;
  skillId: string | null;
  skillName: string | null;
  /** Matrícula DO PRÓPRIO consultor neste curso (escopo aplicado no servidor). */
  enrollment: EnrollmentSummary | null;
}

/** Trilha do catálogo com seus cursos ativos e o progresso do consultor. */
export interface CatalogTrackView {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  courses: CatalogCourseView[];
  /** Progresso do consultor na trilha (0-100, derivado). */
  progressPct: number;
  completedCourses: number;
  totalCourses: number;
}

/** Resumo de uma matrícula do próprio consultor. */
export interface EnrollmentSummary {
  id: string;
  status: EnrollmentStatus;
  progressPct: number;
  hoursCompleted: number;
  completedAt: string | null;
}

// ── Gamificação (DERIVADA) ──────────────────────────────────────────────────

/** Linha do ranking de gamificação: um consultor e seus pontos derivados. */
export interface RankingRow {
  consultantId: string;
  consultantName: string;
  /** Posição no ranking (1-based; empates compartilham a posição). */
  position: number;
  points: number;
  completedCourses: number;
  hoursCompleted: number;
}

/** Visão de gamificação do PRÓPRIO consultor (pontos + posição no ranking). */
export interface MyGamification {
  points: number;
  completedCourses: number;
  hoursCompleted: number;
  /** Posição no ranking agregado da empresa (null se não pontuou ainda). */
  position: number | null;
  /** Total de consultores no ranking (denominador "X de N"). */
  totalRanked: number;
}
