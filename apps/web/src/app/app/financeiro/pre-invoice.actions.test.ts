import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pre-invoice server-action tests (Fase G): gating (CLOSED only), e-mail
 * idempotency (2x does not re-send), and honest degrade when the client has no
 * contactEmail. Dependencies are mocked at module boundaries; the pure builder
 * is tested separately in lib/billing/pre-invoice.test.ts.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const h = vi.hoisted(() => {
  const store = {
    closing: null as Any,
    emailLogs: [] as Array<{
      type: string;
      referenceKey: string;
      recipient: string;
      status: string;
      error: string | null;
      meta: unknown;
    }>,
    audits: [] as Array<Record<string, unknown>>,
    currentUser: { id: "dev-user", roles: ["FINANCE"] as string[] },
    sendCalls: 0,
    lastMessage: null as Any,
    storageConfigured: false,
    uploads: [] as Array<{ key: string }>,
    timeEntries: [] as Array<{
      consultantId: string;
      hours: number;
      consultant: { name: string };
    }>,
  };

  const emailLogKey = (where: Any) => where.type_referenceKey;

  const prismaMock = {
    timeEntry: {
      findMany: async () => store.timeEntries,
    },
    automationEmailLog: {
      findUnique: async ({ where }: { where: Any }) => {
        const k = emailLogKey(where);
        const found = store.emailLogs.find(
          (l) => l.type === k.type && l.referenceKey === k.referenceKey,
        );
        return found ? { ...found } : null;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: Any;
        create: Any;
        update: Any;
      }) => {
        const k = emailLogKey(where);
        const existing = store.emailLogs.find(
          (l) => l.type === k.type && l.referenceKey === k.referenceKey,
        );
        if (existing) {
          Object.assign(existing, update);
          return { ...existing };
        }
        const row = { ...create };
        store.emailLogs.push(row);
        return { ...row };
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Any }) => {
        store.audits.push(data);
        return { ...data };
      },
    },
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
  requireRole: vi.fn(async (roles: string | string[]) => {
    const required = Array.isArray(roles) ? roles : [roles];
    const allowed =
      required.length === 0 ||
      required.some((role) => h.store.currentUser.roles.includes(role));
    if (!allowed) {
      const err = new Error("NEXT_REDIRECT");
      Object.assign(err, { digest: "NEXT_REDIRECT;replace;/access-denied;307;" });
      throw err;
    }
    return h.store.currentUser;
  }),
}));

