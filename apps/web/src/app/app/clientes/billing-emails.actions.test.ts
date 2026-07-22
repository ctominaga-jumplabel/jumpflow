import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-action tests for the client billing-emails list (P4).
 *
 * Confirms createClient/updateClient persist the `billingEmails` array,
 * normalize/validate the addresses via Zod (blank/invalid rejected), and audit
 * the change. RBAC gating is enforced by requireRole on the server (mocked here
 * as in sibling tests).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const h = vi.hoisted(() => {
  const store = {
    clients: [] as Array<Record<string, Any>>,
    creates: [] as Array<Record<string, Any>>,
    updates: [] as Array<{ id: string; data: Record<string, Any> }>,
    audits: [] as Array<Record<string, unknown>>,
    currentUser: {
      id: "dev-user",
      name: "Sam",
      email: "sam@jumplabel.com.br",
      roles: ["FINANCE"] as string[],
    },
  };

  const prismaMock = {
    client: {
      create: async ({ data }: { data: Record<string, Any> }) => {
        store.creates.push(data);
        const row = { id: "cli-new", ...data };
        store.clients.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.clients.find((c) => c.id === where.id) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, Any>;
      }) => {
        store.updates.push({ id: where.id, data });
        const row = store.clients.find((c) => c.id === where.id)!;
        Object.assign(row, data);
        return row;
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

vi.mock("@/lib/db/users", () => ({
  resolveDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/db/audit", () => ({
  recordAuditEvent: vi.fn(async (event: Record<string, unknown>) => {
    h.store.audits.push(event);
  }),
}));

vi.mock("@/lib/cnpj/provider", () => ({ getCnpjProvider: vi.fn() }));

vi.mock("@/lib/storage/provider", () => ({
  CLIENT_LOGOS_BUCKET: "client-logos",
  getStorageProvider: vi.fn(),
  isStorageConfigured: vi.fn(() => false),
}));

vi.mock("@/lib/storage/file-validation", () => ({
  buildClientLogoKey: vi.fn(),
  validateLogoFile: vi.fn(),
}));

import { createClient, updateClient } from "./actions";

const baseInput = {
  name: "Atlas Energia",
  document: "",
  contactEmail: "",
  billingEmails: [] as string[],
  logoUrl: "",
  billingTypeId: "",
  defaultHourlyRate: undefined,
  monthlyFee: undefined,
  hourLimit: undefined,
  roundingRule: "NONE" as const,
  billingDay: undefined,
  dueDay: undefined,
  invoiceKind: "SERVICE" as const,
  municipality: "",
  issRate: undefined,
  taxRules: "",
  status: "ACTIVE" as const,
};

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.clients = [
    { id: "cli-1", name: "Atlas", billingEmails: [] },
  ];
  h.store.creates = [];
  h.store.updates = [];
  h.store.audits = [];
  h.store.currentUser = {
    id: "dev-user",
    name: "Sam",
    email: "sam@jumplabel.com.br",
    roles: ["FINANCE"],
  };
});

afterEach(() => vi.unstubAllEnvs());

describe("createClient — billingEmails (P4)", () => {
  it("persists the billing-emails list and audits CLIENT_CREATED", async () => {
    const result = await createClient({
      ...baseInput,
      billingEmails: ["cobranca@atlas.com", "financeiro@atlas.com"],
    });
    expect(result.ok).toBe(true);
    expect(h.store.creates[0]!.billingEmails).toEqual([
      "cobranca@atlas.com",
      "financeiro@atlas.com",
    ]);
    expect(h.store.audits[0]).toMatchObject({ action: "CLIENT_CREATED" });
  });

  it("trims blanks and drops empty entries via Zod", async () => {
    const result = await createClient({
      ...baseInput,
      billingEmails: [" cobranca@atlas.com ", "", "  "],
    } as unknown as Parameters<typeof createClient>[0]);
    expect(result.ok).toBe(true);
    expect(h.store.creates[0]!.billingEmails).toEqual(["cobranca@atlas.com"]);
  });

  it("accepts a multi-line/comma string (textarea) and splits it", async () => {
    const result = await createClient({
      ...baseInput,
      billingEmails: "a@atlas.com, b@atlas.com\nc@atlas.com",
    } as unknown as Parameters<typeof createClient>[0]);
    expect(result.ok).toBe(true);
    expect(h.store.creates[0]!.billingEmails).toEqual([
      "a@atlas.com",
      "b@atlas.com",
      "c@atlas.com",
    ]);
  });

  it("rejects an invalid e-mail with INVALID_INPUT", async () => {
    const result = await createClient({
      ...baseInput,
      billingEmails: ["not-an-email"],
    } as unknown as Parameters<typeof createClient>[0]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INVALID_INPUT");
    expect(h.store.creates).toHaveLength(0);
  });

  it("defaults to an empty list when omitted", async () => {
    const { billingEmails: _omit, ...withoutList } = baseInput;
    void _omit;
    const result = await createClient(
      withoutList as unknown as Parameters<typeof createClient>[0],
    );
    expect(result.ok).toBe(true);
    expect(h.store.creates[0]!.billingEmails).toEqual([]);
  });
});

describe("updateClient — billingEmails (P4)", () => {
  it("persists the updated list and audits CLIENT_UPDATED", async () => {
    const result = await updateClient({
      ...baseInput,
      id: "cli-1",
      billingEmails: ["novo@atlas.com"],
    });
    expect(result.ok).toBe(true);
    expect(h.store.updates[0]!.data.billingEmails).toEqual(["novo@atlas.com"]);
    expect(h.store.audits[0]).toMatchObject({ action: "CLIENT_UPDATED" });
  });

  it("returns NOT_FOUND for an unknown client", async () => {
    const result = await updateClient({
      ...baseInput,
      id: "missing",
      billingEmails: ["x@atlas.com"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");
  });
});
