import { describe, expect, it } from "vitest";

import {
  SENIORITY_FALLBACK,
  WARNING_SENIORITY_UNMAPPED,
  mapSeniority,
} from "./seniority-map";

/**
 * CRM -> JumpFlow seniority de/para (D6). Pure mapper: enum names + PT aliases,
 * case-insensitive / accent-insensitive; unknown => MID_LEVEL + warning.
 */
describe("mapSeniority", () => {
  it("matches the enum names directly", () => {
    for (const name of [
      "INTERN",
      "JUNIOR",
      "MID_LEVEL",
      "SENIOR",
      "SPECIALIST",
      "PRINCIPAL",
      "TRAINEE",
      "TECH_LEAD",
      "ARCHITECT",
      "COORDINATOR",
      "MANAGER",
    ] as const) {
      const result = mapSeniority(name);
      expect(result.seniority).toBe(name);
      expect(result.warning).toBeNull();
    }
  });

  it("maps common PT aliases", () => {
    expect(mapSeniority("PLENO").seniority).toBe("MID_LEVEL");
    expect(mapSeniority("SR").seniority).toBe("SENIOR");
    expect(mapSeniority("JR").seniority).toBe("JUNIOR");
    expect(mapSeniority("ESPECIALISTA").seniority).toBe("SPECIALIST");
    expect(mapSeniority("ESTAGIARIO").seniority).toBe("INTERN");
  });

  it("maps the 10 CRM catalog levels 1:1 (fidelidade total)", () => {
    // Estagiario e Trainee sao niveis DISTINTOS no CRM.
    expect(mapSeniority("Estagiário").seniority).toBe("INTERN");
    expect(mapSeniority("Trainee").seniority).toBe("TRAINEE");
    expect(mapSeniority("Tech Lead").seniority).toBe("TECH_LEAD");
    expect(mapSeniority("Arquiteto").seniority).toBe("ARCHITECT");
    expect(mapSeniority("Coordenador").seniority).toBe("COORDINATOR");
    expect(mapSeniority("Gerente").seniority).toBe("MANAGER");
    // todos os matches limpos nao geram warning
    expect(mapSeniority("Arquiteto").warning).toBeNull();
  });

  it("is case-insensitive and accent-insensitive with trim", () => {
    expect(mapSeniority("  sênior  ").seniority).toBe("SENIOR");
    expect(mapSeniority("especialista").seniority).toBe("SPECIALIST");
    expect(mapSeniority("Mid Level").seniority).toBe("MID_LEVEL");
    expect(mapSeniority("mid-level").seniority).toBe("MID_LEVEL");
    // all clean matches produce no warning
    expect(mapSeniority("  sênior  ").warning).toBeNull();
  });

  it("falls back to MID_LEVEL + warning (echoing the original value) for unknown", () => {
    const result = mapSeniority("Arquiteto Chefe");
    expect(result.seniority).toBe(SENIORITY_FALLBACK);
    expect(result.seniority).toBe("MID_LEVEL");
    expect(result.warning).toBe(
      `${WARNING_SENIORITY_UNMAPPED}:Arquiteto Chefe`,
    );
  });

  it("falls back for empty / null / undefined", () => {
    for (const value of ["", null, undefined]) {
      const result = mapSeniority(value);
      expect(result.seniority).toBe("MID_LEVEL");
      expect(result.warning).toBe(`${WARNING_SENIORITY_UNMAPPED}:`);
    }
  });
});
