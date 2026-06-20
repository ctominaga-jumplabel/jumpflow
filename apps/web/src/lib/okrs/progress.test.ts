import { describe, expect, it } from "vitest";
import {
  computeKeyResultProgress,
  computeObjectiveProgress,
  type KeyResultProgressInput,
} from "./progress";

const kr = (over: Partial<KeyResultProgressInput>): KeyResultProgressInput => ({
  metricType: "NUMBER",
  startValue: 0,
  targetValue: 100,
  currentValue: 0,
  ...over,
});

describe("computeKeyResultProgress — NUMBER/PERCENT/CURRENCY proporcional", () => {
  it("no início → 0%", () => {
    expect(computeKeyResultProgress(kr({ currentValue: 0 }))).toBe(0);
  });

  it("na metade → 50%", () => {
    expect(computeKeyResultProgress(kr({ currentValue: 50 }))).toBe(50);
  });

  it("no alvo → 100%", () => {
    expect(computeKeyResultProgress(kr({ currentValue: 100 }))).toBe(100);
  });

  it("além do alvo satura em 100% (não passa de 100)", () => {
    expect(computeKeyResultProgress(kr({ currentValue: 150 }))).toBe(100);
  });

  it("antes do início satura em 0% (não vai negativo)", () => {
    expect(computeKeyResultProgress(kr({ currentValue: -20 }))).toBe(0);
  });

  it("arredonda para inteiro", () => {
    // 1/3 do caminho = 33.33% → 33
    expect(computeKeyResultProgress(kr({ currentValue: 1, targetValue: 3 }))).toBe(33);
  });

  it("start != 0: faixa entre start e target", () => {
    // start 20, target 120, current 70 → (70-20)/(120-20) = 50%
    expect(
      computeKeyResultProgress(
        kr({ startValue: 20, targetValue: 120, currentValue: 70 }),
      ),
    ).toBe(50);
  });

  it("PERCENT usa a mesma fórmula proporcional", () => {
    expect(
      computeKeyResultProgress(
        kr({ metricType: "PERCENT", startValue: 0, targetValue: 80, currentValue: 40 }),
      ),
    ).toBe(50);
  });

  it("CURRENCY usa a mesma fórmula proporcional", () => {
    expect(
      computeKeyResultProgress(
        kr({
          metricType: "CURRENCY",
          startValue: 1000,
          targetValue: 5000,
          currentValue: 3000,
        }),
      ),
    ).toBe(50);
  });
});

describe("computeKeyResultProgress — alvo decrescente (reduzir)", () => {
  it("reduzir incidentes: start 10 → target 0, current 5 → 50%", () => {
    expect(
      computeKeyResultProgress(
        kr({ startValue: 10, targetValue: 0, currentValue: 5 }),
      ),
    ).toBe(50);
  });

  it("reduzir: atingiu o alvo (current 0) → 100%", () => {
    expect(
      computeKeyResultProgress(
        kr({ startValue: 10, targetValue: 0, currentValue: 0 }),
      ),
    ).toBe(100);
  });

  it("reduzir: passou do alvo (current negativo) satura 100%", () => {
    expect(
      computeKeyResultProgress(
        kr({ startValue: 10, targetValue: 0, currentValue: -3 }),
      ),
    ).toBe(100);
  });

  it("reduzir: piorou (current acima do start) → 0%", () => {
    expect(
      computeKeyResultProgress(
        kr({ startValue: 10, targetValue: 0, currentValue: 12 }),
      ),
    ).toBe(0);
  });

  it("valores negativos em ambos os extremos", () => {
    // start -50, target -10, current -30 → (-30 - -50)/(-10 - -50) = 20/40 = 50%
    expect(
      computeKeyResultProgress(
        kr({ startValue: -50, targetValue: -10, currentValue: -30 }),
      ),
    ).toBe(50);
  });
});

describe("computeKeyResultProgress — BOOLEAN binário", () => {
  it("alvo 1, atual 0 → 0%", () => {
    expect(
      computeKeyResultProgress(
        kr({ metricType: "BOOLEAN", startValue: 0, targetValue: 1, currentValue: 0 }),
      ),
    ).toBe(0);
  });

  it("alvo 1, atual 1 → 100%", () => {
    expect(
      computeKeyResultProgress(
        kr({ metricType: "BOOLEAN", startValue: 0, targetValue: 1, currentValue: 1 }),
      ),
    ).toBe(100);
  });

  it("alvo 0 (manter zerado), atual 0 → 100%", () => {
    expect(
      computeKeyResultProgress(
        kr({ metricType: "BOOLEAN", startValue: 0, targetValue: 0, currentValue: 0 }),
      ),
    ).toBe(100);
  });

  it("BOOLEAN nunca é proporcional (atual 0.5, alvo 1 → 0%)", () => {
    expect(
      computeKeyResultProgress(
        kr({ metricType: "BOOLEAN", targetValue: 1, currentValue: 0.5 }),
      ),
    ).toBe(0);
  });
});

describe("computeKeyResultProgress — borda start == target", () => {
  it("start == target e current abaixo → 0%", () => {
    expect(
      computeKeyResultProgress(
        kr({ startValue: 50, targetValue: 50, currentValue: 40 }),
      ),
    ).toBe(0);
  });

  it("start == target e current atinge o alvo → 100%", () => {
    expect(
      computeKeyResultProgress(
        kr({ startValue: 50, targetValue: 50, currentValue: 50 }),
      ),
    ).toBe(100);
  });

  it("start == target == 0 e current 0 → 100% (já atingido)", () => {
    expect(
      computeKeyResultProgress(
        kr({ startValue: 0, targetValue: 0, currentValue: 0 }),
      ),
    ).toBe(100);
  });
});

describe("computeObjectiveProgress — rollup (média dos KRs)", () => {
  it("objetivo sem KR → 0%", () => {
    expect(computeObjectiveProgress([])).toBe(0);
  });

  it("média simples dos progressos dos KRs", () => {
    // 100% + 0% + 50% = 150 / 3 = 50%
    const p = computeObjectiveProgress([
      kr({ currentValue: 100 }),
      kr({ currentValue: 0 }),
      kr({ currentValue: 50 }),
    ]);
    expect(p).toBe(50);
  });

  it("mistura de métricas no rollup", () => {
    // BOOLEAN atingido (100) + NUMBER na metade (50) = 150/2 = 75
    const p = computeObjectiveProgress([
      kr({ metricType: "BOOLEAN", targetValue: 1, currentValue: 1 }),
      kr({ currentValue: 50 }),
    ]);
    expect(p).toBe(75);
  });

  it("arredonda o rollup para inteiro", () => {
    // 100 + 0 = 100/2 = 50; 33 + 0 + 0 = 11 (arred.)
    const p = computeObjectiveProgress([
      kr({ currentValue: 1, targetValue: 3 }), // 33
      kr({ currentValue: 0 }), // 0
      kr({ currentValue: 0 }), // 0
    ]);
    expect(p).toBe(11);
  });
});
