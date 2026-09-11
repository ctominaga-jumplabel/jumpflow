import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * O build do Railway roda `db:generate && build` — ele NÃO aplica migrations.
 * Então o código do COE pode chegar em produção antes do schema. Estes testes
 * fixam as duas metades do contrato: tabela ausente degrada com aviso honesto,
 * e QUALQUER outro erro de banco continua subindo (um incidente não pode virar
 * "lista vazia").
 */

const coeMemberFindMany = vi.fn();
const coeMemberCount = vi.fn();
const coeSquadFindMany = vi.fn();
const consultantFindMany = vi.fn();
const projectFindUnique = vi.fn();
const skillFindMany = vi.fn();

/** Erro Prisma mínimo com `code`, reconhecido por `instanceof`. */
class FakePrismaKnownError extends Error {
  constructor(readonly code: string) {
    super(`prisma error ${code}`);
  }
}

vi.mock("@jumpflow/database", () => ({
  Prisma: { PrismaClientKnownRequestError: FakePrismaKnownError },
  prisma: {
    coeMember: {
      findMany: (...a: unknown[]) => coeMemberFindMany(...a),
      count: (...a: unknown[]) => coeMemberCount(...a),
    },
    coeSquad: { findMany: (...a: unknown[]) => coeSquadFindMany(...a) },
    consultant: { findMany: (...a: unknown[]) => consultantFindMany(...a) },
    project: { findUnique: (...a: unknown[]) => projectFindUnique(...a) },
    skill: { findMany: (...a: unknown[]) => skillFindMany(...a) },
  },
}));

vi.mock("./config", () => ({ isDatabaseConfigured: () => true }));

const ADMIN = { id: "u1", name: "Admin", email: "a@b.c", roles: ["ADMIN"] };

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

/** P2021 = tabela inexistente; P2022 = coluna inexistente. */
const PENDING_CODES = ["P2021", "P2022"];

describe("COE — schema ainda não migrado", () => {
  it.each(PENDING_CODES)(
    "listCoeMembers devolve vazio em %s em vez de estourar",
    async (code) => {
      coeMemberFindMany.mockRejectedValue(new FakePrismaKnownError(code));
      const { listCoeMembers } = await import("./coe");
      await expect(listCoeMembers()).resolves.toEqual([]);
    },
  );

  it.each(PENDING_CODES)("listCoeSquads devolve vazio em %s", async (code) => {
    coeSquadFindMany.mockRejectedValue(new FakePrismaKnownError(code));
    const { listCoeSquads } = await import("./coe");
    await expect(listCoeSquads()).resolves.toEqual([]);
  });

  it("listCoeCandidateOptions devolve vazio quando a relação não existe", async () => {
    consultantFindMany.mockRejectedValue(new FakePrismaKnownError("P2021"));
    const { listCoeCandidateOptions } = await import("./coe");
    await expect(listCoeCandidateOptions()).resolves.toEqual([]);
  });

  it("getCoeComposition devolve bundle vazio COM aviso do que falta", async () => {
    projectFindUnique.mockRejectedValue(new FakePrismaKnownError("P2021"));
    const { getCoeComposition, SCHEMA_PENDING_NOTICE } = await import("./coe");
    const { coeCompositionQuerySchema } = await import("@/lib/coe/schemas");

    const bundle = await getCoeComposition(
      ADMIN as never,
      coeCompositionQuerySchema.parse({ projectId: "p1" }),
    );

    expect(bundle.composition.assignments).toEqual([]);
    expect(bundle.notice).toBe(SCHEMA_PENDING_NOTICE);
    // Não é dado de demonstração: o banco existe, só falta a migration.
    expect(bundle.fromMock).toBe(false);
    // E o aviso diz o que fazer, não apenas que algo falhou.
    expect(bundle.notice).toContain("db:deploy");
  });
});

describe("COE — erros de banco de verdade continuam subindo", () => {
  it("não engole um código Prisma diferente", async () => {
    coeMemberFindMany.mockRejectedValue(new FakePrismaKnownError("P1001"));
    const { listCoeMembers } = await import("./coe");
    await expect(listCoeMembers()).rejects.toThrow("P1001");
  });

  it("não engole um erro genérico", async () => {
    coeSquadFindMany.mockRejectedValue(new Error("conexão caiu"));
    const { listCoeSquads } = await import("./coe");
    await expect(listCoeSquads()).rejects.toThrow("conexão caiu");
  });

  it("não engole erro na composição", async () => {
    projectFindUnique.mockRejectedValue(new Error("timeout"));
    const { getCoeComposition } = await import("./coe");
    const { coeCompositionQuerySchema } = await import("@/lib/coe/schemas");
    await expect(
      getCoeComposition(
        ADMIN as never,
        coeCompositionQuerySchema.parse({ projectId: "p1" }),
      ),
    ).rejects.toThrow("timeout");
  });
});
