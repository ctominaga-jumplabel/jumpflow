import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-action tests with a stateful in-memory Prisma mock (same pattern as
 * horas/actions.test.ts). The mock honors only the where-shapes the actions
 * actually issue; cases follow docs/despesas-persistencia.md section 9.
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
  status: string;
  managerUserId: string | null;
}
interface AllocationRec {
  id: string;
  consultantId: string;
  projectId: string;
  status: string;
  startDate: Date;
  endDate: Date | null;
}
interface ExpenseRec {
  id: string;
  consultantId: string;
  projectId: string;
  allocationId: string | null;
  date: Date;
  amount: number;
  description: string;
  invoiceNumber: string | null;
  status: string;
  submittedAt: Date | null;
}
interface AttachmentRec {
  id: string;
  expenseId: string;
  fileName: string;
  contentType: string;
  size: number;
  storageBucket: string;
  storageKey: string;
  uploadedByUserId: string | null;
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
    allocations: [] as AllocationRec[],
    expenses: [] as ExpenseRec[],
    attachments: [] as AttachmentRec[],
    approvals: [] as Record<string, unknown>[],
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

  function matchExpense(e: ExpenseRec, where: Where): boolean {
    if (where.id !== undefined && e.id !== where.id) return false;
    if (where.status !== undefined) {
      if (typeof where.status === "string") {
        if (e.status !== where.status) return false;
      } else if (where.status.in && !where.status.in.includes(e.status)) {
        return false;
      }
    }
    return true;
  }

  function expenseWithInclude(e: ExpenseRec, include?: Where) {
    const out: Record<string, unknown> = { ...e };
    if (include?.attachment) {
      out.attachment =
        store.attachments.find((a) => a.expenseId === e.id) ?? null;
    }
    if (include?.project) {
      out.project = { ...store.projects.find((p) => p.id === e.projectId)! };
    }
    if (include?.consultant) {
      const consultant = store.consultants.find(
        (c) => c.id === e.consultantId,
      )!;
      out.consultant = { userId: consultant.userId, email: consultant.email };
    }
    return out;
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
    project: {
      findUnique: async ({ where }: { where: Where }) => {
        const project = store.projects.find((p) => p.id === where.id);
        return project ? { ...project } : null;
      },
    },
    allocation: {
      findFirst: async ({ where }: { where: Where }) => {
        const date: Date = where.startDate.lte;
        const found = store.allocations.find(
          (a) =>
            a.consultantId === where.consultantId &&
            a.projectId === where.projectId &&
            a.status === where.status &&
            a.startDate.getTime() <= date.getTime() &&
            (a.endDate === null || a.endDate.getTime() >= date.getTime()),
        );
        return found ? { ...found } : null;
      },
    },
    expense: {
      findUnique: async ({ where, include }: { where: Where; include?: Where }) => {
        const expense = store.expenses.find((e) => e.id === where.id);
        return expense ? expenseWithInclude(expense, include) : null;
      },
      findMany: async ({ where, include }: { where?: Where; include?: Where }) =>
        store.expenses
          .filter((e) => (where ? matchExpense(e, where) : true))
          .map((e) => expenseWithInclude(e, include)),
      create: async ({ data }: { data: Where }) => {
        const expense: ExpenseRec = {
          id: nextId("exp"),
          consultantId: data.consultantId,
          projectId: data.projectId,
          allocationId: data.allocationId ?? null,
          date: data.date,
          amount: Number(data.amount),
          description: data.description,
          invoiceNumber: data.invoiceNumber ?? null,
          status: data.status,
          submittedAt: data.submittedAt ?? null,
        };
        store.expenses.push(expense);
        return { ...expense };
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        const expense = store.expenses.find((e) => e.id === where.id)!;
        Object.assign(
          expense,
          data,
          data.amount !== undefined ? { amount: Number(data.amount) } : {},
        );
        return { ...expense };
      },
      updateMany: async ({ where, data }: { where: Where; data: Where }) => {
        const matched = store.expenses.filter((e) => matchExpense(e, where));
        for (const expense of matched) Object.assign(expense, data);
        return { count: matched.length };
      },
      delete: async ({ where }: { where: Where }) => {
        const index = store.expenses.findIndex((e) => e.id === where.id);
        const [removed] = store.expenses.splice(index, 1);
        return removed;
      },
      deleteMany: async ({ where }: { where: Where }) => {
        const matched = store.expenses.filter((e) => matchExpense(e, where));
        store.expenses = store.expenses.filter(
          (e) => !matched.includes(e),
        );
        return { count: matched.length };
      },
    },
    expenseAttachment: {
      upsert: async ({
        where,
        update,
        create,
      }: {
        where: Where;
        update: Where;
        create: Where;
      }) => {
        const existing = store.attachments.find(
          (a) => a.expenseId === where.expenseId,
        );
        if (existing) {
          Object.assign(existing, update);
          return { ...existing };
        }
        const attachment: AttachmentRec = {
          id: nextId("att"),
          expenseId: create.expenseId,
          fileName: create.fileName,
          contentType: create.contentType,
          size: create.size,
          storageBucket: create.storageBucket,
          storageKey: create.storageKey,
          uploadedByUserId: create.uploadedByUserId ?? null,
        };
        store.attachments.push(attachment);
        return { ...attachment };
      },
      delete: async ({ where }: { where: Where }) => {
        const index = store.attachments.findIndex((a) => a.id === where.id);
        const [removed] = store.attachments.splice(index, 1);
        return removed;
      },
    },
    approval: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.approvals.push(data);
        return data;
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.audits.push(data);
        return data;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock),
  };

  return { store, prismaMock };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: { JsonNull: "__JsonNull__" },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => h.store.currentUser),
  // Mirrors guards.ts: honors the requested roles against the test user and,
  // on failure, throws the NEXT_REDIRECT control-flow error produced by
  // redirect("/access-denied") — which actions must rethrow, never swallow.
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