vi.mock("@/lib/db/users", () => ({
  resolveDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/db/revenue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/revenue")>();
  return {
    ...actual,
    getRevenueClosingForPreInvoice: vi.fn(async () => h.store.closing),
  };
});

vi.mock("@/lib/nfse/provider", () => ({ getNfseProvider: vi.fn() }));

vi.mock("@/lib/storage/provider", () => ({
  isStorageConfigured: vi.fn(() => h.store.storageConfigured),
  getStorageProvider: vi.fn(() => ({
    upload: async (key: string) => {
      h.store.uploads.push({ key });
    },
    delete: async () => {},
    getSignedUrl: async () => "https://signed.example/pre-fatura",
  })),
}));

const sendMock = vi.fn(async (message: Any) => {
  h.store.sendCalls += 1;
  h.store.lastMessage = message;
  return { id: "msg-1", provider: "console" };
});
vi.mock("@/lib/automation/email-transport", () => ({
  getEmailTransport: vi.fn(() => ({ send: sendMock })),
}));

import { generatePreInvoice, sendPreInvoiceEmail } from "./actions";

function closingFixture(over: Partial<Any> = {}): Any {
  return {
    closing: {
      id: "rc-1",
      month: 6,
      year: 2026,
      status: "CLOSED",
      adjustmentAmount: 0,
      projectId: "p-1",
    },
    client: {
      id: "cli-1",
      name: "Atlas Energia",
      document: "12.345.678/0001-90",
      contactEmail: "financeiro@atlas.com",
      billingEmails: [],
      municipality: "Sao Paulo",
      issRate: 2,
    },
    project: { id: "p-1", name: "Alfa", billingAttachHours: false },
    lines: [
      { projectId: "p-1", projectName: "Alfa", hours: 10, unitRate: 200, amount: 2000 },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.closing = closingFixture();
  h.store.emailLogs = [];
  h.store.audits = [];
  h.store.currentUser = { id: "dev-user", roles: ["FINANCE"] };
  h.store.sendCalls = 0;
  h.store.lastMessage = null;
  h.store.storageConfigured = false;
  h.store.uploads = [];
  h.store.timeEntries = [];
  sendMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("generatePreInvoice — gating + degrade", () => {
  it("rejects when the closing is not CLOSED", async () => {
    h.store.closing = closingFixture({
      closing: {
        id: "rc-1",
        month: 6,
        year: 2026,
        status: "READY_TO_CLOSE",
        adjustmentAmount: 0,
      },
    });
    const result = await generatePreInvoice({ closingId: "rc-1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INVALID_INPUT");
  });

  it("returns the HTML on screen and does not store when storage is unconfigured", async () => {
    const result = await generatePreInvoice({ closingId: "rc-1" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.stored).toBe(false);
      expect(result.data.storageKey).toBeNull();
      expect(result.data.html).toContain("Pre-fatura");
    }
    expect(h.store.uploads).toHaveLength(0);
    expect(h.store.audits).toHaveLength(1);
  });

  it("persists the artifact and returns a signed url when storage is configured", async () => {
    h.store.storageConfigured = true;
    const result = await generatePreInvoice({ closingId: "rc-1" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.stored).toBe(true);
      expect(result.data.storageKey).toBe("2026-06/pre-fatura-rc-1.html");
      expect(result.data.downloadUrl).toBe("https://signed.example/pre-fatura");
    }
    expect(h.store.uploads).toHaveLength(1);
  });

  it("denies non-financial roles (RBAC redirect)", async () => {
    h.store.currentUser = { id: "dev-user", roles: ["CONSULTANT"] };
    await expect(generatePreInvoice({ closingId: "rc-1" })).rejects.toThrow(
      /NEXT_REDIRECT/,
    );
  });
});

describe("sendPreInvoiceEmail — idempotency + degrade", () => {
  it("sends once and records a SENT log", async () => {
    const result = await sendPreInvoiceEmail({ closingId: "rc-1" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.emailed).toBe(true);
      expect(result.data.alreadySent).toBe(false);
    }
    expect(h.store.sendCalls).toBe(1);
    expect(h.store.emailLogs).toHaveLength(1);
    expect(h.store.emailLogs[0]!.status).toBe("SENT");
    expect(h.store.emailLogs[0]!.referenceKey).toBe("rc-1:2026-06");
  });

  it("does not re-send when already SENT (idempotent)", async () => {
    await sendPreInvoiceEmail({ closingId: "rc-1" });
    expect(h.store.sendCalls).toBe(1);

    const second = await sendPreInvoiceEmail({ closingId: "rc-1" });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.data.alreadySent).toBe(true);
    // No second transport call: the SENT log short-circuited the re-send.
    expect(h.store.sendCalls).toBe(1);
    expect(h.store.emailLogs).toHaveLength(1);
  });

  it("retries after a FAILED log (promotes FAILED -> SENT)", async () => {
    sendMock.mockImplementationOnce(async () => {
      h.store.sendCalls += 1;
      throw new Error("transport down");
    });
    const first = await sendPreInvoiceEmail({ closingId: "rc-1" });
    expect(first.ok).toBe(false);
    expect(h.store.emailLogs[0]!.status).toBe("FAILED");

    const retry = await sendPreInvoiceEmail({ closingId: "rc-1" });
    expect(retry.ok).toBe(true);
    expect(h.store.sendCalls).toBe(2);
    expect(h.store.emailLogs).toHaveLength(1);
    expect(h.store.emailLogs[0]!.status).toBe("SENT");
  });

  it("fails honestly when the client has no billing contact at all (no send)", async () => {
    h.store.closing = closingFixture({
      client: {
        id: "cli-1",
        name: "Sem Email",
        document: null,
        contactEmail: null,
        billingEmails: [],
        municipality: null,
        issRate: null,
      },
    });
    const result = await sendPreInvoiceEmail({ closingId: "rc-1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NO_CONTACT_EMAIL");
    expect(h.store.sendCalls).toBe(0);
    expect(h.store.emailLogs).toHaveLength(0);
  });

  it("sends to the billingEmails list when present (not the contactEmail)", async () => {
    h.store.closing = closingFixture({
      client: {
        id: "cli-1",
        name: "Atlas Energia",
        document: null,
        contactEmail: "contato@atlas.com",
        billingEmails: ["cobranca@atlas.com", "financeiro@atlas.com"],
        municipality: null,
        issRate: null,
      },
    });
    const result = await sendPreInvoiceEmail({ closingId: "rc-1" });
    expect(result.ok).toBe(true);
    expect(h.store.sendCalls).toBe(1);
    expect(h.store.lastMessage.to).toEqual(["cobranca@atlas.com", "financeiro@atlas.com"]);
    // contactEmail is NOT used when billingEmails is non-empty.
    expect(h.store.lastMessage.to).not.toContain("contato@atlas.com");
    expect(h.store.emailLogs[0]!.recipient).toBe(
      "cobranca@atlas.com, financeiro@atlas.com",
    );
  });

  it("falls back to contactEmail when billingEmails is empty", async () => {
    const result = await sendPreInvoiceEmail({ closingId: "rc-1" });
    expect(result.ok).toBe(true);
    expect(h.store.lastMessage.to).toEqual(["financeiro@atlas.com"]);
  });

  it("attaches the hours worksheet only when the project flag is on", async () => {
    h.store.closing = closingFixture({
      project: { id: "p-1", name: "Alfa", billingAttachHours: true },
    });
    h.store.timeEntries = [
      { consultantId: "c-1", hours: 8, consultant: { name: "Bia" } },
      { consultantId: "c-1", hours: 2, consultant: { name: "Bia" } },
      { consultantId: "c-2", hours: 5, consultant: { name: "Ana" } },
    ];
    const result = await sendPreInvoiceEmail({ closingId: "rc-1" });
    expect(result.ok).toBe(true);
    expect(h.store.lastMessage.attachments).toHaveLength(1);
    expect(h.store.lastMessage.attachments[0].filename).toBe("horas-alfa-2026-06.xlsx");
    expect(h.store.lastMessage.attachments[0].encoding).toBe("base64");
    expect(h.store.emailLogs[0]!.meta).toMatchObject({ attachedHours: true });
  });

  it("does not attach when the closing has no projectId (client-scoped)", async () => {
    h.store.closing = closingFixture({
      closing: {
        id: "rc-1",
        month: 6,
        year: 2026,
        status: "CLOSED",
        adjustmentAmount: 0,
        projectId: null,
      },
      project: null,
    });
    h.store.timeEntries = [
      { consultantId: "c-1", hours: 8, consultant: { name: "Bia" } },
    ];
    const result = await sendPreInvoiceEmail({ closingId: "rc-1" });
    expect(result.ok).toBe(true);
    expect(h.store.lastMessage.attachments).toBeUndefined();
  });

  it("rejects when the closing is not CLOSED", async () => {
    h.store.closing = closingFixture({
      closing: {
        id: "rc-1",
        month: 6,
        year: 2026,
        status: "OPEN",
        adjustmentAmount: 0,
      },
    });
    const result = await sendPreInvoiceEmail({ closingId: "rc-1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INVALID_INPUT");
    expect(h.store.sendCalls).toBe(0);
  });
});
