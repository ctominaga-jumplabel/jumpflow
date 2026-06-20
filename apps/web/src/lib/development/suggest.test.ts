import { describe, expect, it } from "vitest";
import {
  suggestActionsFromGap,
  suggestedDescription,
  suggestedTypeForGap,
} from "./suggest";
import type { GapSkillInput } from "./types";

const gap = (over: Partial<GapSkillInput>): GapSkillInput => ({
  skillId: "s1",
  skillName: "TypeScript",
  skillType: "TECHNICAL",
  requiredLevel: "ADVANCED",
  currentLevel: "INTERMEDIATE",
  gap: 1,
  ...over,
});

describe("suggestedTypeForGap (US17.01)", () => {
  it("lacuna pequena (1 nível) técnica → TRAINING", () => {
    expect(suggestedTypeForGap(gap({ gap: 1, skillType: "TECHNICAL" }))).toBe(
      "TRAINING",
    );
  });

  it("lacuna grande (>=2 níveis) técnica → CERTIFICATION", () => {
    expect(suggestedTypeForGap(gap({ gap: 2, skillType: "TECHNICAL" }))).toBe(
      "CERTIFICATION",
    );
    expect(suggestedTypeForGap(gap({ gap: 3, skillType: "TECHNICAL" }))).toBe(
      "CERTIFICATION",
    );
  });

  it("skill comportamental nunca vira CERTIFICATION → MENTORSHIP", () => {
    expect(suggestedTypeForGap(gap({ gap: 3, skillType: "BEHAVIORAL" }))).toBe(
      "MENTORSHIP",
    );
    expect(suggestedTypeForGap(gap({ gap: 1, skillType: "BEHAVIORAL" }))).toBe(
      "MENTORSHIP",
    );
  });
});

describe("suggestedDescription", () => {
  it("inclui skill, nível atual e requerido", () => {
    expect(
      suggestedDescription(
        gap({
          skillName: "SQL",
          currentLevel: "BASIC",
          requiredLevel: "ADVANCED",
        }),
      ),
    ).toBe("Evoluir SQL de Básico para Avançado.");
  });

  it("trata skill não avaliada (currentLevel null)", () => {
    expect(
      suggestedDescription(
        gap({ skillName: "Kafka", currentLevel: null, requiredLevel: "INTERMEDIATE" }),
      ),
    ).toBe("Evoluir Kafka de não avaliado para Intermediário.");
  });
});

describe("suggestActionsFromGap — geração a partir do gap (núcleo EP17)", () => {
  it("só skills com gap positivo viram sugestão; targetSkillId preenchido", () => {
    const result = suggestActionsFromGap([
      gap({ skillId: "a", gap: 2 }),
      gap({ skillId: "b", gap: 0 }), // atende: não sugere
      gap({ skillId: "c", gap: -1 }), // acima do requerido: não sugere
    ]);
    expect(result.map((s) => s.targetSkillId)).toEqual(["a"]);
    expect(result[0].targetSkillId).toBe("a");
  });

  it("ordena por maior gap primeiro, depois por nome", () => {
    const result = suggestActionsFromGap([
      gap({ skillId: "a", skillName: "Alpha", gap: 1 }),
      gap({ skillId: "b", skillName: "Bravo", gap: 3 }),
      gap({ skillId: "c", skillName: "Charlie", gap: 1 }),
    ]);
    expect(result.map((s) => s.targetSkillId)).toEqual(["b", "a", "c"]);
  });

  it("não cria nada automaticamente quando não há lacuna (rascunho vazio)", () => {
    expect(
      suggestActionsFromGap([gap({ gap: 0 }), gap({ gap: -2 })]),
    ).toEqual([]);
  });

  it("mapeia tipo por tamanho/tipo da lacuna", () => {
    const result = suggestActionsFromGap([
      gap({ skillId: "tech-big", skillType: "TECHNICAL", gap: 2 }),
      gap({ skillId: "tech-small", skillType: "TECHNICAL", gap: 1 }),
      gap({ skillId: "behav", skillType: "BEHAVIORAL", gap: 1 }),
    ]);
    const byId = Object.fromEntries(
      result.map((s) => [s.targetSkillId, s.type]),
    );
    expect(byId["tech-big"]).toBe("CERTIFICATION");
    expect(byId["tech-small"]).toBe("TRAINING");
    expect(byId["behav"]).toBe("MENTORSHIP");
  });

  it("não muta o array de entrada", () => {
    const input = [gap({ skillId: "a", gap: 1 }), gap({ skillId: "b", gap: 3 })];
    const snapshot = input.map((g) => g.skillId);
    suggestActionsFromGap(input);
    expect(input.map((g) => g.skillId)).toEqual(snapshot);
  });
});
