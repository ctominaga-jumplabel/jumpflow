import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutoApprovalCollection } from "@/lib/automation/auto-approval";

/**
 * Tests for the read-only overview. Prisma is mocked in-memory and the engine
 * context builder (collectAutoApprovalDecisions) is mocked so we can assert how
 * the overview maps exceptions, recent automatic approvals and pending entries
 * (with their estimated reasons) — without touching real rules.
 */

const NOW = new Date("2026-06-10T12:00:00Z");

const h = vi.hoisted(() => {
  const store = {
    projectRuleCount: 0,
    consultantRuleCount: 0,
    approvals: [] as {
      entityId: string;
      ruleKey: string | null;
      createdAt: Date;
    }[],
    timeEntries: [] as {
      id: string;
      consultant: { name: string };
      project: { name: string };
    }[],
    collection: {
      skipped: false,
      evaluations: [],
    } as AutoApprovalCollection,
  };

  const prismaMock = {
    projectAutoApprovalRule: {
      count: async () => store.projectRuleCount,
    },
    consultantAutoApprovalRule: {
      count: async () => store.consultantRuleCount,
    },
    approval: {
      findMany: async () => store.approvals.map((a) => ({ ...a })),
    },
    timeEntry: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        store.timeEntries
          .filter((e) => where.id.in.includes(e.id))
          .map((e) => ({ ...e })),
    },
  };

  return { store, prismaMock };
});

vi.mock("@jumpflow/database", () => ({ prisma: h.prismaMock }));

vi.mock("@/lib/automation/config", () => ({
  loadAutomationConfig: vi.fn(async () => ({
    autoApprovalEnabled: true,
    settings: {
      approvalDelayMinutes: 5,
      requiredDailyMinutes: 480,
      maxEntryHours: 24,
    },
    reportRecipients: [],
  })),
}));

vi.mock("@/lib/automation/auto-approval", () => ({
  collectAutoApprovalDecisions: vi.fn(async () => h.store.collection),
}));

import { getAutoApprovalOverview } from "@/lib/db/automation";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.projectRuleCount = 0;
  h.store.consultantRuleCount = 0;
  h.store.approvals = [];
  h.store.timeEntries = [];
  h.store.collection = { skipped: false, evaluations: [] };
});

afterEach(() => vi.unstubAllEnvs());

describe("getAutoApprovalOverview", () => {
  it("maps config from the loaded automation settings", async () => {
    const overview = await getAutoApprovalOverview(NOW);
    expect(overview.config).toEqual({
      autoApprovalEnabled: true,
      requiredDailyMinutes: 480,
      approvalDelayMinutes: 5,
    });
  });

  it("reports the project and consultant rule counts", async () => {
    h.store.projectRuleCount = 3;
    h.store.consultantRuleCount = 5;
    const overview = await getAutoApprovalOverview(NOW);
    expect(overview.projectRuleCount).toBe(3);
    expect(overview.consultantRuleCount).toBe(5);
  });

  it("joins recent automatic approvals back to consultant/project", async () => {
    h.store.approvals = [
      { entityId: "e1", ruleKey: "DEFAULT", createdAt: NOW },
      { entityId: "missing", ruleKey: "EXCEPTION_ANY_HOURS", createdAt: NOW },
    ];
    h.store.timeEntries = [
      { id: "e1", consultant: { name: "Ana" }, project: { name: "Apollo" } },
    ];
    const overview = await getAutoApprovalOverview(NOW);
    expect(overview.recentAutoApprovals).toEqual([
      {
        entityId: "e1",
        ruleKey: "DEFAULT",
        createdAt: NOW,
        consultantName: "Ana",
        projectName: "Apollo",
      },
      {
        entityId: "missing",
        ruleKey: "EXCEPTION_ANY_HOURS",
        createdAt: NOW,
        consultantName: null,
        projectName: null,
      },
    ]);
  });

  it("lists only PENDING evaluations with pt-BR reason labels and entry meta", async () => {
    h.store.collection = {
      skipped: false,
      evaluations: [
        {
          id: "approved",
          consultantId: "c1",
          projectId: "p1",
          date: NOW,
          hours: 8,
          activityType: "WORKDAY",
          decision: {
            outcome: "APPROVE",
            reasons: [],
            appliedRules: ["DEFAULT"],
            ruleKey: "DEFAULT",
          },
        },
        {
          id: "pending",
          consultantId: "c2",
          projectId: "p2",
          date: NOW,
          hours: 6,
          activityType: "WORKDAY",
          decision: {
            outcome: "PENDING",
            reasons: ["DELAY_NOT_ELAPSED", "DAILY_TOTAL_MISMATCH"],
            appliedRules: ["DEFAULT"],
            ruleKey: "DEFAULT",
          },
        },
      ],
    };
    h.store.timeEntries = [
      { id: "pending", consultant: { name: "Bia" }, project: { name: "Beta" } },
    ];

    const overview = await getAutoApprovalOverview(NOW);
    expect(overview.pending).toHaveLength(1);
    expect(overview.pending[0]).toMatchObject({
      entryId: "pending",
      consultantName: "Bia",
      projectName: "Beta",
      hours: 6,
      activity: "Dia Útil",
    });
    expect(overview.pending[0].reasons).toEqual([
      "Aguardando intervalo mínimo após o envio",
      "Total diário diferente do esperado",
    ]);
  });

  it("has no pending entries when the engine is disabled (skipped collection)", async () => {
    h.store.collection = {
      skipped: true,
      reason: "disabled",
      evaluations: [],
    };
    const overview = await getAutoApprovalOverview(NOW);
    expect(overview.pending).toEqual([]);
  });
});