import {
  attachReceipt,
  createExpense,
  decideAsFinance,
  decideAsManager,
  deleteExpense,
  replaceReceipt,
  setPayment,
  submitExpense,
  updateExpense,
} from "./actions";

function seedExpense(over: Partial<ExpenseRec> = {}): ExpenseRec {
  const expense: ExpenseRec = {
    id: `seeded-${++h.store.seq}`,
    // Defaults to ANOTHER consultant (con-2) so the acting dev user (owner of
    // con-1) can decide it without tripping the SELF_APPROVAL guard.
    consultantId: "con-2",
    projectId: "proj-1",
    allocationId: "alloc-1",
    date: new Date("2026-06-10T00:00:00.000Z"),
    amount: 100,
    description: "Despesa de teste",
    invoiceNumber: null,
    status: "DRAFT",
    submittedAt: null,
    ...over,
  };
  h.store.expenses.push(expense);
  return expense;
}

/** Expense owned by the acting user's own consultant (con-1). */
function seedOwnExpense(over: Partial<ExpenseRec> = {}): ExpenseRec {
  return seedExpense({ consultantId: "con-1", ...over });
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  // The email fallback for the synthetic session id only applies under dev
  // auth (production requires Consultant.userId), so the harness opts in.
  vi.stubEnv("AUTH_DEV_MODE", "true");
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  h.store.seq = 0;
  // The session user id ("dev-user") deliberately does NOT match the db user
  // id ("user-1") to exercise the email fallback (dev-mode constraint).
  h.store.currentUser = {
    id: "dev-user",
    name: "Ana Martins",
    email: "ana@jumplabel.com.br",
    roles: ["ADMIN"],
  };
  h.store.users = [
    { id: "user-1", name: "Ana Martins", email: "ana@jumplabel.com.br" },
    { id: "user-2", name: "Bruno Costa", email: "bruno@jumplabel.com.br" },
  ];
  h.store.consultants = [
    {
      id: "con-1",
      userId: "user-1",
      email: "ana@jumplabel.com.br",
      name: "Ana Martins",
    },
    {
      id: "con-2",
      userId: "user-2",
      email: "bruno@jumplabel.com.br",
      name: "Bruno Costa",
    },
  ];
  h.store.projects = [
    { id: "proj-1", status: "ACTIVE", managerUserId: "user-1" },
    { id: "proj-other", status: "ACTIVE", managerUserId: "someone-else" },
    { id: "proj-closed", status: "CLOSED", managerUserId: "user-1" },
  ];
  h.store.allocations = [
    {
      id: "alloc-1",
      consultantId: "con-1",
      projectId: "proj-1",
      status: "ACTIVE",
      startDate: new Date("2026-01-05T00:00:00.000Z"),
      endDate: null,
    },
  ];
  h.store.expenses = [];
  h.store.attachments = [];
  h.store.approvals = [];
  h.store.audits = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const baseInput = {
  projectId: "proj-1",
  date: "2026-06-10",
  amount: 184.9,
  description: "Estacionamento em visita ao cliente",
};

describe("createExpense — allocation rule", () => {
  it("rejects a project without an active allocation covering the date", async () => {
    h.store.allocations = [];
    const result = await createExpense(baseInput);
    expect(result).toMatchObject({ ok: false, error: "NO_ACTIVE_ALLOCATION" });
  });

  it("rejects an allocation expired before the expense date", async () => {
    h.store.allocations[0].endDate = new Date("2026-06-09T00:00:00.000Z");
    const result = await createExpense(baseInput);
    expect(result).toMatchObject({ ok: false, error: "NO_ACTIVE_ALLOCATION" });
  });

  it("rejects a CLOSED project before checking allocation", async () => {
    const result = await createExpense({ ...baseInput, projectId: "proj-closed" });
    expect(result).toMatchObject({ ok: false, error: "PROJECT_CLOSED" });
  });

  it("creates a DRAFT at midnight UTC with the allocation recorded", async () => {
    const result = await createExpense(baseInput);
    expect(result.ok).toBe(true);
    expect(h.store.expenses).toHaveLength(1);
    const expense = h.store.expenses[0];
    expect(expense.status).toBe("DRAFT");
    expect(expense.submittedAt).toBeNull();
    expect(expense.allocationId).toBe("alloc-1");
    expect(expense.consultantId).toBe("con-1");
    expect(expense.date.toISOString()).toBe("2026-06-10T00:00:00.000Z");
    expect(expense.amount).toBe(184.9);
  });
});

describe("updateExpense / deleteExpense — editability", () => {
  it.each(["SUBMITTED", "MANAGER_APPROVED", "FINANCE_APPROVED", "PAYMENT_SCHEDULED", "PAID"])(
    "refuses to edit a %s expense",
    async (status) => {
      const expense = seedOwnExpense({ status });
      const result = await updateExpense({
        id: expense.id,
        amount: 50,
        description: "Ajuste",
      });
      expect(result).toMatchObject({ ok: false, error: "NOT_EDITABLE" });
    },
  );

  it("returns a MANAGER_REJECTED expense to DRAFT on edit", async () => {
    const expense = seedOwnExpense({
      status: "MANAGER_REJECTED",
      submittedAt: new Date(),
    });
    const result = await updateExpense({
      id: expense.id,
      amount: 80,
      description: "Corrigida com NF",
    });
    expect(result.ok).toBe(true);
    expect(h.store.expenses[0]).toMatchObject({
      status: "DRAFT",
      submittedAt: null,
      amount: 80,
    });
  });

  it("re-checks project/allocation when the date changes", async () => {
    h.store.allocations[0].endDate = new Date("2026-06-10T00:00:00.000Z");
    const expense = seedOwnExpense();
    const result = await updateExpense({
      id: expense.id,
      date: "2026-06-15", // beyond the allocation end
      amount: 50,
      description: "Ajuste",
    });
    expect(result).toMatchObject({ ok: false, error: "NO_ACTIVE_ALLOCATION" });
  });

  it("blocks edits from another consultant (ownership)", async () => {
    const expense = seedExpense(); // owned by con-2
    const result = await updateExpense({
      id: expense.id,
      amount: 50,
      description: "Ajuste",
    });
    expect(result).toMatchObject({ ok: false, error: "FORBIDDEN" });
  });

  it("deletes only editable expenses, removing the attachment row too", async () => {
    const draft = seedOwnExpense();
    const submitted = seedOwnExpense({ status: "SUBMITTED" });
    h.store.attachments.push({
      id: "att-1",
      expenseId: draft.id,
      fileName: "nota.pdf",
      contentType: "application/pdf",
      size: 100,
      storageBucket: "expense-receipts",
      storageKey: `expenses/${draft.id}/x-nota.pdf`,
      uploadedByUserId: "user-1",
    });

    expect(await deleteExpense({ id: submitted.id })).toMatchObject({
      ok: false,
      error: "NOT_EDITABLE",
    });
    expect(await deleteExpense({ id: draft.id })).toMatchObject({ ok: true });
    expect(h.store.expenses.map((e) => e.id)).toEqual([submitted.id]);
    expect(h.store.attachments).toHaveLength(0);
  });
});

function receiptFormData(expenseId: string, file?: File): FormData {
  const formData = new FormData();
  formData.set("expenseId", expenseId);
  formData.set(
    "file",
    file ??
      new File([new Uint8Array([1, 2, 3])], "nota.pdf", {
        type: "application/pdf",
      }),
  );
  return formData;
}

describe("attachReceipt", () => {
  it("returns NO_STORAGE without touching the database when storage is not configured", async () => {
    const expense = seedOwnExpense();
    const result = await attachReceipt(receiptFormData(expense.id));
    expect(result).toMatchObject({ ok: false, error: "NO_STORAGE" });
    expect(h.store.attachments).toHaveLength(0);
    expect(h.store.audits).toHaveLength(0);
  });

  describe("with storage configured", () => {
    beforeEach(() => {
      vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          status: 200,
          text: async () => "",
          json: async () => ({}),
        })),
      );
    });

    it("rejects a file outside the whitelist before any upload", async () => {
      const expense = seedOwnExpense();
      const bad = new File([new Uint8Array([1])], "virus.exe", {
        type: "application/octet-stream",
      });
      const result = await attachReceipt(receiptFormData(expense.id, bad));
      expect(result).toMatchObject({ ok: false, error: "INVALID_FILE" });
      expect(fetch).not.toHaveBeenCalled();
      expect(h.store.attachments).toHaveLength(0);
    });

    it("locks attachments from SUBMITTED onwards", async () => {
      const expense = seedOwnExpense({ status: "SUBMITTED" });
      const result = await attachReceipt(receiptFormData(expense.id));
      expect(result).toMatchObject({ ok: false, error: "ATTACHMENT_LOCKED" });
      expect(h.store.attachments).toHaveLength(0);
    });

    it("uploads and upserts the metadata with the REAL db user id + audit", async () => {
      const expense = seedOwnExpense();
      const result = await attachReceipt(receiptFormData(expense.id));
      expect(result.ok).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(h.store.attachments).toHaveLength(1);
      expect(h.store.attachments[0]).toMatchObject({
        expenseId: expense.id,
        fileName: "nota.pdf",
        contentType: "application/pdf",
        storageBucket: "expense-receipts",
        // FK uses the resolved db user, never the "dev-user" session id.
        uploadedByUserId: "user-1",
      });
      expect(
        h.store.attachments[0].storageKey.startsWith(`expenses/${expense.id}/`),
      ).toBe(true);
      expect(h.store.audits).toHaveLength(1);
      expect(h.store.audits[0]).toMatchObject({
        action: "EXPENSE_ATTACHMENT_ADDED",
        actorUserId: "user-1",
      });
    });
  });
});

