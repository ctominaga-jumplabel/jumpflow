import { describe, expect, it } from "vitest";
import {
  allocationInputSchema,
  allocationSkillInputSchema,
  allocationSkillRemoveSchema,
  consultantAutoApprovalRuleSchema,
  linkAutoApprovalConsultantsSchema,
  projectAutoApprovalRuleSchema,
  projectUpdateSchema,
  saleRateUpdateSchema,
} from "./schemas";

describe("auto-approval rule schemas", () => {
  const base = {
    projectId: "seed-project-portal",
    weekendEnabled: true,
    hoursRangeEnabled: true,
    minMinutes: 1,
    maxMinutes: 1439,
  };

  it("accepts the default 00:01–23:59 range", () => {
    expect(projectAutoApprovalRuleSchema.safeParse(base).success).toBe(true);
  });

  it("rejects 00:00 (minute 0) on either bound", () => {
    expect(
      projectAutoApprovalRuleSchema.safeParse({ ...base, minMinutes: 0 }).success,
    ).toBe(false);
    expect(
      projectAutoApprovalRuleSchema.safeParse({ ...base, maxMinutes: 0 }).success,
    ).toBe(false);
  });

  it("rejects max < min and allows max == min (exact match)", () => {
    expect(
      projectAutoApprovalRuleSchema.safeParse({
        ...base,
        minMinutes: 540,
        maxMinutes: 480,
      }).success,
    ).toBe(false);
    expect(
      projectAutoApprovalRuleSchema.safeParse({
        ...base,
        minMinutes: 480,
        maxMinutes: 480,
      }).success,
    ).toBe(true);
  });

  it("rejects minutes above 23:59 (1439)", () => {
    expect(
      projectAutoApprovalRuleSchema.safeParse({ ...base, maxMinutes: 1440 })
        .success,
    ).toBe(false);
  });

  it("consultant rule requires consultantId", () => {
    expect(
      consultantAutoApprovalRuleSchema.safeParse({
        ...base,
        consultantId: "seed-consultant-1",
      }).success,
    ).toBe(true);
    expect(consultantAutoApprovalRuleSchema.safeParse(base).success).toBe(false);
  });

  it("link schema requires at least one consultant", () => {
    expect(
      linkAutoApprovalConsultantsSchema.safeParse({
        projectId: "seed-project-portal",
        consultantIds: [],
      }).success,
    ).toBe(false);
    expect(
      linkAutoApprovalConsultantsSchema.safeParse({
        projectId: "seed-project-portal",
        consultantIds: ["seed-consultant-1"],
      }).success,
    ).toBe(true);
  });
});

// Regression: seeded/imported rows use readable ids (e.g. "seed-project-portal")
// rather than cuids. The schema used to reject them via `.cuid()`, so every
// update silently failed with INVALID_INPUT before reaching the database
// (e.g. changing a project manager never persisted).
describe("projects schemas accept non-cuid entity ids", () => {
  it("accepts seed-style ids when updating a project (e.g. changing the manager)", () => {
    const result = projectUpdateSchema.safeParse({
      id: "seed-project-portal",
      clientId: "seed-client-acme",
      name: "Portal do Cliente (Demo)",
      status: "ACTIVE",
      startDate: "2026-06-01",
      managerUserId: "cmqa30syl0007sp7gs466vs3j",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.managerUserId).toBe("cmqa30syl0007sp7gs466vs3j");
    }
  });

  it("still accepts cuid ids", () => {
    const result = projectUpdateSchema.safeParse({
      id: "cmq75q87n0007spago99riggo",
      clientId: "cmq75q87n0001spago00abcde",
      name: "Projeto Real",
      status: "ACTIVE",
      startDate: "2026-06-01",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty and malformed ids", () => {
    expect(
      projectUpdateSchema.safeParse({
        id: "",
        clientId: "seed-client-acme",
        name: "Projeto",
        status: "ACTIVE",
        startDate: "2026-06-01",
      }).success,
    ).toBe(false);
    expect(
      projectUpdateSchema.safeParse({
        id: "bad id with spaces",
        clientId: "seed-client-acme",
        name: "Projeto",
        status: "ACTIVE",
        startDate: "2026-06-01",
      }).success,
    ).toBe(false);
  });

  it("accepts seed-style ids for allocations and sale rates", () => {
    expect(
      allocationInputSchema.safeParse({
        projectId: "seed-project-portal",
        consultantId: "seed-consultant-ana",
        role: "Dev",
        allocationPercent: 100,
        startDate: "2026-06-01",
        status: "ACTIVE",
      }).success,
    ).toBe(true);
    expect(
      saleRateUpdateSchema.safeParse({
        id: "seed-rate-1",
        projectId: "seed-project-portal",
        startsAt: "2026-06-01",
        hourlyRate: 300,
        currency: "BRL",
      }).success,
    ).toBe(true);
  });
});

describe("allocation skill schemas", () => {
  it("requires allocationId and skillId, level/note optional", () => {
    const result = allocationSkillInputSchema.safeParse({
      allocationId: "alloc-1",
      skillId: "skill-react",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.level).toBeUndefined();
      expect(result.data.note).toBeUndefined();
    }
  });

  it("accepts an optional SkillLevel and note", () => {
    const result = allocationSkillInputSchema.safeParse({
      allocationId: "alloc-1",
      skillId: "skill-react",
      level: "ADVANCED",
      note: "Lider tecnico",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.level).toBe("ADVANCED");
      expect(result.data.note).toBe("Lider tecnico");
    }
  });

  it("treats empty level/note as undefined", () => {
    const result = allocationSkillInputSchema.safeParse({
      allocationId: "alloc-1",
      skillId: "skill-react",
      level: "",
      note: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.level).toBeUndefined();
      expect(result.data.note).toBeUndefined();
    }
  });

  it("rejects an invalid level and missing ids", () => {
    expect(
      allocationSkillInputSchema.safeParse({
        allocationId: "alloc-1",
        skillId: "skill-react",
        level: "GURU",
      }).success,
    ).toBe(false);
    expect(
      allocationSkillInputSchema.safeParse({ skillId: "skill-react" }).success,
    ).toBe(false);
    expect(allocationSkillRemoveSchema.safeParse({ id: "" }).success).toBe(false);
  });
});
