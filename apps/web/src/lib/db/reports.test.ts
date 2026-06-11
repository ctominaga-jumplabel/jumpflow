import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the Relatorios read layer: scope resolution (RBAC union),
 * pure where builders and the financial-field gating of getHoursReport.
 * Stateful in-memory Prisma mock, same harness pattern as
 * lib/db/timesheet.test.ts.
 */

interface UserRec {
  id: string;
  name: string;
  email: string;
}
interface ConsultantRec {
  id: string;
  userId: string | null;
  email: string;
  name: string;
  status?: string;
}
interface ProjectRec {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  managerUserId: string | null;
  billingHourlyRate: number | null;
  status?: string;
  clientStatus?: string;
}
interface EntryRec {
  id: string;
  consultantId: string;
  projectId: string;
  date: Date;
  hours: number;
  activityType: string;
  billable: boolean;
  status: string;
  submittedAt: Date | null;
}
interface ExpenseRec {
  id: string;
  consultantId: string;
  projectId: string;
  date: Date;
  amount: number;
  description: string;
  invoiceNumber: string | null;
  status: string;
  submittedAt: Date | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

const h = vi.hoisted(() => {
  const store = {
    users: [] as UserRec[],
    consultants: [] as ConsultantRec[],
    projects: [] as ProjectRec[],
    entries: [] as EntryRec[],
    expenses: [] as ExpenseRec[],
    // Captures the last where passed to timeEntry.findMany / select.
    lastEntrySelect: undefined as Where | undefined,
    lastExpenseSelect: undefined as Where | undefined,
    lastExpenseWhere: undefined as Where | undefined,
    lastEntryOrderBy: undefined as Where[] | undefined,
    lastExpenseOrderBy: undefined as Where[] | undefined,
  };

  const projectOf = (id: string) => store.projects.find((p) => p.id === id)!;
  const consultantOf = (id: string) =>
    store.consultants.find((c) => c.id === id)!;

  /** Apply skip/take like Prisma (no-ops when undefined). */
  function paginate<T>(rows: T[], skip?: number, take?: number): T[] {
    const start = skip ?? 0;
    const end = take === undefined ? rows.length : start + take;
    return rows.slice(start, end);
  }

  /** Minimal multi-key sort honoring the first orderBy clause used in code. */
  function sortRows<T extends EntryRec | ExpenseRec>(
    rows: T[],
    orderBy?: Where[],
  ): T[] {
    if (!orderBy || orderBy.length === 0) return rows;
    const out = [...rows];
    out.sort((a, b) => {
      for (const clause of orderBy) {
        const [key] = Object.keys(clause);
        const dir: string = clause[key]?.name
          ? clause[key].name
          : clause[key];
        let av: unknown;
        let bv: unknown;
        if (key === "date") {
          av = (a as { date: Date }).date.getTime();
          bv = (b as { date: Date }).date.getTime();
        } else if (key === "hours") {
          av = (a as EntryRec).hours;
          bv = (b as EntryRec).hours;
        } else if (key === "amount") {
          av = (a as ExpenseRec).amount;
          bv = (b as ExpenseRec).amount;
        } else if (key === "status") {
          av = a.status;
          bv = b.status;
        } else if (key === "consultant") {
          av = consultantOf(a.consultantId).name;
          bv = consultantOf(b.consultantId).name;
        } else if (key === "project") {
          av = projectOf(a.projectId).name;
          bv = projectOf(b.projectId).name;
        } else {
          continue;
        }
        if (av! < bv!) return dir === "desc" ? 1 : -1;
        if (av! > bv!) return dir === "desc" ? -1 : 1;
      }
      return 0;
    });
    return out;
  }

  function matchEntry(e: EntryRec, where?: Where): boolean {
    if (!where) return true;
    if (where.consultantId && e.consultantId !== where.consultantId) {
      return false;
    }
    if (where.projectId && e.projectId !== where.projectId) return false;
    if (typeof where.status === "string" && e.status !== where.status) {
      return false;
    }
    if (where.status?.in && !where.status.in.includes(e.status)) return false;
    if (where.activityType && e.activityType !== where.activityType) {
      return false;
    }
    if (typeof where.billable === "boolean" && e.billable !== where.billable) {
      return false;
    }
    if (where.consultant?.status) {
      const c = store.consultants.find((x) => x.id === e.consultantId);
      if (c?.status !== where.consultant.status) return false;
    }
    if (where.date) {
      if (where.date.gte && e.date.getTime() < where.date.gte.getTime()) {
        return false;
      }
      if (where.date.lte && e.date.getTime() > where.date.lte.getTime()) {
        return false;
      }
    }
    if (where.project && !matchProject(e.projectId, where.project)) {
      return false;
    }
    return true;
  }

  /** Project relation match: managerUserId, clientId, status, client.status. */
  function matchProject(projectId: string, pw: Where): boolean {
    const p = projectOf(projectId);
    if (pw.managerUserId && p.managerUserId !== pw.managerUserId) return false;
    if (pw.clientId && p.clientId !== pw.clientId) return false;
    if (pw.status && p.status !== pw.status) return false;
    if (pw.client?.status && p.clientStatus !== pw.client.status) return false;
    return true;
  }

  function entryOut(e: EntryRec, select?: Where) {
    const p = projectOf(e.projectId);
    const project: Record<string, unknown> = {
      name: p.name,
      client: { name: p.clientName },
    };
    if (select?.project?.select?.billingHourlyRate) {
      project.billingHourlyRate = p.billingHourlyRate;
    }
    return {
      id: e.id,
      date: e.date,
      hours: e.hours,
      activityType: e.activityType,
      billable: e.billable,
      status: e.status,
      submittedAt: e.submittedAt,
      projectId: e.projectId,
      consultant: {
        name: store.consultants.find((c) => c.id === e.consultantId)!.name,
      },
      project,
    };
  }

  function matchExpense(x: ExpenseRec, where?: Where): boolean {
    if (!where) return true;
    if (where.consultantId && x.consultantId !== where.consultantId) {
      return false;
    }
    if (where.projectId && x.projectId !== where.projectId) return false;
    if (typeof where.status === "string" && x.status !== where.status) {
      return false;
    }
    if (where.status?.in && !where.status.in.includes(x.status)) return false;
    if (where.consultant?.status) {
      const c = store.consultants.find((y) => y.id === x.consultantId);
      if (c?.status !== where.consultant.status) return false;
    }
    if (where.date) {
      if (where.date.gte && x.date.getTime() < where.date.gte.getTime()) {
        return false;
      }
      if (where.date.lte && x.date.getTime() > where.date.lte.getTime()) {
        return false;
      }
    }
    if (where.project && !matchProject(x.projectId, where.project)) {
      return false;
    }
    return true;
  }

  function expenseOut(x: ExpenseRec) {
    const p = projectOf(x.projectId);
    return {
      id: x.id,
      date: x.date,
      amount: x.amount,
      description: x.description,
      invoiceNumber: x.invoiceNumber,
      status: x.status,
      submittedAt: x.submittedAt,
      projectId: x.projectId,
      consultant: {
        name: store.consultants.find((c) => c.id === x.consultantId)!.name,
      },
      project: { name: p.name, client: { name: p.clientName } },
      attachment: null,
    };
  }

  const prismaMock = {
    user: {
      findUnique: async ({ where }: { where: Where }) => {
        const u =
          where.id !== undefined
            ? store.users.find((x) => x.id === where.id)
            : store.users.find((x) => x.email === where.email);
        return u ? { ...u } : null;
      },
    },
    consultant: {
      findUnique: async ({ where }: { where: Where }) => {
        const c =
          where.userId !== undefined
            ? store.consultants.find((x) => x.userId === where.userId)
            : store.consultants.find((x) => x.email === where.email);
        return c ? { ...c } : null;
      },
      findMany: async () =>
        store.consultants.map((c) => ({ id: c.id, name: c.name })),
    },
    project: {
      findMany: async () =>
        store.projects.map((p) => ({
          id: p.id,
          name: p.name,
          clientId: p.clientId,
          client: { id: p.clientId, name: p.clientName },
        })),
    },
    timeEntry: {
      findMany: async ({
        where,
        select,
        orderBy,
        skip,
        take,
      }: {
        where?: Where;
        select?: Where;
        orderBy?: Where[];
        skip?: number;
        take?: number;
      }) => {
        store.lastEntrySelect = select;
        if (orderBy) store.lastEntryOrderBy = orderBy;
        const sorted = sortRows(
          store.entries.filter((e) => matchEntry(e, where)),
          orderBy,
        );
        const sliced = paginate(sorted, skip, take);
        return sliced.map((e) => entryOut(e, select));
      },
    },
    expense: {
      findMany: async ({
        where,
        select,
        orderBy,
        skip,
        take,
      }: {
        where?: Where;
        select?: Where;
        orderBy?: Where[];
        skip?: number;
        take?: number;
      }) => {
        store.lastExpenseWhere = where;
        store.lastExpenseSelect = select;
        if (orderBy) store.lastExpenseOrderBy = orderBy;
        const sorted = sortRows(
          store.expenses.filter((x) => matchExpense(x, where)),
          orderBy,
        );
        const sliced = paginate(sorted, skip, take);
        return sliced.map((x) => expenseOut(x));
      },
    },
    approval: {
      findMany: async () => [],
    },
  };

  return { store, prismaMock };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: {},
}));

