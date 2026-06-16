import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * NFS-e issuance server-action tests (Fase H): provider success transitions the
 * fiscal document to ISSUED with invoiceNumber + protocol + issuedAt and stores
 * the XML; provider failure transitions to FAILED + errorMessage (retry kept);
 * the IntegrationEvent is idempotent per fiscalDocument+competence. Provider is
 * mocked — NO real network, NO certificate.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const h = vi.hoisted(() => {
  const store = {
    document: null as Any,
    closing: null as Any,
    audits: [] as Array<Record<string, unknown>>,
    integrationEvents: [] as Array<Any>,
    currentUser: { id: "dev-user", roles: ["FINANCE"] as string[] },
    storageConfigured: false,
    uploads: [] as Array<{ key: string }>,
    providerResult: null as Any,
    providerCalls: 0,
  };

  const tx = {
    fiscalDocument: {
      update: async ({ where, data }: { where: Any; data: Any }) => {
        if (store.document?.id === where.id) {
          Object.assign(store.document, data);
        }
        return { ...store.document };
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Any }) => {
        store.audits.push(data);
        return { ...data };
      },
    },
  };

  const prismaMock = {
    fiscalDocument: {
      findFirst: async () => (store.document ? { ...store.document } : null),
      update: tx.fiscalDocument.update,
    },
    auditEvent: { create: tx.auditEvent.create },
    integrationEvent: {
      upsert: async ({ where, create, update }: { where: Any; create: Any; update: Any }) => {
        const key = where.provider_idempotencyKey;
        const existing = store.integrationEvents.find(
          (e) => e.provider === key.provider && e.idempotencyKey === key.idempotencyKey,
        );
        if (existing) {
          Object.assign(existing, update);
          return { ...existing };
        }
        const row = { ...create };
        store.integrationEvents.push(row);
        return { ...row };
      },
    },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };

  return { store, prismaMock };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: {
    JsonNull: "__JsonNull__",
    PrismaClientKnownRequestError: class {},
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

const requestIssueMock = vi.fn(async () => {
  h.store.providerCalls += 1;
  return h.store.providerResult;
});
vi.mock("@/lib/nfse/provider", () => ({
  getNfseProvider: vi.fn(() => ({ requestIssue: requestIssueMock })),
}));

vi.mock("@/lib/storage/provider", () => ({
  isStorageConfigured: vi.fn(() => h.store.storageConfigured),
  getStorageProvider: vi.fn(() => ({
    upload: async (key: string) => {
      h.store.uploads.push({ key });
    },
    delete: async () => {},
    getSignedUrl: async () => "https://signed.example/nfse",
  })),
}));

import { requestFiscalDocumentIssue } from "./actions";

function closingFixture(): Any {
  return {
    closing: { id: "rc-1", month: 6, year: 2026, status: "CLOSED", adjustmentAmount: 0 },
    client: {
      id: "cli-1",
      name: "Atlas Energia",
      document: "98765432000110",
      contactEmail: "fin@atlas.com",
      municipality: "Sao Paulo",
      issRate: 2,
    },
    lines: [{ projectId: "p-1", projectName: "Alfa", hours: 10, unitRate: 250, amount: 2500 }],
  };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.document = {
    id: "doc-1",
    status: "DRAFT",
    revenueClosingId: "rc-1",
    revenueClosing: { totalAmount: 2500, clientId: "cli-1" },
  };
  h.store.closing = closingFixture();
  h.store.audits = [];
  h.store.integrationEvents = [];
  h.store.currentUser = { id: "dev-user", roles: ["FINANCE"] };
  h.store.storageConfigured = false;
  h.store.uploads = [];
  h.store.providerCalls = 0;
  h.store.providerResult = {
    ok: true,
    data: {
      provider: "SAO_PAULO_NFSE",
      invoiceNumber: "00099",
      protocol: "555",
      verificationCode: "VC1",
      requestXml: "<RPS/>",
      responseXml: "<Retorno><NumeroNFe>00099</NumeroNFe></Retorno>",
    },
  };
  requestIssueMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requestFiscalDocumentIssue — transitions + idempotency", () => {
  it("transitions DRAFT -> ISSUED with invoice number, protocol and issuedAt", async () => {
    const result = await requestFiscalDocumentIssue({ closingId: "rc-1" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("ISSUED");
    expect(h.store.document.status).toBe("ISSUED");
    expect(h.store.document.invoiceNumber).toBe("00099");
    expect(h.store.document.protocol).toBe("555");
    expect(h.store.document.issuedAt).toBeInstanceOf(Date);
    expect(h.store.document.errorMessage).toBeNull();
  });

  it("records a SUCCESS IntegrationEvent keyed per fiscal document + competence", async () => {
    await requestFiscalDocumentIssue({ closingId: "rc-1" });
    expect(h.store.integrationEvents).toHaveLength(1);
    expect(h.store.integrationEvents[0]).toMatchObject({
      provider: "SAO_PAULO_NFSE",
      operation: "ISSUE_NFSE",
      status: "SUCCESS",
      idempotencyKey: "doc-1:2026-06",
    });
  });

  it("stores the response XML when storage is configured", async () => {
    h.store.storageConfigured = true;
    await requestFiscalDocumentIssue({ closingId: "rc-1" });
    expect(h.store.uploads).toHaveLength(1);
    expect(h.store.uploads[0]!.key).toBe("2026-06/nfse-doc-1.xml");
    expect(h.store.document.xmlStorageBucket).toBe("nfse");
    expect(h.store.document.xmlStorageKey).toBe("2026-06/nfse-doc-1.xml");
  });

  it("does not store when storage is unconfigured but still issues", async () => {
    await requestFiscalDocumentIssue({ closingId: "rc-1" });
    expect(h.store.uploads).toHaveLength(0);
    expect(h.store.document.status).toBe("ISSUED");
    expect(h.store.document.xmlStorageKey).toBeNull();
  });

  it("transitions to FAILED with the provider message and keeps retry open", async () => {
    h.store.providerResult = {
      ok: false,
      error: "INVALID_INPUT",
      message: "Provider NFS-e nao configurado.",
    };
    const result = await requestFiscalDocumentIssue({ closingId: "rc-1" });
    expect(result.ok).toBe(false);
    expect(h.store.document.status).toBe("FAILED");
    expect(h.store.document.errorMessage).toBe("Provider NFS-e nao configurado.");
    // FAILED is a valid starting point for a retry.
    expect(["DRAFT", "FAILED"]).toContain(h.store.document.status);
    expect(h.store.integrationEvents[0]!.status).toBe("FAILED");
  });

  it("is idempotent: a retry reuses the same IntegrationEvent row", async () => {
    h.store.providerResult = { ok: false, error: "UNEXPECTED", message: "down" };
    await requestFiscalDocumentIssue({ closingId: "rc-1" });
    // Retry succeeds; same idempotency key -> still a single row, promoted.
    h.store.providerResult = {
      ok: true,
      data: { provider: "SAO_PAULO_NFSE", invoiceNumber: "00099", protocol: "555", requestXml: "<RPS/>" },
    };
    await requestFiscalDocumentIssue({ closingId: "rc-1" });
    expect(h.store.integrationEvents).toHaveLength(1);
    expect(h.store.integrationEvents[0]!.status).toBe("SUCCESS");
  });

  it("denies non-financial roles (RBAC redirect)", async () => {
    h.store.currentUser = { id: "dev-user", roles: ["CONSULTANT"] };
    await expect(
      requestFiscalDocumentIssue({ closingId: "rc-1" }),
    ).rejects.toThrow(/NEXT_REDIRECT/);
  });
});
