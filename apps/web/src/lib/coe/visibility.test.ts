import { describe, expect, it } from "vitest";
import {
  COE_CURATE_ROLES,
  COE_READ_ROLES,
  COE_SQUAD_WRITE_ROLES,
  canCurateCoe,
  canWriteCoeSquad,
  includeFinancialFactor,
} from "./visibility";
import type { RoleName } from "@/lib/auth/roles";

/**
 * As três fronteiras do COE são deliberadamente diferentes. Estes testes
 * congelam as decisões de RBAC para que uma edição futura no conjunto de papéis
 * seja consciente, e não um efeito colateral.
 */

describe("COE — fronteiras de leitura", () => {
  it("inclui quem aloca e o PEOPLE, que cura o núcleo", () => {
    expect(COE_READ_ROLES).toEqual(
      expect.arrayContaining([
        "ADMIN",
        "PEOPLE",
        "AREA_MANAGER",
        "PROJECT_MANAGER",
        "SALES",
      ]),
    );
  });

  it("não expõe o COE ao FINANCE nem ao CONSULTANT", () => {
    expect(COE_READ_ROLES).not.toContain("FINANCE");
    expect(COE_READ_ROLES).not.toContain("CONSULTANT");
  });
});

describe("canCurateCoe", () => {
  it("permite governança de talentos", () => {
    for (const role of COE_CURATE_ROLES) {
      expect(canCurateCoe([role])).toBe(true);
    }
  });

  it("não deixa quem só consome o núcleo decidir quem entra nele", () => {
    // PROJECT_MANAGER e SALES compõem times mas não curam — senão a curadoria
    // vira reflexo da demanda do projeto da vez.
    expect(canCurateCoe(["PROJECT_MANAGER"])).toBe(false);
    expect(canCurateCoe(["SALES"])).toBe(false);
  });

  it("nega sem nenhum papel", () => {
    expect(canCurateCoe([])).toBe(false);
  });
});

describe("canWriteCoeSquad", () => {
  it("permite quem responde pela operação do projeto", () => {
    for (const role of COE_SQUAD_WRITE_ROLES) {
      expect(canWriteCoeSquad([role])).toBe(true);
    }
  });

  it("PEOPLE lê e cura, mas não propõe staffing", () => {
    expect(canWriteCoeSquad(["PEOPLE"])).toBe(false);
  });

  it("nega sem nenhum papel", () => {
    expect(canWriteCoeSquad([])).toBe(false);
  });
});

describe("includeFinancialFactor", () => {
  it("libera o fator financeiro só para papéis financeiros", () => {
    expect(includeFinancialFactor(["ADMIN"])).toBe(true);
    expect(includeFinancialFactor(["AREA_MANAGER"])).toBe(true);
    expect(includeFinancialFactor(["FINANCE"])).toBe(true);
  });

  it("compõe time sem ver margem: PROJECT_MANAGER, SALES e PEOPLE", () => {
    expect(includeFinancialFactor(["PROJECT_MANAGER"])).toBe(false);
    expect(includeFinancialFactor(["SALES"])).toBe(false);
    expect(includeFinancialFactor(["PEOPLE"])).toBe(false);
  });

  it("é a união dos papéis do usuário", () => {
    const roles: RoleName[] = ["SALES", "FINANCE"];
    expect(includeFinancialFactor(roles)).toBe(true);
  });
});