describe("replaceReceipt", () => {
  interface FetchCall {
    url: string;
    method: string;
  }

  function seedOldAttachment(expenseId: string): AttachmentRec {
    const attachment: AttachmentRec = {
      id: "att-old",
      expenseId,
      fileName: "antiga.pdf",
      contentType: "application/pdf",
      size: 10,
      storageBucket: "expense-receipts",
      storageKey: `expenses/${expenseId}/old-antiga.pdf`,
      uploadedByUserId: "user-1",
    };
    h.store.attachments.push(attachment);
    return attachment;
  }

  /** fetch mock that records calls; DELETE responses are configurable. */
  function stubFetch(calls: FetchCall[], deleteOk = true) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: { method?: string }) => {
        const method = init?.method ?? "GET";
        calls.push({ url: String(url), method });
        const ok = method === "DELETE" ? deleteOk : true;
        return {
          ok,
          status: ok ? 200 : 500,
          text: async () => (ok ? "" : "boom"),
          json: async () => ({}),
        };
      }),
    );
  }

  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  });

  it("replaces the row/key and deletes the old object only AFTER persisting", async () => {
    const expense = seedOwnExpense();
    // Snapshot the key: the in-memory upsert mutates the seeded record.
    const oldKey = seedOldAttachment(expense.id).storageKey;
    const calls: FetchCall[] = [];
    stubFetch(calls);

    const result = await replaceReceipt(
      receiptFormData(
        expense.id,
        new File([new Uint8Array([9, 9])], "nova.pdf", {
          type: "application/pdf",
        }),
      ),
    );

    expect(result.ok).toBe(true);
    // 1:1 upsert: still ONE attachment row, now pointing at the new key.
    expect(h.store.attachments).toHaveLength(1);
    expect(h.store.attachments[0]).toMatchObject({
      id: "att-old",
      expenseId: expense.id,
      fileName: "nova.pdf",
      uploadedByUserId: "user-1",
    });
    expect(h.store.attachments[0].storageKey).not.toBe(oldKey);
    expect(
      h.store.attachments[0].storageKey.startsWith(`expenses/${expense.id}/`),
    ).toBe(true);
    expect(h.store.audits).toHaveLength(1);
    expect(h.store.audits[0]).toMatchObject({
      action: "EXPENSE_ATTACHMENT_REPLACED",
      actorUserId: "user-1",
    });
    // Order matters: upload of the NEW key first, delete of the OLD key last.
    expect(calls).toHaveLength(2);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain(h.store.attachments[0].storageKey);
    expect(calls[1].method).toBe("DELETE");
    expect(calls[1].url).toContain(oldKey);
  });

  it("still succeeds when deleting the old object fails (best-effort cleanup)", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const expense = seedOwnExpense();
    seedOldAttachment(expense.id);
    const calls: FetchCall[] = [];
    stubFetch(calls, false); // DELETE responds 500

    const result = await replaceReceipt(receiptFormData(expense.id));

    // The metadata is already persisted; an orphan in the bucket is
    // acceptable, so the failed delete must never fail the action.
    expect(result.ok).toBe(true);
    expect(h.store.attachments).toHaveLength(1);
    expect(h.store.attachments[0].fileName).toBe("nota.pdf");
    expect(h.store.audits[0]).toMatchObject({
      action: "EXPENSE_ATTACHMENT_REPLACED",
    });
    expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("locks replacement from SUBMITTED onwards (same window as attach)", async () => {
    const expense = seedOwnExpense({ status: "SUBMITTED" });
    seedOldAttachment(expense.id);
    const calls: FetchCall[] = [];
    stubFetch(calls);

    const result = await replaceReceipt(receiptFormData(expense.id));
    expect(result).toMatchObject({ ok: false, error: "ATTACHMENT_LOCKED" });
    expect(h.store.attachments[0].fileName).toBe("antiga.pdf");
    expect(calls).toHaveLength(0);
  });
});

