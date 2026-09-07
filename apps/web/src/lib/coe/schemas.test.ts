import { describe, expect, it } from "vitest";
import {
  MAX_SLOTS,
  coeCompositionQuerySchema,
  coeMemberAddSchema,
  coeSquadSaveSchema,
} from "./schemas";

/**
 * A validação do COE roda no SERVIDOR. Estes testes cobrem os defaults (para a
 * tela abrir sem query) e as duas travas de integridade da proposta, que
 * precisam falhar como validação — nunca como erro de constraint do banco.
 */

function member(over: Record<string, unknown> = {}) {
  return {
    consultantId: "c1",
    slotKey: "s1",
    slotLabel: "Frente 1",
    slotScore: 80,
    ...over,
  };
}

describe("coeCompositionQuerySchema", () => {
  it("abre com defaults seguros sem nenhum parâmetro", () => {
    const parsed = coeCompositionQuerySchema.parse({});
    expect(parsed.scope).toBe("COE");
    expect(parsed.weeks).toBe(4);
    expect(parsed.skills).toEqual([]);
  });

  it("rejeita janela fora dos limites", () => {
    expect(coeCompositionQuerySchema.safeParse({ weeks: 0 }).success).toBe(
      false,
    );
    expect(coeCompositionQuerySchema.safeParse({ weeks: 27 }).success).toBe(
      false,
    );
  });

  it("rejeita data em formato inválido", () => {
    expect(
      coeCompositionQuerySchema.safeParse({ periodStart: "06/09/2026" })
        .success,
    ).toBe(false);
  });

  it("rejeita identificador com caractere fora do formato", () => {
    expect(
      coeCompositionQuerySchema.safeParse({ projectId: "abc; drop" }).success,
    ).toBe(false);
  });

  it("limita as frentes genéricas ao teto do módulo", () => {
    expect(
      coeCompositionQuerySchema.safeParse({ manualSlots: MAX_SLOTS + 1 })
        .success,
    ).toBe(false);
  });
});

describe("coeMemberAddSchema", () => {
  it("exige uma área de excelência com conteúdo", () => {
    expect(
      coeMemberAddSchema.safeParse({ consultantId: "c1", focusArea: " " })
        .success,
    ).toBe(false);
  });

  it("aceita observação ausente", () => {
    const parsed = coeMemberAddSchema.parse({
      consultantId: "c1",
      focusArea: "Dados & Analytics",
    });
    expect(parsed.note).toBeUndefined();
  });
});

describe("coeSquadSaveSchema", () => {
  it("aceita uma proposta consistente", () => {
    const parsed = coeSquadSaveSchema.safeParse({
      projectId: "p1",
      name: "Squad de arrancada",
      weeks: 4,
      members: [member(), member({ consultantId: "c2", slotKey: "s2" })],
    });
    expect(parsed.success).toBe(true);
  });

  it("recusa duas pessoas na mesma frente", () => {
    const parsed = coeSquadSaveSchema.safeParse({
      projectId: "p1",
      name: "Squad",
      members: [member(), member({ consultantId: "c2" })],
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toContain("uma pessoa");
  });

  it("recusa a mesma pessoa em duas frentes", () => {
    const parsed = coeSquadSaveSchema.safeParse({
      projectId: "p1",
      name: "Squad",
      members: [member(), member({ slotKey: "s2" })],
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toContain("duas frentes");
  });

  it("exige ao menos um consultor", () => {
    expect(
      coeSquadSaveSchema.safeParse({
        projectId: "p1",
        name: "Squad",
        members: [],
      }).success,
    ).toBe(false);
  });

  it("recusa score fora de 0..100", () => {
    expect(
      coeSquadSaveSchema.safeParse({
        projectId: "p1",
        name: "Squad",
        members: [member({ slotScore: 101 })],
      }).success,
    ).toBe(false);
  });
});
