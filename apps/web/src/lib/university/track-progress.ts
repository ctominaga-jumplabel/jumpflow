import type { EnrollmentStatus } from "./types";

/**
 * Progresso de TRILHA por consultor (EP 7.3 item 5). Puro, sem I/O.
 *
 * Definição: % = cursos ATIVOS concluídos pelo consultor / total de cursos
 * ATIVOS da trilha. Só cursos ATIVOS entram no denominador (um curso inativado
 * não deve travar a trilha em 99%). Conclusão = matrícula COMPLETED de um curso
 * ativo da trilha. Trilha sem curso ativo → 0% (nada a medir), nunca divide por
 * zero.
 */

export interface TrackCourseProgressInput {
  /** Status do curso no catálogo. Só ACTIVE conta para o denominador. */
  courseStatus: "ACTIVE" | "INACTIVE";
  /**
   * Status da matrícula DO CONSULTAR neste curso, ou null se não matriculado.
   * COMPLETED conta para o numerador.
   */
  enrollmentStatus: EnrollmentStatus | null;
}

export interface TrackProgress {
  totalCourses: number;
  completedCourses: number;
  /** 0-100, inteiro. */
  progressPct: number;
}

export function computeTrackProgress(
  courses: ReadonlyArray<TrackCourseProgressInput>,
): TrackProgress {
  const active = courses.filter((c) => c.courseStatus === "ACTIVE");
  const totalCourses = active.length;
  const completedCourses = active.filter(
    (c) => c.enrollmentStatus === "COMPLETED",
  ).length;
  const progressPct =
    totalCourses === 0
      ? 0
      : Math.round((completedCourses / totalCourses) * 100);
  return { totalCourses, completedCourses, progressPct };
}
