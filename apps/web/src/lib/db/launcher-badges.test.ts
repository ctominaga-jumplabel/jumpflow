import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/lib/auth/types";
import type { RoleName } from "@/lib/auth/roles";

/**
 * Tests for the real launcher badge counters. A small in-memory Prisma mock
 * honors only the COUNT where-shapes these queries issue. Focus: counters are
 * scoped exactly like /app/aprovacoes and /app/financeiro (no overstating).
 */

interface ConsultantRec {
  id: string;
  userId: string | null;
  email: string;
}
interface ProjectRec {
  id: string;
  managerUserId: string | null;
}
interface EntryRec {
  consultantId: string;
  projectId: string;
  status: string;
}
interface ExpenseRec {
  consultantId: string;
  projectId: string;
  status: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

const h = vi.hoisted(() => {
  const store = {
    users: [] as { id: string; email: string }[],
    consultants: [] as ConsultantRec[],
    projects: [] as ProjectRec[],
    entries: [] as EntryRec[],
    expenses: [] as ExpenseRec[],
  };

  function projectMatches(projectId: string, where?: Where): boolean {
    if (!where?.project?.managerUserId) return true;
    const project = store.projects.find((p) => p.id === projectId);
    return project?.managerUserId === where.project.managerUserId;
  }

  function entryMatches(e: EntryRec, where: Where): boolean {
    if (where.consultantId && e.consultantId !== where.consultantId) return false;
    if (where.status && e.status !== where.status) return false;
    return projectMatches(e.projectId, where);
  }

  function expenseMatches(e: ExpenseRec, where: Where): boolean {
    if (where.OR) return where.OR.some((w: Where) => expenseMatches(e, w));
    if (where.consultantId && e.consultantId !== where.consultantId) return false;
    if (where.status && e.status !== where.status) return false;
    return projectMatches(e.projectId, where);
  }

  const prismaMock = {
    user: {
      findUnique: async ({ where }: { where: Where }) => {
        const user = where.id
          ? store.users.find((u) => u.id === where.id)
          : store.users.find((u) => u.email === where.email);
        return user ? { ...user } : null;
      },
    },
    consultant: {
      findUnique: async ({ where }: { where: Where }) => {
        const consultant =
          where.userId !== undefined
            ? store.consultants.find((c) => c.userId === where.userId)
            : store.consultants.find((c) => c.email === where.email);
        return consultant ? { ...consultant } : null;
      },
    },
    timeEntry: {
      count: async ({ where }: { where: Where }) =>
        store.entries.filter((e) => entryMatches(e, where)).length,
    },
    expense: {
      count: async ({ where }: { where: Where }) =>
        store.expenses.filter((e) => expenseMatches(e, where)).length,
    },
  };

  return { store, prismaMock };
});

vi.mock("@jumpflow/database", () => ({ prisma: h.prismaMock }));

import { getLauncherBadges } from "./launcher-badges";

function appUser(id: string, roles: RoleName[]): AppUser {
  const user = h.store.users.find((u) => u.id === id)!;
  return { id: user.id, name: "Teste", email: user.email, roles };
}

beforeEach(() => {
  // Production-like auth: ids match db rows, no dev e-mail fallback.
  vi.stubEnv("AUTH_DEV_MODE", "false");
  h.store.users = [
    { id: "user-con", email: "con@jumplabel.com.br" },
    { id: "user-pm", email: "pm@jumplabel.com.br" },
    { id: "user-pm-other", email: "otto@jumplabel.com.br" },
    { id: "user-fin", email: "fin@jumplabel.com.br" },
    { id: "user-admin", email: "admin@jumplabel.com.br" },
  ];
  h.store.consultants = [
    { id: "con-1", userId: "user-con", email: "con@jumplabel.com.br" },
  ];
  h.store.projects = [
    { id: "proj-1", managerUserId: "user-pm" },
    { id: "proj-other", managerUserId: "user-pm-other" },
  ];
  h.store.entries = [
    { consultantId: "con-1", projectId: "proj-1", status: "DRAFT" },
    { consultantId: "con-1", projectId: "proj-1", status: "DRAFT" },
    { consultantId: "con-1", projectId: "proj-1", status: "SUBMITTED" },
    { consultantId: "con-2", projectId: "proj-other", status: "SUBMITTED" },
  ];
  h.store.expenses = [
    { consultantId: "con-1", projectId: "proj-1", status: "DRAFT" },
    { consultantId: "con-1", projectId: "proj-1", status: "SUBMITTED" },
    { consultantId: "con-2", projectId: "proj-other", status: "MANAGER_APPROVED" },
    { consultantId: "con-1", projectId: "proj-1", status: "FINANCE_APPROVED" },
  ];
});

afterEach(() => vi.unstubAllEnvs());

describe("getLauncherBadges", () => {
  it("counts a consultant's own DRAFT hours and expenses (a enviar)", async () => {
    const badges = await getLauncherBadges(appUser("user-con", ["CONSULTANT"]));
    expect(badges.horas).toMatchObject({ count: 2, tone: "warning" });
    expect(badges.despesas).toMatchObject({ count: 1, tone: "warning" });
    // A pure consultant sees neither approval nor finance badges.
    expect(badges.aprovacoes).toBeUndefined();
    expect(badges.financeiro).toBeUndefined();
  });

  it("scopes a PROJECT_MANAGER's approval badge to managed projects", async () => {
    const badges = await getLauncherBadges(
      appUser("user-pm", ["PROJECT_MANAGER"]),
    );
    // proj-1 only: 1 SUBMITTED hour + 1 SUBMITTED expense; the proj-other
    // SUBMITTED items and the MANAGER_APPROVED finance-stage item are excluded.
    expect(badges.aprovacoes).toMatchObject({ count: 2, tone: "info" });
    expect(badges.financeiro).toBeUndefined();
  });

  it("gives FINANCE the finance expense stage plus the to-pay badge", async () => {
    const badges = await getLauncherBadges(appUser("user-fin", ["FINANCE"]));
    // Finance approval stage = MANAGER_APPROVED expenses (1), no hours.
    expect(badges.aprovacoes).toMatchObject({ count: 1, tone: "info" });
    // FINANCE_APPROVED awaiting payment (1).
    expect(badges.financeiro).toMatchObject({ count: 1, label: "a pagar" });
  });

  it("ADMIN sees the full pending queue across every project and stage", async () => {
    const badges = await getLauncherBadges(appUser("user-admin", ["ADMIN"]));
    // Hours SUBMITTED (2) + expenses SUBMITTED (1) + MANAGER_APPROVED (1) = 4.
    expect(badges.aprovacoes).toMatchObject({ count: 4 });
    expect(badges.financeiro).toMatchObject({ count: 1 });
  });

  it("omits badges with a zero count", async () => {
    h.store.entries = [];
    h.store.expenses = [];
    const badges = await getLauncherBadges(appUser("user-admin", ["ADMIN"]));
    expect(badges).toEqual({});
  });
});
