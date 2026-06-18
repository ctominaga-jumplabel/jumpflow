import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-action tests for the auto-approval rule invariant: registering (or
 * reactivating) a consultant-level rule inactivates the project-level rule, and
 * the project rule cannot be reactivated while an active consultant rule exists.
 * Stateful in-memory Prisma mock, same pattern as sibling projetos action tests.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

const h = vi.hoisted(() => {
  const store = {
    projectRule: null as { id: string; projectId: string; active: boolean } | null,
    consultantRules: [] as {
      id: string;
      projectId: string;
      consultantId: string;
      active: boolean;
    }[],
    allocations: [] as { projectId: string; consultantId: string }[],
    audits: [] as Record<string, unknown>[],
    users: [{ id: "user-1", name: "Sam", email: "sam@jumplabel.com.br" }],
    currentUser: {
      id: "dev-user",
      name: "Sam",
      email: "sam@jumplabel.com.br",
      roles: ["ADMIN"] as string[],
    },
    seq: 0,
  };
  const nextId = () => `car-${++store.seq}`;

  const prismaMock = {
    user: {
      findUnique: async ({ where }: { where: Where }) =>
        store.users.find((u) => u.id === where.id || u.email === where.email) ??
        null,
    },
    allocation: {
      findMany: async ({ where }: { where: Where }) =>
        store.allocations
          .filter(
            (a) =>
              a.projectId === where.projectId &&
              (!where.consultantId?.in ||
                where.consultantId.in.includes(a.consultantId)),
          )
          .map((a) => ({ consultantId: a.consultantId })),
      findFirst: async ({ where }: { where: Where }) =>
        store.allocations.find(
          (a) =>
            a.projectId === where.projectId &&
            a.consultantId === where.consultantId,
        ) ?? null,
    },
    projectAutoApprovalRule: {
      findUnique: async ({ where }: { where: Where }) =>
        store.projectRule && store.projectRule.projectId === where.projectId
          ? { ...store.projectRule }
          : null,
      update: async ({ where, data }: { where: Where; data: Where }) => {
        if (store.projectRule && store.projectRule.projectId === where.projectId) {
          Object.assign(store.projectRule, data);
        }
        return { ...store.projectRule };
      },
    },
    consultantAutoApprovalRule: {
      findMany: async ({ where }: { where: Where }) =>
        store.consultantRules
          .filter(
            (r) =>
              r.projectId === where.projectId &&
              (!where.consultantId?.in ||
                where.consultantId.in.includes(r.consultantId)),
          )
          .map((r) => ({ consultantId: r.consultantId })),
      count: async ({ where }: { where: Where }) =>
        store.consultantRules.filter(
          (r) =>
            r.projectId === where.projectId &&
            (where.active === undefined || r.active === where.active),
        ).length,
      createMany: async ({ data }: { data: Where[] }) => {
        for (const d of data) {
          store.consultantRules.push({
            id: nextId(),
            projectId: d.projectId,
            consultantId: d.consultantId,
            active: true,
          });
        }
        return { count: data.length };
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
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => h.store.currentUser),
  requireRole: vi.fn(async () => h.store.currentUser),
}));

import {
  linkConsultantsToAutoApproval,
  setProjectAutoApprovalActive,
} from "./actions";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.seq = 0;
  h.store.projectRule = {
    id: "proj-rule-1",
    projectId: "p1",
    active: true,
  };
  h.store.consultantRules = [];
  h.store.allocations = [{ projectId: "p1", consultantId: "c1" }];
  h.store.audits = [];
});

afterEach(() => vi.unstubAllEnvs());

describe("linkConsultantsToAutoApproval — inativa a regra do projeto", () => {
  it("ao vincular um consultor, cria a regra do consultor e inativa a regra do projeto", async () => {
    const result = await linkConsultantsToAutoApproval({
      projectId: "p1",
      consultantIds: ["c1"],
    });
    expect(result.ok).toBe(true);
    expect(h.store.consultantRules).toHaveLength(1);
    // A regra do projeto foi inativada explicitamente.
    expect(h.store.projectRule?.active).toBe(false);
    expect(
      h.store.audits.some(
        (a) => a.action === "PROJECT_AUTO_APPROVAL_RULE_DEACTIVATED",
      ),
    ).toBe(true);
  });

  it("não inativa nada quando o consultor não está alocado (nada criado)", async () => {
    h.store.allocations = []; // c1 não alocado
    const result = await linkConsultantsToAutoApproval({
      projectId: "p1",
      consultantIds: ["c1"],
    });
    expect(result.ok).toBe(true);
    expect(h.store.consultantRules).toHaveLength(0);
    expect(h.store.projectRule?.active).toBe(true); // intacta
  });
});

describe("setProjectAutoApprovalActive — guarda do modo exclusivo", () => {
  it("recusa reativar a regra do projeto enquanto houver regra de consultor ativa", async () => {
    h.store.projectRule = { id: "proj-rule-1", projectId: "p1", active: false };
    h.store.consultantRules = [
      { id: "car-1", projectId: "p1", consultantId: "c1", active: true },
    ];
    const result = await setProjectAutoApprovalActive({
      projectId: "p1",
      active: true,
    });
    expect(result).toMatchObject({ ok: false, error: "INVALID_INPUT" });
    expect(h.store.projectRule?.active).toBe(false); // permanece inativa
  });

  it("permite reativar quando não há regra de consultor ativa", async () => {
    h.store.projectRule = { id: "proj-rule-1", projectId: "p1", active: false };
    h.store.consultantRules = [
      { id: "car-1", projectId: "p1", consultantId: "c1", active: false },
    ];
    const result = await setProjectAutoApprovalActive({
      projectId: "p1",
      active: true,
    });
    expect(result.ok).toBe(true);
    expect(h.store.projectRule?.active).toBe(true);
  });
});
