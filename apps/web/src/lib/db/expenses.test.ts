import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/lib/auth/types";
import type { RoleName } from "@/lib/auth/roles";

/**
 * Read-layer tests for the Despesas module with a stateful in-memory Prisma
 * mock (same harness pattern as lib/db/timesheet.test.ts — the mock interprets
 * the exact where-shapes these queries issue). Focus:
 * - getReceiptSignedUrl RBAC matrix (owner / PM-of-project / FINANCE vs rest);
 * - listExpenseApprovalItems stage visibility per caller-built scope, exactly
 *   as /app/aprovacoes builds it (FINANCE → finance stage only; PM → manager
 *   stage scoped to managed projects; ADMIN → both).
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
}
interface ProjectRec {
  id: string;
  name: string;
  status: string;
  managerUserId: string | null;
  clientName: string;
}
interface AttachmentRec {
  storageKey: string;
  fileName: string;
  contentType: string;
  size: number;
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
  attachment: AttachmentRec | null;
}
interface ApprovalRec {
  id: string;
  entityType: string;
  entityId: string;
  approverUserId: string;
  status: string;
  comment: string | null;
  isAutomatic: boolean;
  createdAt: Date;
}

// The in-memory mock interprets dynamic where-shapes; `any` would be flagged,
// so use a loose-but-lintable record type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

const h = vi.hoisted(() => {
  const store = {
    users: [] as UserRec[],
    consultants: [] as ConsultantRec[],
    projects: [] as ProjectRec[],
    expenses: [] as ExpenseRec[],
    approvals: [] as ApprovalRec[],
    storageConfigured: true,
    signCalls: [] as { key: string; ttl: number }[],
  };

  /** Superset row covering every select these queries use. */
  function toRow(e: ExpenseRec) {
    const consultant = store.consultants.find((c) => c.id === e.consultantId)!;
    const project = store.projects.find((p) => p.id === e.projectId)!;
    return {
      id: e.id,
      projectId: e.projectId,
      date: e.date,
      amount: e.amount,
      description: e.description,
      invoiceNumber: e.invoiceNumber,
      status: e.status,
      submittedAt: e.submittedAt,
      consultant: {
        name: consultant.name,
        userId: consultant.userId,
        email: consultant.email,
      },
      project: {
        name: project.name,
        managerUserId: project.managerUserId,
        client: { name: project.clientName },
      },
      attachment: e.attachment ? { ...e.attachment } : null,
    };
  }

  function matchExpense(e: ExpenseRec, where?: Where): boolean {
    if (!where) return true;
    if (where.OR) return where.OR.some((w: Where) => matchExpense(e, w));
    if (where.id?.in && !where.id.in.includes(e.id)) return false;
    if (typeof where.status === "string" && e.status !== where.status) {
      return false;
    }
    if (
      typeof where.status === "object" &&
      where.status?.in &&
      !where.status.in.includes(e.status)
    ) {
      return false;
    }
    if (where.consultantId && e.consultantId !== where.consultantId) {
      return false;
    }
    if (where.project?.managerUserId) {
      const project = store.projects.find((p) => p.id === e.projectId);
      if (project?.managerUserId !== where.project.managerUserId) return false;
    }
    return true;
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
    expense: {
      findUnique: async ({ where }: { where: Where }) => {
        const expense = store.expenses.find((e) => e.id === where.id);
        return expense ? toRow(expense) : null;
      },
      findMany: async ({ where }: { where?: Where }) =>
        store.expenses.filter((e) => matchExpense(e, where)).map(toRow),
    },
    approval: {
      findMany: async ({ where }: { where?: Where }) =>
        store.approvals
          .filter(
            (a) =>
              (!where?.entityType || a.entityType === where.entityType) &&
              (!where?.entityId?.in || where.entityId.in.includes(a.entityId)) &&
              (!where?.status ||
                typeof where.status !== "string" ||
                a.status === where.status),
          )
          .map((a) => ({ ...a })),
    },
  };

  return { store, prismaMock };
});

