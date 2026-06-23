import { beforeEach, describe, expect, it, vi } from "vitest";

interface RuleRow {
  event: string;
  scope: string;
  scopeId: string | null;
  active: boolean;
  recipients: Array<{
    type: string;
    channel: string;
    address: string | null;
    name: string | null;
  }>;
}

const h = vi.hoisted(() => {
  const store = {
    rules: [] as RuleRow[],
    roleUsers: [] as Array<{ name: string; email: string }>,
    sentRefs: new Set<string>(),
    upserts: [] as Array<{ referenceKey: string; status: string }>,
    sent: [] as Array<{ to: string[]; subject: string }>,
  };
  const prismaMock = {
    notificationRule: {
      findMany: async ({ where }: { where: { event: string } }) =>
        store.rules.filter((r) => r.event === where.event && r.active),
    },
    user: {
      findMany: async () => store.roleUsers,
      findUnique: async () => null,
    },
    project: { findUnique: async () => null },
    client: { findUnique: async () => null },
    automationEmailLog: {
      findMany: async ({
        where,
      }: {
        where: { referenceKey: { in: string[] } };
      }) =>
        where.referenceKey.in
          .filter((ref) => store.sentRefs.has(ref))
          .map((ref) => ({ referenceKey: ref })),
      upsert: async ({
        create,
      }: {
        create: { referenceKey: string; status: string };
      }) => {
        store.upserts.push({
          referenceKey: create.referenceKey,
          status: create.status,
        });
        if (create.status === "SENT") store.sentRefs.add(create.referenceKey);
        return create;
      },
    },
  };
  return { store, prismaMock };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: { JsonNull: "__JsonNull__" },
}));

vi.mock("@/lib/automation/email-transport", () => ({
  getEmailTransport: () => ({
    send: async (message: { to: string[]; subject: string }) => {
      h.store.sent.push(message);
      return { id: `msg-${h.store.sent.length}`, provider: "test" };
    },
  }),
}));

import { paragraph } from "../email/layout";
import { emitNotification } from "./emit";

function emit(dedupeKey = "proj-1") {
  return emitNotification({
    event: "PROJECT_CREATED",
    scope: { type: "GLOBAL" },
    context: { projectId: "proj-1", clientId: "cli-1" },
    dedupeKey,
    buildFragment: (recipient) => ({
      recipient,
      title: "Novo projeto",
      blocks: [paragraph(`Olá ${recipient.name ?? recipient.address}`)],
    }),
  });
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.rules = [
    {
      event: "PROJECT_CREATED",
      scope: "GLOBAL",
      scopeId: null,
      active: true,
      recipients: [{ type: "ROLE", channel: "EMAIL", address: "FINANCE", name: null }],
    },
  ];
  h.store.roleUsers = [
    { name: "Fin A", email: "fin-a@x.com" },
    { name: "Fin B", email: "fin-b@x.com" },
  ];
  h.store.sentRefs = new Set();
  h.store.upserts = [];
  h.store.sent = [];
});

describe("emitNotification", () => {
  it("resolves ROLE recipients and sends one email per user", async () => {
    const res = await emit();
    expect(res.sent).toBe(2);
    expect(h.store.sent.map((m) => m.to[0]).sort()).toEqual([
      "fin-a@x.com",
      "fin-b@x.com",
    ]);
    expect(h.store.upserts).toHaveLength(2);
  });

  it("is idempotent: a second emit with the same dedupeKey skips delivered recipients", async () => {
    await emit();
    h.store.sent = [];
    const res = await emit();
    expect(res.sent).toBe(0);
    expect(res.skipped).toBe(2);
    expect(h.store.sent).toHaveLength(0);
  });

  it("sends nothing when no active rule matches the event", async () => {
    h.store.rules = [];
    const res = await emit();
    expect(res).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(h.store.sent).toHaveLength(0);
  });

  it("no-ops without throwing when the database is not configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const res = await emit();
    expect(res).toEqual({ sent: 0, skipped: 0, failed: 0 });
  });
});
