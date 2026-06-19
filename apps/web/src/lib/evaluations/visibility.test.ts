import { describe, expect, it } from "vitest";
import type { RoleName } from "@/lib/auth/roles";
import type { EvaluationResult } from "./types";
import {
  EVALUATION_MANAGE_ROLES,
  EVALUATION_READ_ROLES,
  PEER_MIN_FOR_DISCLOSURE,
  canAnswerResponse,
  canManageCycles,
  canViewResult,
  isValidCycleTransition,
  peerGroupIsDisclosable,
  redactResultForViewer,
  resolveResultScope,
  responseIsEditable,
  type EvaluationViewer,
} from "./visibility";

const viewer = (over: Partial<EvaluationViewer>): EvaluationViewer => ({
  roles: [],
  userId: null,
  consultantId: null,
  ...over,
});

describe("canManageCycles (US16.01, matriz §2)", () => {
  it("permite ADMIN e PEOPLE", () => {
    expect(canManageCycles(["ADMIN"])).toBe(true);
    expect(canManageCycles(["PEOPLE"])).toBe(true);
  });

  it("nega gestores e consultor (config de ciclo é só RH/admin)", () => {
    expect(canManageCycles(["AREA_MANAGER"])).toBe(false);
    expect(canManageCycles(["PROJECT_MANAGER"])).toBe(false);
    expect(canManageCycles(["CONSULTANT"])).toBe(false);
    expect(canManageCycles([])).toBe(false);
  });
});

describe("resolveResultScope — escopo de leitura de resultado (US16.04, §2)", () => {
  it("ADMIN/PEOPLE veem tudo", () => {
    expect(resolveResultScope(viewer({ roles: ["ADMIN"], userId: "u1" }))).toEqual({
      kind: "all",
    });
    expect(resolveResultScope(viewer({ roles: ["PEOPLE"], userId: "u1" }))).toEqual({
      kind: "all",
    });
  });

  it("AREA_MANAGER/PROJECT_MANAGER recebem escopo de gestor por managerUserId", () => {
    expect(
      resolveResultScope(viewer({ roles: ["AREA_MANAGER"], userId: "am1" })),
    ).toEqual({ kind: "manager", managerUserId: "am1" });
    expect(
      resolveResultScope(viewer({ roles: ["PROJECT_MANAGER"], userId: "pm1" })),
    ).toEqual({ kind: "manager", managerUserId: "pm1" });
  });

  it("CONSULTANT só vê o próprio resultado", () => {
    expect(
      resolveResultScope(
        viewer({ roles: ["CONSULTANT"], userId: "u1", consultantId: "c1" }),
      ),
    ).toEqual({ kind: "subject", subjectConsultantId: "c1" });
  });

  it("papel mais forte vence: ADMIN+CONSULTANT vê tudo", () => {
    expect(
      resolveResultScope(
        viewer({ roles: ["CONSULTANT", "ADMIN"], userId: "u1", consultantId: "c1" }),
      ),
    ).toEqual({ kind: "all" });
  });

  it("gestor sem userId resolvido cai para none (não vira escopo amplo)", () => {
    expect(resolveResultScope(viewer({ roles: ["AREA_MANAGER"] }))).toEqual({
      kind: "none",
    });
  });

  it("consultor sem consultantId resolvido → none (nunca vaza)", () => {
    expect(resolveResultScope(viewer({ roles: ["CONSULTANT"], userId: "u1" }))).toEqual(
      { kind: "none" },
    );
  });
});

describe("canViewResult — sujeito só após fechamento (LGPD §3, US16.04)", () => {
  it("gestão/gestor vê em qualquer estado", () => {
    for (const status of ["DRAFT", "OPEN", "CLOSED"] as const) {
      expect(
        canViewResult({ cycleStatus: status, isSubject: false, isManagementOrManager: true }),
      ).toBe(true);
    }
  });

  it("o avaliado só vê o próprio resultado quando CLOSED", () => {
    expect(
      canViewResult({ cycleStatus: "OPEN", isSubject: true, isManagementOrManager: false }),
    ).toBe(false);
    expect(
      canViewResult({ cycleStatus: "CLOSED", isSubject: true, isManagementOrManager: false }),
    ).toBe(true);
  });

  it("quem não é sujeito nem gestão não vê", () => {
    expect(
      canViewResult({ cycleStatus: "CLOSED", isSubject: false, isManagementOrManager: false }),
    ).toBe(false);
  });
});

describe("anonimato de peer (DP-05)", () => {
  it("um único par não é divulgável (não des-anonimizar)", () => {
    expect(peerGroupIsDisclosable(1)).toBe(false);
  });

  it("dois ou mais pares são divulgáveis", () => {
    expect(peerGroupIsDisclosable(PEER_MIN_FOR_DISCLOSURE)).toBe(true);
    expect(peerGroupIsDisclosable(5)).toBe(true);
  });

  it("zero pares é trivialmente divulgável (nada a esconder)", () => {
    expect(peerGroupIsDisclosable(0)).toBe(true);
  });
});

