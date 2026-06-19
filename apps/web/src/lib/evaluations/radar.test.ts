import { describe, expect, it } from "vitest";
import type { SkillLevel } from "@/lib/competencies/types";
import {
  buildGap,
  buildHistory,
  buildRadar,
  countRatersByRelationship,
  type AnswerInput,
  type HistoryInput,
} from "./radar";

const answer = (over: Partial<AnswerInput>): AnswerInput => ({
  skillId: "s1",
  skillName: "React",
  skillType: "TECHNICAL",
  score: 3,
  relationship: "SELF",
  ...over,
});

describe("buildRadar — média por competência consolidando avaliadores", () => {
  it("média simples entre múltiplos avaliadores na mesma skill", () => {
    const radar = buildRadar([
      answer({ score: 4, relationship: "SELF" }),
      answer({ score: 2, relationship: "MANAGER" }),
    ]);
    expect(radar).toHaveLength(1);
    expect(radar[0].averageScore).toBe(3);
    expect(radar[0].sampleCount).toBe(2);
  });

  it("agrega por skill distinto e ordena por nome", () => {
    const radar = buildRadar([
      answer({ skillId: "z", skillName: "Zod", score: 5 }),
      answer({ skillId: "a", skillName: "API", score: 1 }),
    ]);
    expect(radar.map((r) => r.skillName)).toEqual(["API", "Zod"]);
  });

  it("não identifica avaliador: a saída só tem média e contagem (anonimato)", () => {
    const radar = buildRadar([
      answer({ score: 5, relationship: "PEER" }),
      answer({ score: 1, relationship: "PEER" }),
    ]);
    expect(radar[0]).not.toHaveProperty("relationship");
    expect(radar[0]).not.toHaveProperty("raterUserId");
    expect(radar[0].averageScore).toBe(3);
  });

  it("vazio quando não há respostas", () => {
    expect(buildRadar([])).toEqual([]);
  });
});

describe("buildGap — média convertida × nível requerido (DP-06)", () => {
  const radar = buildRadar([
    answer({ skillId: "s1", skillName: "React", score: 3 }), // peso 1.5
  ]);

  it("MEETS quando a média convertida atinge o requerido", () => {
    // score 3 → peso 1.5; requerido INTERMEDIATE (peso 1) → atende.
    const required = new Map<string, SkillLevel>([["s1", "INTERMEDIATE"]]);
    const gap = buildGap(radar, required);
    expect(gap[0].status).toBe("MEETS");
    expect(gap[0].gap).toBeLessThanOrEqual(0.01);
  });

  it("GAP quando o requerido supera a média convertida", () => {
    // score 3 → peso 1.5; requerido SPECIALIST (peso 3) → lacuna 1.5.
    const required = new Map<string, SkillLevel>([["s1", "SPECIALIST"]]);
    const gap = buildGap(radar, required);
    expect(gap[0].status).toBe("GAP");
    expect(gap[0].gap).toBeCloseTo(1.5);
  });

  it("NO_REQUIREMENT quando a skill não está no perfil", () => {
    const gap = buildGap(radar, new Map());
    expect(gap[0].status).toBe("NO_REQUIREMENT");
    expect(gap[0].requiredWeight).toBeNull();
    expect(gap[0].gap).toBeNull();
  });
});

describe("countRatersByRelationship — agregado por relacionamento", () => {
  it("conta por relacionamento", () => {
    expect(
      countRatersByRelationship(["SELF", "PEER", "PEER", "MANAGER"]),
    ).toEqual({ SELF: 1, PEER: 2, MANAGER: 1 });
  });
});

describe("buildHistory — evolução por competência (US16.05)", () => {
  const rows: HistoryInput[] = [
    {
      cycleId: "c2",
      cycleName: "2026.2",
      periodEnd: "2026-12-31",
      skillId: "s1",
      skillName: "React",
      skillType: "TECHNICAL",
      averageScore: 4,
    },
    {
      cycleId: "c1",
      cycleName: "2026.1",
      periodEnd: "2026-06-30",
      skillId: "s1",
      skillName: "React",
      skillType: "TECHNICAL",
      averageScore: 3,
    },
  ];

  it("ordena os pontos por periodEnd ascendente (mais antigo primeiro)", () => {
    const series = buildHistory(rows);
    expect(series).toHaveLength(1);
    expect(series[0].points.map((p) => p.cycleId)).toEqual(["c1", "c2"]);
    expect(series[0].points.map((p) => p.averageScore)).toEqual([3, 4]);
  });

  it("lida com skill presente só em um ciclo sem quebrar a série", () => {
    const series = buildHistory([
      ...rows,
      {
        cycleId: "c2",
        cycleName: "2026.2",
        periodEnd: "2026-12-31",
        skillId: "s2",
        skillName: "Liderança",
        skillType: "BEHAVIORAL",
        averageScore: 5,
      },
    ]);
    const lideranca = series.find((s) => s.skillId === "s2");
    expect(lideranca?.points).toHaveLength(1);
    expect(lideranca?.points[0].cycleId).toBe("c2");
  });
});
