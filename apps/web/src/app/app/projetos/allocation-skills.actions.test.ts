import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-action tests for the allocation-skill flow (Fase D / Projetos).
 *
 * A skill is a tag on a specific Allocation (consultant on a project), drawn
 * from the catalog Skill (status ACTIVE). These tests assert the business
 * rules: catalog skill must be ACTIVE, the (allocationId, skillId) unique
 * constraint surfaces a friendly message, RBAC is enforced, audit events are
 * recorded, and removal works. ConsultantSkill is never touched.
 */

interface SkillRec {
  id: string;
  status: string;
}
interface AllocationRec {
  id: string;
}
interface AllocationSkillRec {
  id: string;
  allocationId: string;
  skillId: string;
  level: string | null;
  note: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

const h = vi.hoisted(() => {
  // Defined inside the hoisted block so the @jumpflow/database mock factory
  // (also hoisted) can reference it without a temporal-dead-zone error.
  class PrismaClientKnownRequestError extends Error {
    code = "P2002";
    constructor() {
      super("Unique constraint failed");
    }
  }

  const store = {
    skills: [] as SkillRec[],
    allocations: [] as AllocationRec[],
    allocationSkills: [] as AllocationSkillRec[],
    consultantSkills: [] as Record<string, unknown>[],
    users: [] as { id: string; name: string; email: string }[],
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
    user: {
      findUnique: async ({ where }: { where: Where }) => {
        const user = where.id
          ? store.users.find((u) => u.id === where.id)
          : store.users.find((u) => u.email === where.email);
        return user ? { ...user } : null;
      },
    },
    skill: {
      findUnique: async ({ where }: { where: Where }) => {
        const skill = store.skills.find((s) => s.id === where.id);
        return skill ? { ...skill } : null;
      },
    },
    allocation: {
      findUnique: async ({ where }: { where: Where }) => {
        const allocation = store.allocations.find((a) => a.id === where.id);
        return allocation ? { ...allocation } : null;
      },
    },
    allocationSkill: {
      findUnique: async ({ where }: { where: Where }) => {
        const link = store.allocationSkills.find((l) => l.id === where.id);
        return link ? { ...link } : null;
      },
      create: async ({ data }: { data: Where }) => {
        const duplicate = store.allocationSkills.some(
          (l) =>
            l.allocationId === data.allocationId && l.skillId === data.skillId,
        );
        if (duplicate) throw new PrismaClientKnownRequestError();
        const link: AllocationSkillRec = {
          id: nextId("alloc-skill"),
          allocationId: data.allocationId,
          skillId: data.skillId,
          level: data.level ?? null,
          note: data.note ?? null,
        };
        store.allocationSkills.push(link);
        return { ...link };
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        const link = store.allocationSkills.find((l) => l.id === where.id)!;
        Object.assign(link, data);
        return { ...link };
      },
      delete: async ({ where }: { where: Where }) => {
        const index = store.allocationSkills.findIndex((l) => l.id === where.id);
        const [removed] = store.allocationSkills.splice(index, 1);
        return removed;
      },
    },
    consultantSkill: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.consultantSkills.push(data);
        return data;
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.audits.push(data);
        return data;
      },
    },
  };

  return { store, prismaMock, PrismaClientKnownRequestError };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: {
    JsonNull: "__JsonNull__",
    PrismaClientKnownRequestError: h.PrismaClientKnownRequestError,
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
  // hasRole is re-exported by guards.ts; the actions import it from
  // route-permissions, so it is not needed here.
}));

