import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-action tests for VA/VR/VT voucher persistence (saveVoucherBenefits).
 * Stateful in-memory Prisma mock over ConsultantBenefit + AuditEvent, same
 * pattern as despesas/actions.test.ts.
 */

interface BenefitRec {
  id: string;
  consultantId: string;
  type: string;
  amount: number;
  startsAt: Date;
  endsAt: Date | null;
  note: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

const h = vi.hoisted(() => {
  const store = {
    benefits: [] as BenefitRec[],
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

  function matchBenefit(b: BenefitRec, where: Where): boolean {
    if (where.consultantId !== undefined && b.consultantId !== where.consultantId)
      return false;
    if (where.type !== undefined && b.type !== where.type) return false;
    if (where.endsAt !== undefined) {
      if (where.endsAt === null && b.endsAt !== null) return false;
    }
    return true;
  }

  const prismaMock = {
    consultantBenefit: {
      findMany: async ({
        where,
        orderBy,
      }: {
        where?: Where;
        orderBy?: Where;
      }) => {
        let rows = store.benefits.filter((b) =>
          where ? matchBenefit(b, where) : true,
        );
        if (orderBy?.startsAt === "desc") {
          rows = [...rows].sort(
            (a, b) => b.startsAt.getTime() - a.startsAt.getTime(),
          );
        }
        return rows.map((b) => ({ ...b }));
      },
      create: async ({ data }: { data: Where }) => {
        const benefit: BenefitRec = {
          id: nextId("ben"),
          consultantId: data.consultantId,
          type: data.type,
          amount: Number(data.amount),
          startsAt: data.startsAt,
          endsAt: data.endsAt ?? null,
          note: data.note ?? null,
        };
        store.benefits.push(benefit);
        return { ...benefit };
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        const benefit = store.benefits.find((b) => b.id === where.id)!;
        Object.assign(
          benefit,
          data,
          data.amount !== undefined ? { amount: Number(data.amount) } : {},
        );
        return { ...benefit };
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

import { saveVoucherBenefits } from "./actions";

const CONSULTANT_ID = "seed-consultant-1";

function activeOfType(type: string) {
  return h.store.benefits.filter((b) => b.type === type && b.endsAt === null);
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.seq = 0;
  h.store.benefits = [];
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

const baseInput = {
  consultantId: CONSULTANT_ID,
  startsAt: "2026-06-01",
};

describe("saveVoucherBenefits", () => {
  it("creates one active benefit per provided voucher type (VR/VA/VT)", async () => {
    const result = await saveVoucherBenefits({
      ...baseInput,
      vr: 660,
      va: 800,
      vt: 220,
    });
    expect(result.ok).toBe(true);
    expect(activeOfType("MEAL_VOUCHER")).toMatchObject([{ amount: 660 }]);
    expect(activeOfType("FOOD_VOUCHER")).toMatchObject([{ amount: 800 }]);
    expect(activeOfType("TRANSPORTATION_VOUCHER")).toMatchObject([
      { amount: 220 },
    ]);
    // One CREATE audit per voucher.
    expect(
      h.store.audits.filter((a) => a.action === "CONSULTANT_BENEFIT_CREATED"),
    ).toHaveLength(3);
  });

  it("does not create a row for a cleared/zero voucher", async () => {
    const result = await saveVoucherBenefits({ ...baseInput, vr: 660 });
    expect(result.ok).toBe(true);
    expect(activeOfType("MEAL_VOUCHER")).toHaveLength(1);
    expect(activeOfType("FOOD_VOUCHER")).toHaveLength(0);
    expect(activeOfType("TRANSPORTATION_VOUCHER")).toHaveLength(0);
  });

  it("updates the existing active row instead of duplicating", async () => {
    await saveVoucherBenefits({ ...baseInput, vr: 660 });
    const result = await saveVoucherBenefits({
      ...baseInput,
      startsAt: "2026-07-01",
      vr: 700,
    });
    expect(result.ok).toBe(true);
    const active = activeOfType("MEAL_VOUCHER");
    expect(active).toHaveLength(1);
    expect(active[0].amount).toBe(700);
    expect(active[0].startsAt.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(
      h.store.audits.filter((a) => a.action === "CONSULTANT_BENEFIT_UPDATED"),
    ).toHaveLength(1);
  });

  it("ends the active row when the voucher is cleared", async () => {
    await saveVoucherBenefits({ ...baseInput, vr: 660 });
    const result = await saveVoucherBenefits({
      ...baseInput,
      startsAt: "2026-08-01",
      vr: undefined,
    });
    expect(result.ok).toBe(true);
    expect(activeOfType("MEAL_VOUCHER")).toHaveLength(0);
    // The previously active row is now closed (endsAt set to the day before).
    const closed = h.store.benefits.find((b) => b.type === "MEAL_VOUCHER");
    expect(closed?.endsAt?.toISOString()).toBe("2026-07-31T00:00:00.000Z");
    expect(
      h.store.audits.filter((a) => a.action === "CONSULTANT_BENEFIT_ENDED"),
    ).toHaveLength(1);
  });

  it("collapses multiple stray active rows of one type into a single active row", async () => {
    // Two pre-existing active MEAL_VOUCHER rows (data drift).
    h.store.benefits.push(
      {
        id: "ben-a",
        consultantId: CONSULTANT_ID,
        type: "MEAL_VOUCHER",
        amount: 500,
        startsAt: new Date("2026-05-01T00:00:00.000Z"),
        endsAt: null,
        note: null,
      },
      {
        id: "ben-b",
        consultantId: CONSULTANT_ID,
        type: "MEAL_VOUCHER",
        amount: 400,
        startsAt: new Date("2026-04-01T00:00:00.000Z"),
        endsAt: null,
        note: null,
      },
    );
    const result = await saveVoucherBenefits({ ...baseInput, vr: 660 });
    expect(result.ok).toBe(true);
    const active = activeOfType("MEAL_VOUCHER");
    expect(active).toHaveLength(1);
    expect(active[0].amount).toBe(660);
  });

  it("fails closed with NO_DATABASE when no database is configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const result = await saveVoucherBenefits({ ...baseInput, vr: 660 });
    expect(result).toMatchObject({ ok: false, error: "NO_DATABASE" });
    expect(h.store.benefits).toHaveLength(0);
  });

  it("denies a non-financial role (access-denied redirect)", async () => {
    h.store.currentUser.roles = ["CONSULTANT"];
    await expect(
      saveVoucherBenefits({ ...baseInput, vr: 660 }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining("/access-denied"),
    });
    expect(h.store.benefits).toHaveLength(0);
  });
});