describe("submitExpense", () => {
  it("submits a DRAFT, stamps submittedAt and audits with the real user id", async () => {
    const expense = seedOwnExpense();
    const result = await submitExpense({ id: expense.id });
    expect(result.ok).toBe(true);
    expect(h.store.expenses[0].status).toBe("SUBMITTED");
    expect(h.store.expenses[0].submittedAt).toBeInstanceOf(Date);
    expect(h.store.audits).toHaveLength(1);
    expect(h.store.audits[0]).toMatchObject({
      action: "EXPENSE_SUBMITTED",
      entityType: "Expense",
      actorUserId: "user-1",
    });
  });

  it("does not resubmit (status guard, idempotent)", async () => {
    const expense = seedOwnExpense();
    await submitExpense({ id: expense.id });
    const firstSubmittedAt = h.store.expenses[0].submittedAt;
    const second = await submitExpense({ id: expense.id });
    expect(second).toMatchObject({ ok: false, error: "NOT_EDITABLE" });
    expect(h.store.expenses[0].submittedAt).toBe(firstSubmittedAt);
    expect(h.store.audits).toHaveLength(1);
  });

  it("does not submit a rejected expense directly (must edit first)", async () => {
    const expense = seedOwnExpense({ status: "MANAGER_REJECTED" });
    const result = await submitExpense({ id: expense.id });
    expect(result).toMatchObject({ ok: false, error: "NOT_EDITABLE" });
  });
});