import type { AppUser } from "@/lib/auth/types";
import type { RoleName } from "@/lib/auth/roles";
import type {
  ConsolidatedProject,
  ConsolidatedReport,
} from "@/lib/reports/types";
import {
  buildExpensesWhere,
  buildHoursWhere,
  getConsolidatedReport,
  getHoursReport,
  resolveReportScope,
  type ReportScope,
} from "./reports";

const user = (roles: RoleName[], over: Partial<AppUser> = {}): AppUser => ({
  id: "user-1",
  name: "Ana",
  email: "ana@jumplabel.com.br",
  roles,
  ...over,
});

beforeEach(() => {
  vi.unstubAllEnvs();
  h.store.users = [{ id: "user-1", name: "Ana", email: "ana@jumplabel.com.br" }];
  h.store.consultants = [
    {
      id: "con-1",
      userId: "user-1",
      email: "ana@jumplabel.com.br",
      name: "Ana",
    },
  ];
  h.store.projects = [
    {
      id: "proj-atlas",
      name: "Atlas",
      clientId: "cli-vix",
      clientName: "Vix",
      managerUserId: "user-1",
      billingHourlyRate: 320,
    },
    {
      id: "proj-orion",
      name: "Órion",
      clientId: "cli-sul",
      clientName: "Banco Sul",
      managerUserId: "manager-2",
      billingHourlyRate: null,
    },
  ];
  h.store.entries = [];
  h.store.expenses = [];
  h.store.lastEntrySelect = undefined;
  h.store.lastExpenseSelect = undefined;
  h.store.lastExpenseWhere = undefined;
  h.store.lastEntryOrderBy = undefined;
  h.store.lastExpenseOrderBy = undefined;
});

