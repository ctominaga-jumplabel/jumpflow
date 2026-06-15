import { describe, expect, it } from "vitest";
import {
  allocationInputSchema,
  projectUpdateSchema,
  saleRateUpdateSchema,
} from "./schemas";

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