import {
  addAllocationSkill,
  removeAllocationSkill,
  updateAllocationSkill,
} from "./actions";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  vi.stubEnv("AUTH_DEV_MODE", "true");
  h.store.seq = 0;
  h.store.currentUser = {
    id: "dev-user",
    name: "Ana Martins",
    email: "ana@jumplabel.com.br",
    roles: ["ADMIN"],
  };
  h.store.users = [
    { id: "user-1", name: "Ana Martins", email: "ana@jumplabel.com.br" },
  ];
  h.store.skills = [
    { id: "skill-active", status: "ACTIVE" },
    { id: "skill-archived", status: "ARCHIVED" },
  ];
  h.store.allocations = [{ id: "alloc-1" }];
  h.store.allocationSkills = [];
  h.store.consultantSkills = [];
  h.store.audits = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("addAllocationSkill", () => {
  it("tags an active catalog skill onto the allocation and audits it", async () => {
    const result = await addAllocationSkill({
      allocationId: "alloc-1",
      skillId: "skill-active",
      level: "ADVANCED",
      note: "Lider tecnico",
    });
    expect(result.ok).toBe(true);
    expect(h.store.allocationSkills).toHaveLength(1);
    expect(h.store.allocationSkills[0]).toMatchObject({
      allocationId: "alloc-1",
      skillId: "skill-active",
      level: "ADVANCED",
      note: "Lider tecnico",
    });
    expect(h.store.audits).toHaveLength(1);
    expect(h.store.audits[0]).toMatchObject({
      entityType: "AllocationSkill",
      action: "ALLOCATION_SKILL_ADDED",
    });
    // Never touches the consultant's own skill profile.
    expect(h.store.consultantSkills).toHaveLength(0);
  });

  it("rejects a non-ACTIVE catalog skill", async () => {
    const result = await addAllocationSkill({
      allocationId: "alloc-1",
      skillId: "skill-archived",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INVALID_INPUT");
    expect(h.store.allocationSkills).toHaveLength(0);
  });

  it("rejects an unknown catalog skill", async () => {
    const result = await addAllocationSkill({
      allocationId: "alloc-1",
      skillId: "skill-missing",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");
  });

  it("surfaces a friendly message on the unique (allocation, skill) violation", async () => {
    await addAllocationSkill({ allocationId: "alloc-1", skillId: "skill-active" });
    const result = await addAllocationSkill({
      allocationId: "alloc-1",
      skillId: "skill-active",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("INVALID_INPUT");
      expect(result.message).toMatch(/ja adicionada/i);
    }
    expect(h.store.allocationSkills).toHaveLength(1);
  });

  it("denies users without a project-write role", async () => {
    h.store.currentUser.roles = ["CONSULTANT"];
    await expect(
      addAllocationSkill({ allocationId: "alloc-1", skillId: "skill-active" }),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(h.store.allocationSkills).toHaveLength(0);
  });

  it("fails when the allocation does not exist", async () => {
    const result = await addAllocationSkill({
      allocationId: "alloc-missing",
      skillId: "skill-active",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");
  });
});

describe("updateAllocationSkill", () => {
  it("updates level and note and audits the change", async () => {
    await addAllocationSkill({ allocationId: "alloc-1", skillId: "skill-active" });
    const id = h.store.allocationSkills[0].id;
    h.store.audits = [];
    const result = await updateAllocationSkill({ id, level: "BASIC", note: "ok" });
    expect(result.ok).toBe(true);
    expect(h.store.allocationSkills[0]).toMatchObject({ level: "BASIC", note: "ok" });
    expect(h.store.audits[0]).toMatchObject({
      action: "ALLOCATION_SKILL_UPDATED",
    });
  });
});

describe("removeAllocationSkill", () => {
  it("removes the skill tag and audits it", async () => {
    await addAllocationSkill({ allocationId: "alloc-1", skillId: "skill-active" });
    const id = h.store.allocationSkills[0].id;
    h.store.audits = [];
    const result = await removeAllocationSkill({ id });
    expect(result.ok).toBe(true);
    expect(h.store.allocationSkills).toHaveLength(0);
    expect(h.store.audits[0]).toMatchObject({
      entityType: "AllocationSkill",
      action: "ALLOCATION_SKILL_REMOVED",
    });
  });

  it("returns NOT_FOUND for an unknown tag", async () => {
    const result = await removeAllocationSkill({ id: "alloc-skill-missing" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");
  });
});
