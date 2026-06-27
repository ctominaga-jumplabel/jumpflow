import { describe, expect, it } from "vitest";
import type { RoleName } from "@/lib/auth/roles";
import {
  CHECKPOINT_MANAGE_ROLES,
  CHECKPOINT_READ_ROLES,
  CHECKPOINT_WRITE_ROLES,
  canManageCheckpoint,
  canRegisterCheckpoint,
  canViewCheckpointRaw,
  resolveCheckpointReadScope,
  type CheckpointViewer,
} from "./visibility";

const viewer = (over: Partial<CheckpointViewer>): CheckpointViewer => ({
  roles: [],
  userId: null,
  consultantId: null,
  ...over,
});

describe("canRegisterCheckpoint — SÓ GESTOR registra", () => {
  it("permite gestores: ADMIN, PEOPLE, AREA_MANAGER, PROJECT_MANAGER", () => {
    for (const role of CHECKPOINT_WRITE_ROLES) {
      expect(canRegisterCheckpoint([role])).toBe(true);
    }
  });

  it("nega CONSULTANT, SALES e FINANCE", () => {
    expect(canRegisterCheckpoint(["CONSULTANT"])).toBe(false);
    expect(canRegisterCheckpoint(["SALES"])).toBe(false);
    expect(canRegisterCheckpoint(["FINANCE"])).toBe(false);
  });

  it("nega quando o usuário não tem papel", () => {
    expect(canRegisterCheckpoint([])).toBe(false);
  });

  it("permite quando acumula um papel de escrita entre vários", () => {
    expect(canRegisterCheckpoint(["CONSULTANT", "PROJECT_MANAGER"])).toBe(true);
  });
});

describe("resolveCheckpointReadScope — escopo por papel", () => {
  it("ADMIN vê tudo (kind=all)", () => {
    expect(
      resolveCheckpointReadScope(viewer({ roles: ["ADMIN"], userId: "u1" })),
    ).toEqual({ kind: "all" });
  });

  it("PEOPLE vê tudo (kind=all)", () => {
    expect(
      resolveCheckpointReadScope(viewer({ roles: ["PEOPLE"], userId: "u1" })),
    ).toEqual({ kind: "all" });
  });

  it("AREA_MANAGER recebe escopo de gestor por managerUserId", () => {
    expect(
      resolveCheckpointReadScope(
        viewer({ roles: ["AREA_MANAGER"], userId: "mgr1" }),
      ),
    ).toEqual({ kind: "manager", managerUserId: "mgr1" });
  });

  it("PROJECT_MANAGER recebe escopo de gestor por managerUserId", () => {
    expect(
      resolveCheckpointReadScope(
        viewer({ roles: ["PROJECT_MANAGER"], userId: "pm1" }),
      ),
    ).toEqual({ kind: "manager", managerUserId: "pm1" });
  });

  it("CONSULTANT (sem gestão) só vê o próprio sujeito (SHARED no DB layer)", () => {
    expect(
      resolveCheckpointReadScope(
        viewer({ roles: ["CONSULTANT"], userId: "u1", consultantId: "c1" }),
      ),
    ).toEqual({ kind: "subject", subjectConsultantId: "c1" });
  });

  it("o papel mais forte vence: ADMIN+CONSULTANT vê tudo", () => {
    expect(
      resolveCheckpointReadScope(
        viewer({
          roles: ["CONSULTANT", "ADMIN"],
          userId: "u1",
          consultantId: "c1",
        }),
      ),
    ).toEqual({ kind: "all" });
  });

  it("gestor vence consultant: PROJECT_MANAGER+CONSULTANT recebe manager", () => {
    expect(
      resolveCheckpointReadScope(
        viewer({
          roles: ["CONSULTANT", "PROJECT_MANAGER"],
          userId: "pm1",
          consultantId: "c9",
        }),
      ),
    ).toEqual({ kind: "manager", managerUserId: "pm1" });
  });

  it("sem userId nem consultantId resolvido → none (nunca vaza)", () => {
    expect(
      resolveCheckpointReadScope(viewer({ roles: ["CONSULTANT"] })),
    ).toEqual({ kind: "none" });
  });

  it("gestor sem userId resolvido cai para none (não vira escopo amplo)", () => {
    expect(
      resolveCheckpointReadScope(viewer({ roles: ["AREA_MANAGER"] })),
    ).toEqual({ kind: "none" });
  });

  it("papel sem leitura/gestão (SALES) cai para none — não registra nem lê", () => {
    expect(
      resolveCheckpointReadScope(viewer({ roles: ["SALES"], userId: "u7" })),
    ).toEqual({ kind: "none" });
  });
});