describe("decideAsManager", () => {
  it("requires a comment to reject", async () => {
    const expense = seedExpense({ status: "SUBMITTED" });
    const result = await decideAsManager({
      expenseId: expense.id,
      decision: "REJECTED",
      comment: "  ",
    });
    expect(result).toMatchObject({ ok: false, error: "COMMENT_REQUIRED" });
  });

  it("approves SUBMITTED with Approval + AuditEvent in the same transaction", async () => {
    const expense = seedExpense({ status: "SUBMITTED" });
    const result = await decideAsManager({
      expenseId: expense.id,
      decision: "APPROVED",
      comment: "",
    });
    expect(result).toMatchObject({
      ok: true,
      data: { status: "MANAGER_APPROVED" },
    });
    expect(h.store.expenses[0].status).toBe("MANAGER_APPROVED");
    expect(h.store.approvals).toHaveLength(1);
    expect(h.store.approvals[0]).toMatchObject({
      entityType: "EXPENSE",
      entityId: expense.id,
      approverUserId: "user-1", // real db id, never the "dev-user" session id
      status: "APPROVED",
      isAutomatic: false,
    });
    expect(h.store.audits).toHaveLength(1);
    expect(h.store.audits[0]).toMatchObject({
      action: "EXPENSE_MANAGER_APPROVED",
      actorUserId: "user-1",
    });
  });

  it("returns ALREADY_DECIDED for a non-SUBMITTED expense without writing rows", async () => {
    const expense = seedExpense({ status: "MANAGER_APPROVED" });
    const result = await decideAsManager({
      expenseId: expense.id,
      decision: "APPROVED",
      comment: "",
    });
    expect(result).toMatchObject({ ok: false, error: "ALREADY_DECIDED" });
    expect(h.store.approvals).toHaveLength(0);
    expect(h.store.audits).toHaveLength(0);
  });

  it("forbids a PROJECT_MANAGER outside the project scope", async () => {
    h.store.currentUser.roles = ["PROJECT_MANAGER"];
    const expense = seedExpense({ status: "SUBMITTED", projectId: "proj-other" });
    const result = await decideAsManager({
      expenseId: expense.id,
      decision: "APPROVED",
      comment: "",
    });
    expect(result).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(h.store.expenses[0].status).toBe("SUBMITTED");
  });

  it("blocks deciding your own expense (SELF_APPROVAL), even as ADMIN", async () => {
    const expense = seedOwnExpense({ status: "SUBMITTED" });
    const result = await decideAsManager({
      expenseId: expense.id,
      decision: "APPROVED",
      comment: "",
    });
    expect(result).toMatchObject({ ok: false, error: "SELF_APPROVAL" });
    expect(h.store.expenses[0].status).toBe("SUBMITTED");
    expect(h.store.approvals).toHaveLength(0);
  });
});

