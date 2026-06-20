import { describe, expect, it } from "vitest";
import { skillLevelWeight } from "@/lib/competencies/types";
import {
  levelWeightToScore,
  requiredLevelToExpectedScore,
  requiredLevelWeight,
  scoreToLevelWeight,
} from "./scale";

describe("scoreToLevelWeight (DP-06: score 1-5 → peso 0-3)", () => {
  it("mapeia os extremos: 1→0, 5→3", () => {
    expect(scoreToLevelWeight(1)).toBeCloseTo(0);
    expect(scoreToLevelWeight(5)).toBeCloseTo(3);
  });

  it("é linear no meio: 3→1.5", () => {
    expect(scoreToLevelWeight(3)).toBeCloseTo(1.5);
  });

  it("preserva a ordem (monotônica crescente)", () => {
    expect(scoreToLevelWeight(2)).toBeLessThan(scoreToLevelWeight(4));
  });

  it("trunca fora do intervalo (defensivo)", () => {
    expect(scoreToLevelWeight(0)).toBeCloseTo(0);
    expect(scoreToLevelWeight(9)).toBeCloseTo(3);
  });
});

describe("levelWeightToScore (inverso: peso 0-3 → score 1-5)", () => {
  it("mapeia os extremos: 0→1, 3→5", () => {
    expect(levelWeightToScore(0)).toBeCloseTo(1);
    expect(levelWeightToScore(3)).toBeCloseTo(5);
  });

  it("é o inverso exato de scoreToLevelWeight", () => {
    for (const score of [1, 2, 3, 4, 5]) {
      expect(levelWeightToScore(scoreToLevelWeight(score))).toBeCloseTo(score);
    }
  });
});

describe("requiredLevel helpers (escala de nível BASIC..SPECIALIST)", () => {
  it("requiredLevelWeight casa com o peso da escala de skill", () => {
    expect(requiredLevelWeight("BASIC")).toBe(skillLevelWeight("BASIC"));
    expect(requiredLevelWeight("SPECIALIST")).toBe(
      skillLevelWeight("SPECIALIST"),
    );
  });

  it("BASIC requer score esperado 1; SPECIALIST requer 5", () => {
    expect(requiredLevelToExpectedScore("BASIC")).toBeCloseTo(1);
    expect(requiredLevelToExpectedScore("SPECIALIST")).toBeCloseTo(5);
  });

  it("INTERMEDIATE (peso 1) → score esperado ~2.33", () => {
    expect(requiredLevelToExpectedScore("INTERMEDIATE")).toBeCloseTo(
      1 + (1 / 3) * 4,
    );
  });
});
