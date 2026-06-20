import type { RankingRow } from "./types";

/**
 * Gamificação DERIVADA da Universidade Jump (EP 7.3). Pura, sem I/O.
 *
 * Não há tabela de pontos: pontos e ranking são SEMPRE calculados a partir das
 * matrículas COMPLETED. Estas funções recebem os dados já lidos do banco (uma
 * linha por curso concluído) e devolvem pontos por consultor + o ranking. São
 * testadas diretamente, isolando a fórmula da persistência.
 *
 * FÓRMULA (simples e documentada):
 *   pontos do curso concluído = BASE_POINTS + floor(hours) * HOURS_BONUS
 *   - BASE_POINTS: cada conclusão vale uma base fixa (concluir importa).
 *   - HOURS_BONUS: bônus por hora cheia de carga do curso (esforço importa);
 *     usamos as horas do CURSO (carga oficial), não hoursCompleted, para o ponto
 *     refletir o conteúdo dominado e não variar com o autorrelato.
 *   - hours nulo/0 → só a base. floor() evita pontos fracionários.
 *
 * O total do consultor é a soma dos pontos dos seus cursos concluídos.
 * O ranking ordena por pontos desc, com desempate por nome (estável); empates de
 * pontos compartilham a posição (1,1,3 — competition ranking).
 */

export const BASE_POINTS = 100;
export const HOURS_BONUS = 5;

/** Uma conclusão de curso (insumo da gamificação). */
export interface CompletedCourseInput {
  consultantId: string;
  consultantName: string;
  /** Carga horária OFICIAL do curso (hours), ou null. Não é o hoursCompleted. */
  courseHours: number | null;
}

/** Pontos de UM curso concluído conforme a fórmula. */
export function pointsForCourse(courseHours: number | null): number {
  const hours =
    courseHours !== null && Number.isFinite(courseHours) && courseHours > 0
      ? Math.floor(courseHours)
      : 0;
  return BASE_POINTS + hours * HOURS_BONUS;
}

/** Pontos acumulados de um consultor (alias somando suas conclusões). */
export interface ConsultantPoints {
  consultantId: string;
  consultantName: string;
  points: number;
  completedCourses: number;
  /** Soma das cargas horárias oficiais dos cursos concluídos (floor por curso). */
  hoursCompleted: number;
}

/**
 * Agrega as conclusões por consultor: pontos totais, nº de cursos e horas.
 * Mantém a ordem de primeira aparição irrelevante (o ranking ordena depois).
 */
export function aggregatePoints(
  completions: ReadonlyArray<CompletedCourseInput>,
): ConsultantPoints[] {
  const byConsultant = new Map<string, ConsultantPoints>();
  for (const c of completions) {
    const entry = byConsultant.get(c.consultantId) ?? {
      consultantId: c.consultantId,
      consultantName: c.consultantName,
      points: 0,
      completedCourses: 0,
      hoursCompleted: 0,
    };
    entry.points += pointsForCourse(c.courseHours);
    entry.completedCourses += 1;
    entry.hoursCompleted +=
      c.courseHours !== null &&
      Number.isFinite(c.courseHours) &&
      c.courseHours > 0
        ? Math.floor(c.courseHours)
        : 0;
    byConsultant.set(c.consultantId, entry);
  }
  return [...byConsultant.values()];
}

/**
 * Ranking de gamificação a partir das conclusões. Ordena por pontos desc, depois
 * por nome (pt-BR) para um empate estável. Empates de PONTOS compartilham a
 * posição (competition ranking: 1,1,3). Consultores sem conclusão não aparecem.
 */
export function computeRanking(
  completions: ReadonlyArray<CompletedCourseInput>,
): RankingRow[] {
  const aggregated = aggregatePoints(completions).sort(
    (a, b) =>
      b.points - a.points ||
      a.consultantName.localeCompare(b.consultantName, "pt-BR"),
  );

  const rows: RankingRow[] = [];
  let lastPoints: number | null = null;
  let lastPosition = 0;
  aggregated.forEach((entry, index) => {
    const position =
      lastPoints !== null && entry.points === lastPoints
        ? lastPosition
        : index + 1;
    lastPoints = entry.points;
    lastPosition = position;
    rows.push({
      consultantId: entry.consultantId,
      consultantName: entry.consultantName,
      position,
      points: entry.points,
      completedCourses: entry.completedCourses,
      hoursCompleted: entry.hoursCompleted,
    });
  });
  return rows;
}

/**
 * Pontos + posição de UM consultor no ranking agregado. Retorna position null se
 * o consultor não pontuou (sem conclusões). totalRanked = nº de consultores com
 * ao menos uma conclusão (denominador honesto do "X de N").
 */
export function gamificationForConsultant(
  completions: ReadonlyArray<CompletedCourseInput>,
  consultantId: string,
): {
  points: number;
  completedCourses: number;
  hoursCompleted: number;
  position: number | null;
  totalRanked: number;
} {
  const ranking = computeRanking(completions);
  const mine = ranking.find((r) => r.consultantId === consultantId);
  return {
    points: mine?.points ?? 0,
    completedCourses: mine?.completedCourses ?? 0,
    hoursCompleted: mine?.hoursCompleted ?? 0,
    position: mine?.position ?? null,
    totalRanked: ranking.length,
  };
}