describe("canManageCheckpoint — editar/visibilidade/arquivar por linha", () => {
  it("ADMIN gerencia qualquer checkpoint", () => {
    expect(
      canManageCheckpoint({ roles: ["ADMIN"], userId: "u1" }, "outro-autor"),
    ).toBe(true);
  });

  it("PEOPLE gerencia qualquer checkpoint", () => {
    expect(
      canManageCheckpoint({ roles: ["PEOPLE"], userId: "u1" }, "outro-autor"),
    ).toBe(true);
  });

  it("o autor (managerUserId) gerencia o próprio checkpoint", () => {
    expect(
      canManageCheckpoint({ roles: ["PROJECT_MANAGER"], userId: "pm1" }, "pm1"),
    ).toBe(true);
  });

  it("um gestor NÃO autor não gerencia checkpoint de outro", () => {
    expect(
      canManageCheckpoint({ roles: ["PROJECT_MANAGER"], userId: "pm1" }, "pm2"),
    ).toBe(false);
    expect(
      canManageCheckpoint({ roles: ["AREA_MANAGER"], userId: "am1" }, "pm2"),
    ).toBe(false);
  });

  it("não gerencia quando a linha não tem autor (manager removido)", () => {
    expect(
      canManageCheckpoint({ roles: ["PROJECT_MANAGER"], userId: "pm1" }, null),
    ).toBe(false);
  });

  it("não gerencia quando o viewer não tem userId resolvido", () => {
    expect(
      canManageCheckpoint({ roles: ["PROJECT_MANAGER"], userId: null }, "pm1"),
    ).toBe(false);
  });
});

describe("canViewCheckpointRaw — consultor NÃO vê o cru, nem em SHARED", () => {
  const row = {
    managerUserId: "pm1",
    subjectConsultantId: "c1",
  };

  it("ADMIN/PEOPLE veem o cru", () => {
    expect(
      canViewCheckpointRaw({ roles: ["ADMIN"], userId: "x", consultantId: null }, row),
    ).toBe(true);
    expect(
      canViewCheckpointRaw({ roles: ["PEOPLE"], userId: "x", consultantId: null }, row),
    ).toBe(true);
  });

  it("o autor (managerUserId) vê o cru", () => {
    expect(
      canViewCheckpointRaw(
        { roles: ["PROJECT_MANAGER"], userId: "pm1", consultantId: null },
        row,
      ),
    ).toBe(true);
  });

  it("gestor responsável no escopo vê o cru (managedInScope)", () => {
    expect(
      canViewCheckpointRaw(
        { roles: ["PROJECT_MANAGER"], userId: "pm2", consultantId: null },
        { ...row, managedInScope: true },
      ),
    ).toBe(true);
  });

  it("gestor FORA do escopo e não autor NÃO vê o cru", () => {
    expect(
      canViewCheckpointRaw(
        { roles: ["PROJECT_MANAGER"], userId: "pm2", consultantId: null },
        { ...row, managedInScope: false },
      ),
    ).toBe(false);
  });

  it("o consultor avaliado NUNCA vê o cru (nem dono do registro)", () => {
    expect(
      canViewCheckpointRaw(
        { roles: ["CONSULTANT"], userId: "u-c1", consultantId: "c1" },
        { ...row, managedInScope: false },
      ),
    ).toBe(false);
  });
});

describe("constantes de papel", () => {
  it("READ inclui CONSULTANT, WRITE não", () => {
    expect(CHECKPOINT_READ_ROLES).toContain("CONSULTANT");
    expect(CHECKPOINT_WRITE_ROLES).not.toContain("CONSULTANT");
  });

  it("MANAGE é apenas ADMIN/PEOPLE", () => {
    expect([...CHECKPOINT_MANAGE_ROLES].sort()).toEqual(["ADMIN", "PEOPLE"]);
  });

  it("nenhum papel de escrita está fora do catálogo de papéis", () => {
    const known: RoleName[] = [
      "ADMIN",
      "CONSULTANT",
      "PROJECT_MANAGER",
      "AREA_MANAGER",
      "FINANCE",
      "PEOPLE",
      "SALES",
    ];
    for (const role of CHECKPOINT_WRITE_ROLES) {
      expect(known).toContain(role);
    }
  });
});
