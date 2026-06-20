import { describe, expect, it } from "vitest";
import {
  computeTrackProgress,
  type TrackCourseProgressInput,
} from "./track-progress";

const c = (
  courseStatus: "ACTIVE" | "INACTIVE",
  enrollmentStatus: TrackCourseProgressInput["enrollmentStatus"],
): TrackCourseProgressInput => ({ courseStatus, enrollmentStatus });

describe("computeTrackProgress — cursos ativos concluídos / total ativos", () => {
  it("trilha sem curso ativo → 0% (não divide por zero)", () => {
    expect(computeTrackProgress([])).toEqual({
      totalCourses: 0,
      completedCourses: 0,
      progressPct: 0,
    });
  });

  it("nenhum concluído → 0%", () => {
    const p = computeTrackProgress([
      c("ACTIVE", "ENROLLED"),
      c("ACTIVE", null),
    ]);
    expect(p.progressPct).toBe(0);
    expect(p.totalCourses).toBe(2);
    expect(p.completedCourses).toBe(0);
  });

  it("metade concluída → 50%", () => {
    const p = computeTrackProgress([
      c("ACTIVE", "COMPLETED"),
      c("ACTIVE", "IN_PROGRESS"),
    ]);
    expect(p.progressPct).toBe(50);
  });

  it("todos concluídos → 100%", () => {
    const p = computeTrackProgress([
      c("ACTIVE", "COMPLETED"),
      c("ACTIVE", "COMPLETED"),
    ]);
    expect(p.progressPct).toBe(100);
  });

  it("curso INATIVO não entra no denominador nem no numerador", () => {
    // 1 ativo concluído de 1 ativo → 100%, mesmo havendo um inativo concluído
    const p = computeTrackProgress([
      c("ACTIVE", "COMPLETED"),
      c("INACTIVE", "COMPLETED"),
    ]);
    expect(p.totalCourses).toBe(1);
    expect(p.completedCourses).toBe(1);
    expect(p.progressPct).toBe(100);
  });

  it("arredonda para inteiro (1 de 3 → 33%)", () => {
    const p = computeTrackProgress([
      c("ACTIVE", "COMPLETED"),
      c("ACTIVE", "ENROLLED"),
      c("ACTIVE", "IN_PROGRESS"),
    ]);
    expect(p.progressPct).toBe(33);
  });

  it("matrícula CANCELLED não conta como concluída", () => {
    const p = computeTrackProgress([
      c("ACTIVE", "CANCELLED"),
      c("ACTIVE", "COMPLETED"),
    ]);
    expect(p.completedCourses).toBe(1);
    expect(p.progressPct).toBe(50);
  });
});
