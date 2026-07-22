import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Recipient resolution — focus on CLIENT_CONTACT honoring the P4 billing list.
 *
 * A CLIENT_CONTACT recipient must resolve to the client's `billingEmails`
 * (cobrança), falling back to `contactEmail` only when the list is empty. This
 * guards against a rule configured with CLIENT_CONTACT silently dropping the
 * billing recipients.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

const h = vi.hoisted(() => ({
  client: {
    findUnique: vi.fn(),
  },
  project: {
    findUnique: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
}));

vi.mock("@jumpflow/database", () => ({ prisma: h }));
vi.mock("@/lib/db/config", () => ({ isDatabaseConfigured: () => true }));

import { resolveRecipients } from "./resolve";

const clientContactRule = [
  {
    type: "CLIENT_CONTACT" as const,
    channel: "EMAIL" as const,
    address: null,
    name: null,
  },
];

beforeEach(() => {
  h.client.findUnique.mockReset();
});

describe("resolveClientContact (CLIENT_CONTACT)", () => {
  it("resolves to every billingEmail when the list is non-empty", async () => {
    h.client.findUnique.mockResolvedValue({
      name: "Atlas",
      contactEmail: "contato@atlas.com",
      billingEmails: ["cobranca@atlas.com", "contas@atlas.com"],
    });
    const resolved = await resolveRecipients(clientContactRule, {
      clientId: "cli-1",
    });
    expect(resolved.map((r) => r.address)).toEqual([
      "cobranca@atlas.com",
      "contas@atlas.com",
    ]);
  });

  it("falls back to contactEmail when billingEmails is empty", async () => {
    h.client.findUnique.mockResolvedValue({
      name: "Atlas",
      contactEmail: "contato@atlas.com",
      billingEmails: [],
    });
    const resolved = await resolveRecipients(clientContactRule, {
      clientId: "cli-1",
    });
    expect(resolved.map((r) => r.address)).toEqual(["contato@atlas.com"]);
  });

  it("yields no recipient when both are empty", async () => {
    h.client.findUnique.mockResolvedValue({
      name: "Atlas",
      contactEmail: null,
      billingEmails: [],
    });
    const resolved = await resolveRecipients(clientContactRule, {
      clientId: "cli-1",
    });
    expect(resolved).toEqual([]);
  });

  it("resolves the client via projectId when no clientId is given", async () => {
    h.project.findUnique.mockResolvedValue({ clientId: "cli-1" });
    h.client.findUnique.mockImplementation(async ({ where }: { where: Where }) =>
      where.id === "cli-1"
        ? {
            name: "Atlas",
            contactEmail: null,
            billingEmails: ["cobranca@atlas.com"],
          }
        : null,
    );
    const resolved = await resolveRecipients(clientContactRule, {
      projectId: "prj-1",
    });
    expect(resolved.map((r) => r.address)).toEqual(["cobranca@atlas.com"]);
  });
});