vi.mock("@jumpflow/database", () => ({ prisma: h.prismaMock }));

// Storage provider mocked at the contract boundary (no Supabase, no fetch):
// the tests only care WHETHER signing happens and with which key/ttl.
vi.mock("@/lib/storage/provider", () => ({
  EXPENSE_RECEIPTS_BUCKET: "expense-receipts",
  isStorageConfigured: () => h.store.storageConfigured,
  getStorageProvider: () =>
    h.store.storageConfigured
      ? {
          upload: async () => undefined,
          delete: async () => undefined,
          getSignedUrl: async (key: string, ttl: number) => {
            h.store.signCalls.push({ key, ttl });
            return `https://signed.example/${key}?ttl=${ttl}`;
          },
        }
      : null,
}));

import {
  getReceiptSignedUrl,
  listExpenseApprovalItems,
} from "./expenses";

/** Session AppUser whose id matches the persisted row (production path). */
function appUser(id: string, roles: RoleName[]): AppUser {
  const user = h.store.users.find((u) => u.id === id)!;
  return { id: user.id, name: user.name, email: user.email, roles };
}

beforeEach(() => {
  // Production-like auth: ids match db rows, no dev e-mail fallback.
  vi.stubEnv("AUTH_DEV_MODE", "false");
  h.store.storageConfigured = true;
  h.store.signCalls = [];
  h.store.users = [
    { id: "user-owner", name: "Ana Martins", email: "ana@jumplabel.com.br" },
    { id: "user-other", name: "Bruno Costa", email: "bruno@jumplabel.com.br" },
    { id: "user-pm", name: "Paula Gestora", email: "paula@jumplabel.com.br" },
    {
      id: "user-pm-other",
      name: "Otto Gestor",
      email: "otto@jumplabel.com.br",
    },
    { id: "user-fin", name: "Fernanda Fin", email: "fe@jumplabel.com.br" },
  ];
  h.store.consultants = [
    {
      id: "con-1",
      userId: "user-owner",
      email: "ana@jumplabel.com.br",
      name: "Ana Martins",
    },
    {
      id: "con-2",
      userId: "user-other",
      email: "bruno@jumplabel.com.br",
      name: "Bruno Costa",
    },
  ];
  h.store.projects = [
    {
      id: "proj-1",
      name: "Projeto Alpha",
      status: "ACTIVE",
      managerUserId: "user-pm",
      clientName: "Cliente A",
    },
    {
      id: "proj-other",
      name: "Projeto Beta",
      status: "ACTIVE",
      managerUserId: "user-pm-other",
      clientName: "Cliente B",
    },
  ];
  h.store.expenses = [
    {
      id: "exp-1",
      consultantId: "con-1",
      projectId: "proj-1",
      date: new Date("2026-06-03T00:00:00.000Z"),
      amount: 184.9,
      description: "Estacionamento",
      invoiceNumber: null,
      status: "SUBMITTED",
      submittedAt: new Date("2026-06-04T12:00:00.000Z"),
      attachment: {
        storageKey: "expenses/exp-1/abc-nota.pdf",
        fileName: "nota.pdf",
        contentType: "application/pdf",
        size: 1234,
      },
    },
  ];
  h.store.approvals = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getReceiptSignedUrl — RBAC matrix", () => {
  it("signs for the expense OWNER (consultant without any privileged role)", async () => {
    const result = await getReceiptSignedUrl("exp-1", appUser("user-owner", ["CONSULTANT"]));
    expect(result).toMatchObject({
      ok: true,
      data: { url: expect.stringContaining("expenses/exp-1/abc-nota.pdf") },
    });
    // Short-lived link: TTL is fixed server-side (300s).
    expect(h.store.signCalls).toEqual([
      { key: "expenses/exp-1/abc-nota.pdf", ttl: 300 },
    ]);
  });

  it("signs for the MANAGER of the expense's project", async () => {
    const result = await getReceiptSignedUrl(
      "exp-1",
      appUser("user-pm", ["PROJECT_MANAGER"]),
    );
    expect(result).toMatchObject({ ok: true });
    expect(h.store.signCalls).toHaveLength(1);
  });

  it("signs for FINANCE (privileged role, not owner nor manager)", async () => {
    const result = await getReceiptSignedUrl(
      "exp-1",
      appUser("user-fin", ["FINANCE"]),
    );
    expect(result).toMatchObject({ ok: true });
  });

  it("forbids ANOTHER consultant — and never touches the signer", async () => {
    const result = await getReceiptSignedUrl(
      "exp-1",
      appUser("user-other", ["CONSULTANT"]),
    );
    expect(result).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(h.store.signCalls).toHaveLength(0);
  });

  it("forbids a PROJECT_MANAGER of a DIFFERENT project", async () => {
    const result = await getReceiptSignedUrl(
      "exp-1",
      appUser("user-pm-other", ["PROJECT_MANAGER"]),
    );
    expect(result).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(h.store.signCalls).toHaveLength(0);
  });

  it("answers FORBIDDEN (not NOT_FOUND) to unauthorized users even without attachment", async () => {
    // RBAC must run BEFORE the attachment check — no information leak about
    // whether a receipt exists.
    h.store.expenses[0].attachment = null;
    const result = await getReceiptSignedUrl(
      "exp-1",
      appUser("user-other", ["CONSULTANT"]),
    );
    expect(result).toMatchObject({ ok: false, error: "FORBIDDEN" });
  });

  it("returns NOT_FOUND to the owner when the expense has no attachment", async () => {
    h.store.expenses[0].attachment = null;
    const result = await getReceiptSignedUrl(
      "exp-1",
      appUser("user-owner", ["CONSULTANT"]),
    );
    expect(result).toMatchObject({ ok: false, error: "NOT_FOUND" });
    expect(h.store.signCalls).toHaveLength(0);
  });

  it("returns NOT_FOUND for an unknown expense id", async () => {
    const result = await getReceiptSignedUrl(
      "exp-missing",
      appUser("user-fin", ["FINANCE"]),
    );
    expect(result).toMatchObject({ ok: false, error: "NOT_FOUND" });
  });

  it("degrades to NO_STORAGE when storage is not configured (authorized user)", async () => {
    h.store.storageConfigured = false;
    const result = await getReceiptSignedUrl(
      "exp-1",
      appUser("user-owner", ["CONSULTANT"]),
    );
    expect(result).toMatchObject({ ok: false, error: "NO_STORAGE" });
    expect(h.store.signCalls).toHaveLength(0);
  });
});

