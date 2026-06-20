import { describe, expect, it } from "vitest";
import {
  BASE_POINTS,
  HOURS_BONUS,
  aggregatePoints,
  computeRanking,
  gamificationForConsultant,
  pointsForCourse,
  type CompletedCourseInput,
} from "./points";

const completion = (
  consultantId: string,
  consultantName: string,
  courseHours: number | null,
): CompletedCourseInput => ({ consultantId, consultantName, courseHours });

describe("pointsForCourse — fórmula base + bônus por horas", () => {
  it("curso sem horas vale só a base", () => {
    expect(pointsForCourse(null)).toBe(BASE_POINTS);
    expect(pointsForCourse(0)).toBe(BASE_POINTS);
  });

  it("aplica bônus por hora cheia (floor)", () => {
    // 10h → base + 10 * bônus
    expect(pointsForCourse(10)).toBe(BASE_POINTS + 10 * HOURS_BONUS);
    // 10.9h → floor 10
    expect(pointsForCourse(10.9)).toBe(BASE_POINTS + 10 * HOURS_BONUS);
  });

  it("ignora horas negativas/inválidas (só base)", () => {
    expect(pointsForCourse(-5)).toBe(BASE_POINTS);
    expect(pointsForCourse(Number.NaN)).toBe(BASE_POINTS);
  });
});

describe("aggregatePoints — soma por consultor", () => {
  it("soma pontos, cursos e horas por consultor", () => {
    const agg = aggregatePoints([
      completion("c1", "Ana", 10),
      completion("c1", "Ana", 4),
      completion("c2", "Bruno", null),
    ]);
    const ana = agg.find((a) => a.consultantId === "c1")!;
    const bruno = agg.find((a) => a.consultantId === "c2")!;
    expect(ana.points).toBe(
      BASE_POINTS + 10 * HOURS_BONUS + (BASE_POINTS + 4 * HOURS_BONUS),
    );
    expect(ana.completedCourses).toBe(2);
    expect(ana.hoursCompleted).toBe(14);
    expect(bruno.points).toBe(BASE_POINTS);
    expect(bruno.hoursCompleted).toBe(0);
  });
});

describe("computeRanking — ordenação e empates", () => {
  it("ordena por pontos desc", () => {
    const ranking = computeRanking([
      completion("c1", "Ana", 2), // base + 10
      completion("c2", "Bruno", 20), // base + 100
    ]);
    expect(ranking[0].consultantId).toBe("c2");
    expect(ranking[0].position).toBe(1);
    expect(ranking[1].consultantId).toBe("c1");
    expect(ranking[1].position).toBe(2);
  });

  it("empate de pontos compartilha a posição (competition ranking 1,1,3)", () => {
    const ranking = computeRanking([
      completion("c1", "Ana", 10),
      completion("c2", "Bruno", 10),
      completion("c3", "Carla", null), // menos pontos
    ]);
    // Ana e Bruno empatam em pontos → posição 1; desempate por nome
    expect(ranking[0].position).toBe(1);
    expect(ranking[1].position).toBe(1);
    expect(ranking[0].consultantName).toBe("Ana");
    expect(ranking[1].consultantName).toBe("Bruno");
    expect(ranking[2].position).toBe(3);
    expect(ranking[2].consultantName).toBe("Carla");
  });

  it("consultor sem conclusão não aparece (ranking vazio)", () => {
    expect(computeRanking([])).toEqual([]);
  });
});

describe("gamificationForConsultant — pontos + posição do próprio", () => {
  it("retorna pontos e posição de um consultor que pontuou", () => {
    const g = gamificationForConsultant(
      [
        completion("c1", "Ana", 10),
        completion("c2", "Bruno", 2),
      ],
      "c1",
    );
    expect(g.position).toBe(1);
    expect(g.completedCourses).toBe(1);
    expect(g.totalRanked).toBe(2);
    expect(g.points).toBe(BASE_POINTS + 10 * HOURS_BONUS);
  });

  it("consultor sem conclusão: position null, points 0, mas totalRanked conta os outros", () => {
    const g = gamificationForConsultant(
      [completion("c2", "Bruno", 2)],
      "c1",
    );
    expect(g.position).toBeNull();
    expect(g.points).toBe(0);
    expect(g.completedCourses).toBe(0);
    expect(g.totalRanked).toBe(1);
  });
});