describe("redactResultForViewer — supressão de PEER único para o sujeito (DP-05)", () => {
  const baseResult = (
    raterCountByRelationship: EvaluationResult["raterCountByRelationship"],
  ): EvaluationResult => ({
    evaluationId: "ev1",
    cycleId: "cy1",
    cycleName: "Ciclo 2026",
    cycleType: "FULL_360",
    cycleStatus: "CLOSED",
    periodEnd: "2026-06-30T00:00:00.000Z",
    subjectConsultantId: "c1",
    subjectConsultantName: "Ana",
    profileName: "Dev Pleno",
    radar: [
      {
        skillId: "s1",
        skillName: "React",
        skillType: "TECHNICAL",
        averageScore: 4,
        sampleCount: 3,
      },
      {
        skillId: "s2",
        skillName: "Comunicação",
        skillType: "BEHAVIORAL",
        averageScore: 3.5,
        sampleCount: 3,
      },
    ],
    gap: [],
    raterCountByRelationship,
  });

  it("sujeito com EXATAMENTE 1 par: suprime PEER e zera sampleCount do radar", () => {
    const result = baseResult({ SELF: 1, MANAGER: 1, PEER: 1 });
    const redacted = redactResultForViewer(result, {
      isSubject: true,
      peerCount: 1,
    });
    expect(redacted.raterCountByRelationship.PEER).toBeUndefined();
    expect("PEER" in redacted.raterCountByRelationship).toBe(false);
    expect(redacted.raterCountByRelationship.SELF).toBe(1);
    expect(redacted.raterCountByRelationship.MANAGER).toBe(1);
    expect(redacted.radar.every((a) => a.sampleCount === 0)).toBe(true);
    // A média consolidada nunca muda — não identifica ninguém.
    expect(redacted.radar.map((a) => a.averageScore)).toEqual([4, 3.5]);
  });

  it("escopo de gestão recebe o resultado COMPLETO (PEER e sampleCount intactos)", () => {
    const result = baseResult({ SELF: 1, MANAGER: 1, PEER: 1 });
    const forManager = redactResultForViewer(result, {
      isSubject: false,
      peerCount: 1,
    });
    expect(forManager.raterCountByRelationship.PEER).toBe(1);
    expect(forManager.radar.every((a) => a.sampleCount === 3)).toBe(true);
    expect(forManager).toBe(result);
  });

  it("sujeito com 2+ pares: grupo divulgável, resultado preservado", () => {
    const result = baseResult({ SELF: 1, MANAGER: 1, PEER: 2 });
    const redacted = redactResultForViewer(result, {
      isSubject: true,
      peerCount: 2,
    });
    expect(redacted.raterCountByRelationship.PEER).toBe(2);
    expect(redacted.radar.every((a) => a.sampleCount === 3)).toBe(true);
  });

  it("sujeito sem pares: nada a suprimir", () => {
    const result = baseResult({ SELF: 1, MANAGER: 1 });
    const redacted = redactResultForViewer(result, {
      isSubject: true,
      peerCount: 0,
    });
    expect(redacted).toBe(result);
  });
});

describe("canAnswerResponse — só o próprio avaliador (LGPD §3)", () => {
  it("o rater designado pode responder a própria resposta", () => {
    expect(canAnswerResponse({ userId: "u1" }, "u1")).toBe(true);
  });

  it("ninguém responde a resposta de outro avaliador", () => {
    expect(canAnswerResponse({ userId: "u1" }, "u2")).toBe(false);
  });

  it("resposta sem rater designado não é respondível por viewer genérico", () => {
    expect(canAnswerResponse({ userId: "u1" }, null)).toBe(false);
  });

  it("viewer sem userId resolvido não responde nada", () => {
    expect(canAnswerResponse({ userId: null }, "u1")).toBe(false);
  });
});

describe("responseIsEditable — só com ciclo OPEN (US16.03)", () => {
  it("editável apenas em OPEN", () => {
    expect(responseIsEditable("OPEN")).toBe(true);
    expect(responseIsEditable("DRAFT")).toBe(false);
    expect(responseIsEditable("CLOSED")).toBe(false);
  });
});

describe("isValidCycleTransition — DRAFT→OPEN→CLOSED (US16.01)", () => {
  it("permite avançar uma etapa", () => {
    expect(isValidCycleTransition("DRAFT", "OPEN")).toBe(true);
    expect(isValidCycleTransition("OPEN", "CLOSED")).toBe(true);
  });

  it("nega pular etapas, retroceder e auto-transição", () => {
    expect(isValidCycleTransition("DRAFT", "CLOSED")).toBe(false);
    expect(isValidCycleTransition("CLOSED", "OPEN")).toBe(false);
    expect(isValidCycleTransition("OPEN", "DRAFT")).toBe(false);
    expect(isValidCycleTransition("DRAFT", "DRAFT")).toBe(false);
  });
});

describe("constantes de papel", () => {
  it("READ inclui CONSULTANT; MANAGE não", () => {
    expect(EVALUATION_READ_ROLES).toContain("CONSULTANT");
    expect(EVALUATION_MANAGE_ROLES).not.toContain("CONSULTANT");
  });

  it("MANAGE é apenas ADMIN/PEOPLE", () => {
    expect([...EVALUATION_MANAGE_ROLES].sort()).toEqual(["ADMIN", "PEOPLE"]);
  });

  it("nenhum papel de gestão de ciclo está fora do catálogo", () => {
    const known: RoleName[] = [
      "ADMIN",
      "CONSULTANT",
      "PROJECT_MANAGER",
      "AREA_MANAGER",
      "FINANCE",
      "PEOPLE",
      "SALES",
    ];
    for (const role of EVALUATION_MANAGE_ROLES) {
      expect(known).toContain(role);
    }
  });
});