describe("listExpenseApprovalItems — stage visibility per scope", () => {
  beforeEach(() => {
    h.store.expenses = [
      {
        id: "exp-sub-mine",
        consultantId: "con-1",
        projectId: "proj-1", // managed by user-pm
        date: new Date("2026-06-01T00:00:00.000Z"),
        amount: 100,
        description: "Uber cliente",
        invoiceNumber: null,
        status: "SUBMITTED",
        submittedAt: new Date("2026-06-02T10:00:00.000Z"),
        attachment: null,
      },
      {
        id: "exp-sub-other",
        consultantId: "con-2",
        projectId: "proj-other", // managed by user-pm-other
        date: new Date("2026-06-01T00:00:00.000Z"),
        amount: 200,
        description: "Almoço cliente",
        invoiceNumber: null,
        status: "SUBMITTED",
        submittedAt: new Date("2026-06-02T11:00:00.000Z"),
        attachment: null,
      },
      {
        id: "exp-mgr-appr",
        consultantId: "con-2",
        projectId: "proj-other",
        date: new Date("2026-05-28T00:00:00.000Z"),
        amount: 300,
        description: "Hospedagem",
        invoiceNumber: "NF-77",
        status: "MANAGER_APPROVED",
        submittedAt: new Date("2026-05-29T09:00:00.000Z"),
        attachment: null,
      },
      // Never in any queue: not yet submitted / already past finance.
      {
        id: "exp-draft",
        consultantId: "con-1",
        projectId: "proj-1",
        date: new Date("2026-06-05T00:00:00.000Z"),
        amount: 50,
        description: "Rascunho",
        invoiceNumber: null,
        status: "DRAFT",
        submittedAt: null,
        attachment: null,
      },
      {
        id: "exp-fin-appr",
        consultantId: "con-1",
        projectId: "proj-1",
        date: new Date("2026-05-20T00:00:00.000Z"),
        amount: 75,
        description: "Já no financeiro",
        invoiceNumber: null,
        status: "FINANCE_APPROVED",
        submittedAt: new Date("2026-05-21T09:00:00.000Z"),
        attachment: null,
      },
    ];
  });

  function pendingOf(items: Awaited<ReturnType<typeof listExpenseApprovalItems>>) {
    return items
      .filter((item) => item.status === "PENDING")
      .map((item) => ({ expenseId: item.expenseId, stage: item.stage }));
  }

  it("FINANCE scope sees ONLY MANAGER_APPROVED expenses (finance stage)", async () => {
    // Scope exactly as /app/aprovacoes builds it for a pure FINANCE user.
    const items = await listExpenseApprovalItems({
      includeManagerStage: false,
      includeFinanceStage: true,
    });
    expect(pendingOf(items)).toEqual([
      { expenseId: "exp-mgr-appr", stage: "FINANCE" },
    ]);
  });

  it("PROJECT_MANAGER scope sees ONLY SUBMITTED expenses of managed projects", async () => {
    const items = await listExpenseApprovalItems({
      includeManagerStage: true,
      includeFinanceStage: false,
      managerUserId: "user-pm",
    });
    expect(pendingOf(items)).toEqual([
      { expenseId: "exp-sub-mine", stage: "MANAGER" },
    ]);
  });

  it("ADMIN scope (unrestricted) sees both stages, never DRAFT/FINANCE_APPROVED", async () => {
    const items = await listExpenseApprovalItems({
      includeManagerStage: true,
      includeFinanceStage: true,
    });
    const pending = pendingOf(items);
    expect(pending).toHaveLength(3);
    expect(pending).toEqual(
      expect.arrayContaining([
        { expenseId: "exp-sub-mine", stage: "MANAGER" },
        { expenseId: "exp-sub-other", stage: "MANAGER" },
        { expenseId: "exp-mgr-appr", stage: "FINANCE" },
      ]),
    );
    const ids = pending.map((p) => p.expenseId);
    expect(ids).not.toContain("exp-draft");
    expect(ids).not.toContain("exp-fin-appr");
  });

  it("returns no pending items when the scope includes no stage", async () => {
    const items = await listExpenseApprovalItems({
      includeManagerStage: false,
      includeFinanceStage: false,
    });
    expect(pendingOf(items)).toEqual([]);
  });

  it("PM scope also restricts the decision HISTORY to managed projects", async () => {
    h.store.approvals = [
      {
        id: "appr-mine",
        entityType: "EXPENSE",
        entityId: "exp-fin-appr", // proj-1, managed by user-pm
        approverUserId: "user-pm",
        status: "APPROVED",
        comment: null,
        isAutomatic: false,
        createdAt: new Date("2026-05-22T09:00:00.000Z"),
      },
      {
        id: "appr-other",
        entityType: "EXPENSE",
        entityId: "exp-mgr-appr", // proj-other
        approverUserId: "user-pm-other",
        status: "APPROVED",
        comment: null,
        isAutomatic: false,
        createdAt: new Date("2026-05-30T09:00:00.000Z"),
      },
    ];
    const items = await listExpenseApprovalItems({
      includeManagerStage: true,
      includeFinanceStage: false,
      managerUserId: "user-pm",
    });
    const history = items.filter((item) => item.status !== "PENDING");
    expect(history.map((item) => item.expenseId)).toEqual(["exp-fin-appr"]);
  });
});