describe("resolveReportScope", () => {
  it("CONSULTANT only: own consultant, no financials", async () => {
    const scope = await resolveReportScope(user(["CONSULTANT"]));
    expect(scope.ownConsultantId).toBe("con-1");
    expect(scope.broad).toBe(false);
    expect(scope.includeFinancials).toBe(false);
    expect(scope.financeHoursLimited).toBe(false);
  });

  it("PROJECT_MANAGER: managerUserId, no financials", async () => {
    const scope = await resolveReportScope(user(["PROJECT_MANAGER"]));
    expect(scope.managerUserId).toBe("user-1");
    expect(scope.broad).toBe(false);
    expect(scope.includeFinancials).toBe(false);
  });

  it("FINANCE: broad + financials + financeHoursLimited", async () => {
    const scope = await resolveReportScope(user(["FINANCE"]));
    expect(scope.broad).toBe(true);
    expect(scope.includeFinancials).toBe(true);
    expect(scope.financeHoursLimited).toBe(true);
  });

  it("ADMIN: broad + financials, NOT hours-limited", async () => {
    const scope = await resolveReportScope(user(["ADMIN"]));
    expect(scope.broad).toBe(true);
    expect(scope.includeFinancials).toBe(true);
    expect(scope.financeHoursLimited).toBe(false);
  });

  it("union of roles: FINANCE + AREA_MANAGER is broad, financials, NOT limited", async () => {
    const scope = await resolveReportScope(
      user(["FINANCE", "AREA_MANAGER"]),
    );
    expect(scope.broad).toBe(true);
    expect(scope.includeFinancials).toBe(true);
    // AREA_MANAGER sees all hour statuses, so the FINANCE limit is dropped.
    expect(scope.financeHoursLimited).toBe(false);
  });

  it("union of roles: CONSULTANT + PROJECT_MANAGER prefers the manager scope", async () => {
    const scope = await resolveReportScope(
      user(["CONSULTANT", "PROJECT_MANAGER"]),
    );
    expect(scope.managerUserId).toBe("user-1");
    expect(scope.ownConsultantId).toBeUndefined();
  });
});