describe("decideAsFinance", () => {
  it("approves MANAGER_APPROVED into FINANCE_APPROVED", async () => {
    h.store.currentUser.roles = ["FINANCE"];
    const expense = seedExpense({ status: "MANAGER_APPROVED" });
    const result = await decideAsFinance({
      expenseId: expense.id,
      decision: "APPROVED",
      comment: "",
    });
    expect(result).toMatchObject({
      ok: true,
      data: { status: "FINANCE_APPROVED" },
    });
    expect(h.store.approvals).toHaveLength(1);
    expect(h.store.audits[0]).toMatchObject({
      action: "EXPENSE_FINANCE_APPROVED",
    });
  });

  it("returns ALREADY_DECIDED when the expense is not MANAGER_APPROVED", async () => {
    const expense = seedExpense({ status: "SUBMITTED" });
    const result = await decideAsFinance({
      expenseId: expense.id,
      decision: "APPROVED",
      comment: "",
    });
    expect(result).toMatchObject({ ok: false, error: "ALREADY_DECIDED" });
    expect(h.store.expenses[0].status).toBe("SUBMITTED");
  });

  it("blocks the finance stage on your own expense (SELF_APPROVAL)", async () => {
    const expense = seedOwnExpense({ status: "MANAGER_APPROVED" });
    const result = await decideAsFinance({
      expenseId: expense.id,
      decision: "APPROVED",
      comment: "",
    });
    expect(result).toMatchObject({ ok: false, error: "SELF_APPROVAL" });
  });
});

