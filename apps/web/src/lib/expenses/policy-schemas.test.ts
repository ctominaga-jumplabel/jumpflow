import { describe, expect, it } from "vitest";
import { slugifyExpenseTypeCode } from "./policy-schemas";

describe("slugifyExpenseTypeCode", () => {
  it("uppercases and snake-cases a simple label", () => {
    expect(slugifyExpenseTypeCode("Estacionamento")).toBe("ESTACIONAMENTO");
  });

  it("strips accents (NFD) to ASCII", () => {
    expect(slugifyExpenseTypeCode("Alimentação em viagem")).toBe(
      "ALIMENTACAO_EM_VIAGEM",
    );
    expect(slugifyExpenseTypeCode("Pedágio")).toBe("PEDAGIO");
  });

  it("collapses punctuation/spaces into single underscores and trims edges", () => {
    expect(slugifyExpenseTypeCode("  Cursos / Capacitação  ")).toBe(
      "CURSOS_CAPACITACAO",
    );
    expect(slugifyExpenseTypeCode("Uber & 99")).toBe("UBER_99");
  });

  it("falls back to TIPO when nothing usable remains", () => {
    expect(slugifyExpenseTypeCode("—")).toBe("TIPO");
    expect(slugifyExpenseTypeCode("...")).toBe("TIPO");
  });
});