describe("buildHoursWhere", () => {
  const ownScope: ReportScope = {
    ownConsultantId: "con-1",
    broad: false,
    includeFinancials: false,
    financeHoursLimited: false,
  };
  const pmScope: ReportScope = {
    managerUserId: "user-1",
    broad: false,
    includeFinancials: false,
    financeHoursLimited: false,
  };
  const financeScope: ReportScope = {
    broad: true,
    includeFinancials: true,
    financeHoursLimited: true,
  };

  it("CONSULTANT restricts to own consultantId", () => {
    const where = buildHoursWhere(ownScope, {});
    expect(where.consultantId).toBe("con-1");
  });

  it("PROJECT_MANAGER restricts to managed projects", () => {
    const where = buildHoursWhere(pmScope, {});
    expect(where.project).toEqual({ managerUserId: "user-1" });
  });

  it("FINANCE forces status in [APPROVED, CLOSED] without an explicit filter", () => {
    const where = buildHoursWhere(financeScope, {});
    expect(where.status).toEqual({ in: ["APPROVED", "CLOSED"] });
  });

  it("FINANCE intersects an explicit allowed status", () => {
    const where = buildHoursWhere(financeScope, { status: "APPROVED" });
    expect(where.status).toBe("APPROVED");
  });

  it("FINANCE ignores a forbidden explicit status and keeps the limit", () => {
    const where = buildHoursWhere(financeScope, { status: "DRAFT" });
    expect(where.status).toEqual({ in: ["APPROVED", "CLOSED"] });
  });

  it("applies client/project/date filters", () => {
    const where = buildHoursWhere(pmScope, {
      clientId: "cli-vix",
      projectId: "proj-atlas",
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(where.projectId).toBe("proj-atlas");
    expect(where.project).toMatchObject({
      managerUserId: "user-1",
      clientId: "cli-vix",
    });
    expect(where.date.gte).toBeInstanceOf(Date);
    expect(where.date.lte).toBeInstanceOf(Date);
  });

  it("applies billable true/false", () => {
    expect(buildHoursWhere(ownScope, { billable: true }).billable).toBe(true);
    expect(buildHoursWhere(ownScope, { billable: false }).billable).toBe(false);
    // Absent billable must not add the key.
    expect(buildHoursWhere(ownScope, {})).not.toHaveProperty("billable");
  });

  it("merges projectStatus/clientStatus into where.project WITHOUT clobbering scope", () => {
    const where = buildHoursWhere(pmScope, {
      clientId: "cli-vix",
      projectStatus: "ACTIVE",
      clientStatus: "ACTIVE",
    });
    // Scope narrowing + clientId + project status all coexist.
    expect(where.project).toMatchObject({
      managerUserId: "user-1",
      clientId: "cli-vix",
      status: "ACTIVE",
      client: { status: "ACTIVE" },
    });
  });

  it("consultantStatus adds a consultant relation filter alongside consultantId", () => {
    const where = buildHoursWhere(ownScope, { consultantStatus: "ACTIVE" });
    expect(where.consultantId).toBe("con-1");
    expect(where.consultant).toEqual({ status: "ACTIVE" });
  });
});

describe("buildExpensesWhere", () => {
  const ownScope: ReportScope = {
    ownConsultantId: "con-1",
    broad: false,
    includeFinancials: false,
    financeHoursLimited: false,
  };

  it("CONSULTANT restricts to own consultantId", () => {
    expect(buildExpensesWhere(ownScope, {}).consultantId).toBe("con-1");
  });

  it("expands a stage to its status set", () => {
    const where = buildExpensesWhere(
      { broad: true, includeFinancials: true, financeHoursLimited: false },
      { stage: "PAGAMENTO" },
    );
    expect(where.status).toEqual({
      in: ["FINANCE_APPROVED", "PAYMENT_SCHEDULED"],
    });
  });

  it("explicit status wins over stage", () => {
    const where = buildExpensesWhere(
      { broad: true, includeFinancials: true, financeHoursLimited: false },
      { status: "PAID", stage: "GESTOR" },
    );
    expect(where.status).toBe("PAID");
  });

  it("merges projectStatus/clientStatus/consultantStatus", () => {
    const where = buildExpensesWhere(
      { broad: true, includeFinancials: true, financeHoursLimited: false },
      {
        clientId: "cli-vix",
        projectStatus: "CLOSED",
        clientStatus: "INACTIVE",
        consultantStatus: "ON_LEAVE",
      },
    );
    expect(where.project).toMatchObject({
      clientId: "cli-vix",
      status: "CLOSED",
      client: { status: "INACTIVE" },
    });
    expect(where.consultant).toEqual({ status: "ON_LEAVE" });
  });
});

describe("getHoursReport financial gating", () => {
  beforeEach(() => {
    h.store.entries = [
      {
        id: "e1",
        consultantId: "con-1",
        projectId: "proj-atlas",
        date: new Date("2026-06-10T00:00:00.000Z"),
        hours: 8,
        activityType: "DEVELOPMENT",
        billable: true,
        status: "APPROVED",
        submittedAt: new Date("2026-06-09T10:00:00.000Z"),
      },
    ];
  });

  it("CONSULTANT: select omits billingHourlyRate and rows carry no monetary fields", async () => {
    const report = await getHoursReport(user(["CONSULTANT"]), {});
    expect(report.includeFinancials).toBe(false);
    // The select passed to Prisma must NOT request billingHourlyRate.
    expect(
      h.store.lastEntrySelect?.project?.select?.billingHourlyRate,
    ).toBeUndefined();
    expect(report.rows[0].billingRate).toBeUndefined();
    expect(report.rows[0].billedAmount).toBeUndefined();
  });

  it("ADMIN: select includes billingHourlyRate and computes billed amounts", async () => {
    const report = await getHoursReport(user(["ADMIN"]), {});
    expect(report.includeFinancials).toBe(true);
    expect(
      h.store.lastEntrySelect?.project?.select?.billingHourlyRate,
    ).toBe(true);
    expect(report.rows[0].billingRate).toBe(320);
    expect(report.rows[0].billedAmount).toBe(2560);
    expect(report.totals.totalBilled).toBe(2560);
  });
});

describe("getConsolidatedReport", () => {
  // Fixtures spanning every status that matters for the entering/pending split.
  // Atlas (Vix, rate 320) and Órion (Banco Sul, no rate) are seeded in the
  // top-level beforeEach.
  function seedMixed() {
    h.store.entries = [
      // APPROVED -> enters; with rate 320 -> billed 8*320 = 2560.
      mkEntry("h-app", "proj-atlas", 8, "APPROVED"),
      // DRAFT/SUBMITTED/REJECTED -> pending, never sum into entering total.
      mkEntry("h-draft", "proj-atlas", 2, "DRAFT"),
      mkEntry("h-sub", "proj-atlas", 3, "SUBMITTED"),
      mkEntry("h-rej", "proj-atlas", 1, "REJECTED"),
      // Second client/project: only an APPROVED entry (no rate -> no billed).
      mkEntry("h-orion", "proj-orion", 5, "APPROVED"),
    ];
    h.store.expenses = [
      // Entering set, discriminated.
      mkExpense("x-fin", "proj-atlas", 100, "FINANCE_APPROVED"),
      mkExpense("x-sched", "proj-atlas", 200, "PAYMENT_SCHEDULED"),
      mkExpense("x-paid", "proj-atlas", 300, "PAID"),
      // Pending set (pre-finance + rejected) -> never sum into entering.
      mkExpense("x-sub", "proj-atlas", 50, "SUBMITTED"),
      mkExpense("x-mgr", "proj-atlas", 60, "MANAGER_APPROVED"),
      mkExpense("x-mrej", "proj-atlas", 70, "MANAGER_REJECTED"),
      mkExpense("x-frej", "proj-atlas", 80, "FINANCE_REJECTED"),
    ];
  }

  function mkEntry(
    id: string,
    projectId: string,
    hours: number,
    status: string,
  ): EntryRec {
    return {
      id,
      consultantId: "con-1",
      projectId,
      date: new Date("2026-06-10T00:00:00.000Z"),
      hours,
      activityType: "DEVELOPMENT",
      billable: true,
      status,
      submittedAt: null,
    };
  }

  function mkExpense(
    id: string,
    projectId: string,
    amount: number,
    status: string,
  ): ExpenseRec {
    return {
      id,
      consultantId: "con-1",
      projectId,
      date: new Date("2026-06-10T00:00:00.000Z"),
      amount,
      description: "X",
      invoiceNumber: null,
      status,
      submittedAt: null,
    };
  }

  beforeEach(seedMixed);

  it("ADMIN: APPROVED hours enter; DRAFT/SUBMITTED/REJECTED are pending", async () => {
    const report = await getConsolidatedReport(user(["ADMIN"]), {});
    // Atlas: approved 8, pending 2+3+1 = 6. Órion: approved 5, pending 0.
    expect(report.totals.approvedHours).toBe(13);
    expect(report.totals.pendingHours).toBe(6);

    const atlas = findProject(report, "Atlas");
    expect(atlas.approvedHours).toBe(8);
    expect(atlas.pendingHours).toBe(6);
    const orion = findProject(report, "Órion");
    expect(orion.approvedHours).toBe(5);
    expect(orion.pendingHours).toBe(0);
  });

  it("does NOT sum pending hours into the entering total", async () => {
    const report = await getConsolidatedReport(user(["ADMIN"]), {});
    // The 6 pending hours must never bleed into approvedHours.
    expect(report.totals.approvedHours).toBe(13);
    expect(report.totals.approvedHours).not.toBe(19);
  });

  it("billedAmount only for APPROVED hours with a rate (FINANCIAL_ROLES)", async () => {
    const report = await getConsolidatedReport(user(["ADMIN"]), {});
    expect(report.includeFinancials).toBe(true);
    // Atlas approved 8h * 320 = 2560; Órion has no rate -> 0.
    expect(report.totals.totalBilled).toBe(2560);
    expect(findProject(report, "Atlas").billedAmount).toBe(2560);
    expect(findProject(report, "Órion").billedAmount).toBe(0);
  });

  it("discriminates entering expenses into approved/scheduled/paid", async () => {
    const report = await getConsolidatedReport(user(["ADMIN"]), {});
    const atlas = findProject(report, "Atlas");
    expect(atlas.expenseApproved).toBe(100);
    expect(atlas.expenseScheduled).toBe(200);
    expect(atlas.expensePaid).toBe(300);
    expect(atlas.expenseEntering).toBe(600);
  });

  it("SUBMITTED/MANAGER_APPROVED/rejected expenses are pending, not entering", async () => {
    const report = await getConsolidatedReport(user(["ADMIN"]), {});
    const atlas = findProject(report, "Atlas");
    // 50 + 60 + 70 + 80 = 260 pending; never in the entering total.
    expect(atlas.expensePending).toBe(260);
    expect(report.totals.expenseEntering).toBe(600);
    expect(report.totals.expensePending).toBe(260);
    expect(report.totals.expenseEntering).not.toBe(860);
  });

  it("groups cliente -> projeto across two clients, ordered", async () => {
    const report = await getConsolidatedReport(user(["ADMIN"]), {});
    expect(report.clients.map((c) => c.clientName)).toEqual([
      "Banco Sul",
      "Vix",
    ]);
    const vix = report.clients.find((c) => c.clientName === "Vix")!;
    expect(vix.projects.map((p) => p.projectName)).toEqual(["Atlas"]);
  });

  it("CONSULTANT: own scope, no financials, no billedAmount field", async () => {
    const report = await getConsolidatedReport(user(["CONSULTANT"]), {});
    expect(report.includeFinancials).toBe(false);
    expect(report.totals.totalBilled).toBeUndefined();
    // Select must not pull the financial field (defense in depth).
    expect(
      h.store.lastEntrySelect?.project?.select?.billingHourlyRate,
    ).toBeUndefined();
    // Still gets the data scoped to its own consultant.
    expect(report.totals.approvedHours).toBe(13);
    expect(findProject(report, "Atlas").billedAmount).toBeUndefined();
  });

  it("CONSULTANT without a linked Consultant resolves to empty", async () => {
    h.store.consultants = [];
    const report = await getConsolidatedReport(
      user(["CONSULTANT"], { id: "ghost", email: "ghost@x.com" }),
      {},
    );
    expect(report.clients).toEqual([]);
    expect(report.totals.approvedHours).toBe(0);
    expect(report.totals.expenseEntering).toBe(0);
  });
});

describe("getHoursReport pagination + sort + totals over the whole set", () => {
  function seedTwelve() {
    h.store.entries = Array.from({ length: 12 }, (_, i) => ({
      id: `e${i + 1}`,
      consultantId: "con-1",
      projectId: "proj-atlas",
      // Spread dates so date-asc ordering is deterministic.
      date: new Date(Date.UTC(2026, 5, i + 1)),
      hours: i + 1,
      activityType: "DEVELOPMENT",
      billable: i % 2 === 0,
      status: "APPROVED",
      submittedAt: null,
    }));
  }

  beforeEach(seedTwelve);

  it("paginates: page 1 of pageSize 5 returns 5 rows, totals cover all 12", async () => {
    const report = await getHoursReport(user(["ADMIN"]), {
      page: 1,
      pageSize: 50, // 50 is a valid size; force a smaller page below
    });
    // pageSize must be one of the allowed values; the schema only lets 25/50/100
    // through, so here we exercise 50 and assert the whole-set totals.
    expect(report.rows.length).toBe(12);
    expect(report.pagination.total).toBe(12);
    expect(report.totals.count).toBe(12);
    expect(report.totals.totalHours).toBe(78); // 1..12
  });

  it("page 2 of pageSize 25 is empty but totals still reflect all 12", async () => {
    const report = await getHoursReport(user(["ADMIN"]), {
      page: 2,
      pageSize: 25,
    });
    expect(report.rows.length).toBe(0);
    expect(report.pagination.total).toBe(12);
    expect(report.pagination.totalPages).toBe(1);
    expect(report.totals.totalHours).toBe(78);
  });

  it("export-all mode (no page/pageSize) returns every row in one page", async () => {
    const report = await getHoursReport(user(["ADMIN"]), {});
    expect(report.rows.length).toBe(12);
    expect(report.pagination.totalPages).toBe(1);
    expect(report.pagination.page).toBe(1);
  });

  it("sort=hours desc orders by hours descending", async () => {
    const report = await getHoursReport(user(["ADMIN"]), {
      sort: "hours",
      direction: "desc",
    });
    expect(report.rows[0].hours).toBe(12);
    expect(report.rows[report.rows.length - 1].hours).toBe(1);
    expect(h.store.lastEntryOrderBy?.[0]).toEqual({ hours: "desc" });
  });

  it("billable filter narrows rows and totals together", async () => {
    const report = await getHoursReport(user(["ADMIN"]), { billable: true });
    // i%2===0 => indices 0,2,4,6,8,10 => hours 1,3,5,7,9,11 => 6 rows.
    expect(report.rows.length).toBe(6);
    expect(report.pagination.total).toBe(6);
    expect(report.totals.totalHours).toBe(36);
  });
});

describe("getHoursReport period preset overrides from/to", () => {
  beforeEach(() => {
    h.store.entries = [
      // May entry, June entry, July entry.
      {
        id: "may",
        consultantId: "con-1",
        projectId: "proj-atlas",
        date: new Date(Date.UTC(2026, 4, 15)),
        hours: 5,
        activityType: "DEVELOPMENT",
        billable: true,
        status: "APPROVED",
        submittedAt: null,
      },
      {
        id: "jun",
        consultantId: "con-1",
        projectId: "proj-atlas",
        date: new Date(Date.UTC(2026, 5, 15)),
        hours: 8,
        activityType: "DEVELOPMENT",
        billable: true,
        status: "APPROVED",
        submittedAt: null,
      },
    ];
  });

  it("mes-atual (June) ignores an explicit January range and keeps only June", async () => {
    const today = new Date(Date.UTC(2026, 5, 11));
    const report = await getHoursReport(
      user(["ADMIN"]),
      { period: "mes-atual", from: "2026-01-01", to: "2026-01-31" },
      today,
    );
    expect(report.rows.map((r) => r.id)).toEqual(["jun"]);
  });

  it("mes-anterior (from June) keeps only May", async () => {
    const today = new Date(Date.UTC(2026, 5, 11));
    const report = await getHoursReport(
      user(["ADMIN"]),
      { period: "mes-anterior" },
      today,
    );
    expect(report.rows.map((r) => r.id)).toEqual(["may"]);
  });
});

describe("getHoursReport client/project/consultant status filters", () => {
  beforeEach(() => {
    h.store.projects = [
      {
        id: "proj-active",
        name: "Ativo",
        clientId: "cli-active",
        clientName: "Cliente Ativo",
        managerUserId: "user-1",
        billingHourlyRate: 100,
        status: "ACTIVE",
        clientStatus: "ACTIVE",
      },
      {
        id: "proj-closed",
        name: "Encerrado",
        clientId: "cli-inactive",
        clientName: "Cliente Inativo",
        managerUserId: "user-1",
        billingHourlyRate: 100,
        status: "CLOSED",
        clientStatus: "INACTIVE",
      },
    ];
    h.store.consultants = [
      {
        id: "con-1",
        userId: "user-1",
        email: "ana@jumplabel.com.br",
        name: "Ana",
        status: "ACTIVE",
      },
      {
        id: "con-2",
        userId: null,
        email: "bia@jumplabel.com.br",
        name: "Bia",
        status: "ON_LEAVE",
      },
    ];
    h.store.entries = [
      mk("e-active", "proj-active", "con-1"),
      mk("e-closed", "proj-closed", "con-1"),
      mk("e-onleave", "proj-active", "con-2"),
    ];
  });

  function mk(id: string, projectId: string, consultantId: string): EntryRec {
    return {
      id,
      consultantId,
      projectId,
      date: new Date(Date.UTC(2026, 5, 10)),
      hours: 4,
      activityType: "DEVELOPMENT",
      billable: true,
      status: "APPROVED",
      submittedAt: null,
    };
  }

  it("projectStatus=ACTIVE drops the closed project", async () => {
    const report = await getHoursReport(user(["ADMIN"]), {
      projectStatus: "ACTIVE",
    });
    expect(report.rows.map((r) => r.id).sort()).toEqual([
      "e-active",
      "e-onleave",
    ]);
  });

  it("clientStatus=INACTIVE keeps only the inactive client's entries", async () => {
    const report = await getHoursReport(user(["ADMIN"]), {
      clientStatus: "INACTIVE",
    });
    expect(report.rows.map((r) => r.id)).toEqual(["e-closed"]);
  });

  it("consultantStatus=ON_LEAVE keeps only Bia's entry", async () => {
    const report = await getHoursReport(user(["ADMIN"]), {
      consultantStatus: "ON_LEAVE",
    });
    expect(report.rows.map((r) => r.id)).toEqual(["e-onleave"]);
  });
});

function findProject(
  report: ConsolidatedReport,
  name: string,
): ConsolidatedProject {
  for (const client of report.clients) {
    const p = client.projects.find((pr) => pr.projectName === name);
    if (p) return p;
  }
  throw new Error(`project ${name} not found`);
}
