import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-action tests para experiencia profissional declarada (P27), People/RH.
 * Prisma em memoria sobre ConsultantExperience + AuditEvent, mesmo padrao de
 * actions.test.ts. Cobre RBAC (so People), auditoria e criacao/edicao/remocao.
 */

interface ExpRec {
  id: string;
  consultantId: string;
  company: string;
  role: string;
  startDate: Date;
  endDate: Date | null;
  description: string | null;
  location: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

const h = vi.hoisted(() => {
  const store = {
    experiences: [] as ExpRec[],
    audits: [] as Record<string, unknown>[],
    currentUser: {
      id: "dev-user",
      name: "Ana Martins",
      email: "ana@jumplabel.com.br",
      roles: ["ADMIN"] as string[],
    },
    seq: 0,
  };
  const nextId = (prefix: string) => `${prefix}-${++store.seq}`;

  const prismaMock = {
    consultantExperience: {
      findUnique: async ({ where }: { where: Where }) =>
        store.experiences.find((e) => e.id === where.id) ?? null,
      create: async ({ data }: { data: Where }) => {
        const row: ExpRec = {
          id: nextId("exp"),
          consultantId: data.consultantId,
          company: data.company,
          role: data.role,
          startDate: data.startDate,
          endDate: data.endDate ?? null,
          description: data.description ?? null,
          location: data.location ?? null,
        };
        store.experiences.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        const row = store.experiences.find((e) => e.id === where.id)!;
        Object.assign(row, data);
        return { ...row };
      },
      delete: async ({ where }: { where: Where }) => {
        const idx = store.experiences.findIndex((e) => e.id === where.id);
        const [removed] = store.experiences.splice(idx, 1);
        return removed;
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.audits.push(data);
        return data;
      },
    },
  };
  return { store, prismaMock };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: {
    JsonNull: "__JsonNull__",
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(message: string, opts: { code: string }) {
        super(message);
        this.code = opts.code;
      }
    },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => h.store.currentUser),
  requireRole: vi.fn(async (roles: string | string[]) => {
    const required = Array.isArray(roles) ? roles : [roles];
    const allowed =
      required.length === 0 ||
      required.some((role) => h.store.currentUser.roles.includes(role));
    if (!allowed) {
      const redirectError = new Error("NEXT_REDIRECT");
      Object.assign(redirectError, {
        digest: "NEXT_REDIRECT;replace;/access-denied;307;",
      });
      throw redirectError;
    }
    return h.store.currentUser;
  }),
}));

vi.mock("@/lib/db/users", () => ({
  resolveDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

import {
  saveConsultantExperience,
  deleteConsultantExperience,
} from "./actions";

const CONSULTANT_ID = "seed-consultant-1";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.seq = 0;
  h.store.experiences = [];
  h.store.audits = [];
  h.store.currentUser = {
    id: "dev-user",
    name: "Ana Martins",
    email: "ana@jumplabel.com.br",
    roles: ["ADMIN"],
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("saveConsultantExperience (P27, People)", () => {
  it("cria uma experiencia atual (sem termino) e audita", async () => {
    const result = await saveConsultantExperience({
      consultantId: CONSULTANT_ID,
      company: "Empresa Atual",
      role: "Engenheira",
      startDate: "2020-01-01",
      endDate: "",
    });
    expect(result.ok).toBe(true);
    expect(h.store.experiences).toHaveLength(1);
    expect(h.store.experiences[0].endDate).toBeNull();
    expect(h.store.audits).toMatchObject([
      { action: "CONSULTANT_EXPERIENCE_CREATED" },
    ]);
  });

  it("edita uma experiencia existente (audita UPDATED)", async () => {
    const created = await saveConsultantExperience({
      consultantId: CONSULTANT_ID,
      company: "Empresa",
      role: "Analista",
      startDate: "2016-01-01",
      endDate: "2019-01-01",
    });
    expect(created.ok).toBe(true);
    const id = created.ok ? created.data.id : "";
    const updated = await saveConsultantExperience({
      id,
      consultantId: CONSULTANT_ID,
      company: "Empresa",
      role: "Analista Senior",
      startDate: "2016-01-01",
      endDate: "2019-01-01",
    });
    expect(updated.ok).toBe(true);
    expect(h.store.experiences[0].role).toBe("Analista Senior");
    expect(
      h.store.audits.some((a) => a.action === "CONSULTANT_EXPERIENCE_UPDATED"),
    ).toBe(true);
  });

  it("rejeita termino anterior ao inicio (INVALID_INPUT)", async () => {
    const result = await saveConsultantExperience({
      consultantId: CONSULTANT_ID,
      company: "X",
      role: "Y",
      startDate: "2020-01-01",
      endDate: "2019-01-01",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INVALID_INPUT");
  });

  it("nega escrita para quem nao e People (RBAC redireciona)", async () => {
    h.store.currentUser = {
      id: "u-consultant",
      name: "Bruno",
      email: "bruno@jumplabel.com.br",
      roles: ["CONSULTANT"],
    };
    await expect(
      saveConsultantExperience({
        consultantId: CONSULTANT_ID,
        company: "X",
        role: "Y",
        startDate: "2020-01-01",
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
  });
});

describe("deleteConsultantExperience (P27, People)", () => {
  it("remove e audita DELETED", async () => {
    const created = await saveConsultantExperience({
      consultantId: CONSULTANT_ID,
      company: "Empresa",
      role: "Analista",
      startDate: "2016-01-01",
    });
    const id = created.ok ? created.data.id : "";
    const result = await deleteConsultantExperience({ id });
    expect(result.ok).toBe(true);
    expect(h.store.experiences).toHaveLength(0);
    expect(
      h.store.audits.some((a) => a.action === "CONSULTANT_EXPERIENCE_DELETED"),
    ).toBe(true);
  });
});