describe("setPayment", () => {
  it("schedules a FINANCE_APPROVED expense with audit only (no Approval)", async () => {
    const expense = seedExpense({ status: "FINANCE_APPROVED" });
    const result = await setPayment({ expenseId: expense.id, action: "SCHEDULE" });
    expect(result).toMatchObject({
      ok: true,
      data: { status: "PAYMENT_SCHEDULED" },
    });
    expect(h.store.approvals).toHaveLength(0);
    expect(h.store.audits).toHaveLength(1);
    expect(h.store.audits[0]).toMatchObject({
      action: "EXPENSE_PAYMENT_SCHEDULED",
      actorUserId: "user-1",
    });
  });

  it("refuses MARK_PAID without a schedule", async () => {
    const expense = seedExpense({ status: "FINANCE_APPROVED" });
    const result = await setPayment({ expenseId: expense.id, action: "MARK_PAID" });
    expect(result).toMatchObject({ ok: false, error: "ALREADY_DECIDED" });
    expect(h.store.expenses[0].status).toBe("FINANCE_APPROVED");
  });

  it("requires a reason on CANCEL_SCHEDULE", async () => {
    const expense = seedExpense({ status: "PAYMENT_SCHEDULED" });
    const result = await setPayment({
      expenseId: expense.id,
      action: "CANCEL_SCHEDULE",
      reason: "  ",
    });
    expect(result).toMatchObject({ ok: false, error: "COMMENT_REQUIRED" });
    expect(h.store.expenses[0].status).toBe("PAYMENT_SCHEDULED");
  });

  it("requires a reason on CANCEL_SCHEDULE even when the field is omitted", async () => {
    const expense = seedExpense({ status: "PAYMENT_SCHEDULED" });
    const result = await setPayment({
      expenseId: expense.id,
      action: "CANCEL_SCHEDULE",
    });
    expect(result).toMatchObject({ ok: false, error: "COMMENT_REQUIRED" });
    expect(h.store.expenses[0].status).toBe("PAYMENT_SCHEDULED");
    expect(h.store.audits).toHaveLength(0);
  });

  it("cancels a schedule back to FINANCE_APPROVED, auditing the reason", async () => {
    const expense = seedExpense({ status: "PAYMENT_SCHEDULED" });
    const result = await setPayment({
      expenseId: expense.id,
      action: "CANCEL_SCHEDULE",
      reason: "Conta bancária divergente.",
    });
    expect(result).toMatchObject({
      ok: true,
      data: { status: "FINANCE_APPROVED" },
    });
    expect(h.store.audits[0]).toMatchObject({
      action: "EXPENSE_PAYMENT_CANCELLED",
      after: { reason: "Conta bancária divergente." },
    });
  });

  it("treats PAID as terminal for EVERY payment action", async () => {
    const expense = seedExpense({ status: "PAID" });
    expect(
      await setPayment({ expenseId: expense.id, action: "SCHEDULE" }),
    ).toMatchObject({ ok: false, error: "ALREADY_DECIDED" });
    expect(
      await setPayment({ expenseId: expense.id, action: "MARK_PAID" }),
    ).toMatchObject({ ok: false, error: "ALREADY_DECIDED" });
    expect(
      await setPayment({
        expenseId: expense.id,
        action: "CANCEL_SCHEDULE",
        reason: "Tentativa indevida.",
      }),
    ).toMatchObject({ ok: false, error: "ALREADY_DECIDED" });
    expect(h.store.expenses[0].status).toBe("PAID");
    expect(h.store.audits).toHaveLength(0);
  });

  it("blocks paying your own expense (SELF_APPROVAL)", async () => {
    const expense = seedOwnExpense({ status: "FINANCE_APPROVED" });
    const result = await setPayment({ expenseId: expense.id, action: "SCHEDULE" });
    expect(result).toMatchObject({ ok: false, error: "SELF_APPROVAL" });
  });
});

describe("role guards (requireRole)", () => {
  // requireRole redirects to /access-denied (NEXT_REDIRECT control flow);
  // the action must rethrow it, never convert it to an ActionResult.
  function expectAccessDenied(promise: Promise<unknown>) {
    return expect(promise).rejects.toMatchObject({
      digest: expect.stringContaining("/access-denied"),
    });
  }

  it("blocks a pure FINANCE user from the manager stage", async () => {
    h.store.currentUser.roles = ["FINANCE"];
    const expense = seedExpense({ status: "SUBMITTED" });
    await expectAccessDenied(
      decideAsManager({
        expenseId: expense.id,
        decision: "APPROVED",
        comment: "",
      }),
    );
    expect(h.store.expenses[0].status).toBe("SUBMITTED");
    expect(h.store.approvals).toHaveLength(0);
    expect(h.store.audits).toHaveLength(0);
  });

  it("blocks a pure CONSULTANT from the finance stage", async () => {
    h.store.currentUser.roles = ["CONSULTANT"];
    const expense = seedExpense({ status: "MANAGER_APPROVED" });
    await expectAccessDenied(
      decideAsFinance({
        expenseId: expense.id,
        decision: "APPROVED",
        comment: "",
      }),
    );
    expect(h.store.expenses[0].status).toBe("MANAGER_APPROVED");
    expect(h.store.approvals).toHaveLength(0);
  });

  it("blocks a pure CONSULTANT from every payment action", async () => {
    h.store.currentUser.roles = ["CONSULTANT"];
    const expense = seedExpense({ status: "FINANCE_APPROVED" });
    await expectAccessDenied(
      setPayment({ expenseId: expense.id, action: "SCHEDULE" }),
    );
    await expectAccessDenied(
      setPayment({ expenseId: expense.id, action: "MARK_PAID" }),
    );
    expect(h.store.expenses[0].status).toBe("FINANCE_APPROVED");
    expect(h.store.audits).toHaveLength(0);
  });

  it("blocks a pure PROJECT_MANAGER from the finance stage and payment", async () => {
    h.store.currentUser.roles = ["PROJECT_MANAGER"];
    const expense = seedExpense({ status: "MANAGER_APPROVED" });
    await expectAccessDenied(
      decideAsFinance({
        expenseId: expense.id,
        decision: "APPROVED",
        comment: "",
      }),
    );
    await expectAccessDenied(
      setPayment({ expenseId: expense.id, action: "SCHEDULE" }),
    );
    expect(h.store.expenses[0].status).toBe("MANAGER_APPROVED");
  });

  it("lets FINANCE through the finance stage (positive control)", async () => {
    h.store.currentUser.roles = ["FINANCE"];
    const expense = seedExpense({ status: "MANAGER_APPROVED" });
    const result = await decideAsFinance({
      expenseId: expense.id,
      decision: "APPROVED",
      comment: "",
    });
    expect(result).toMatchObject({ ok: true });
  });
});

describe("guards", () => {
  // EVERY action must fail closed (NO_DATABASE) when no database is
  // configured — never fall back to mock state from a server action.
  const noDbCases: ReadonlyArray<[string, () => Promise<{ ok: boolean }>]> = [
    ["createExpense", () => createExpense(baseInput)],
    [
      "updateExpense",
      () => updateExpense({ id: "exp-x", amount: 10, description: "x" }),
    ],
    ["deleteExpense", () => deleteExpense({ id: "exp-x" })],
    ["submitExpense", () => submitExpense({ id: "exp-x" })],
    [
      "decideAsManager",
      () =>
        decideAsManager({ expenseId: "exp-x", decision: "APPROVED", comment: "" }),
    ],
    [
      "decideAsFinance",
      () =>
        decideAsFinance({ expenseId: "exp-x", decision: "APPROVED", comment: "" }),
    ],
    ["setPayment", () => setPayment({ expenseId: "exp-x", action: "SCHEDULE" })],
  ];

  it.each(noDbCases)(
    "%s returns NO_DATABASE when no database is configured",
    async (_name, call) => {
      vi.stubEnv("DATABASE_URL", "");
      expect(await call()).toMatchObject({ ok: false, error: "NO_DATABASE" });
    },
  );

  it("returns NO_CONSULTANT when the user has no linked consultant", async () => {
    h.store.consultants = [];
    const result = await createExpense(baseInput);
    expect(result).toMatchObject({ ok: false, error: "NO_CONSULTANT" });
  });
});
