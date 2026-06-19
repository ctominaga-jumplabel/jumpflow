import { describe, expect, it } from "vitest";
import { relationshipsForType, responseCountForType } from "./responses";

describe("relationshipsForType (US16.02)", () => {
  it("SELF_90 gera só SELF", () => {
    expect(relationshipsForType("SELF_90")).toEqual(["SELF"]);
    expect(responseCountForType("SELF_90")).toBe(1);
  });

  it("MANAGER_180 gera SELF + MANAGER", () => {
    expect(relationshipsForType("MANAGER_180")).toEqual(["SELF", "MANAGER"]);
    expect(responseCountForType("MANAGER_180")).toBe(2);
  });

  it("FULL_360 gera SELF + MANAGER + PEER + CLIENT", () => {
    expect(relationshipsForType("FULL_360")).toEqual([
      "SELF",
      "MANAGER",
      "PEER",
      "CLIENT",
    ]);
    expect(responseCountForType("FULL_360")).toBe(4);
  });

  it("todos os tipos sempre incluem SELF (autoavaliação)", () => {
    for (const type of ["SELF_90", "MANAGER_180", "FULL_360"] as const) {
      expect(relationshipsForType(type)).toContain("SELF");
    }
  });

  it("SUBORDINATE não é gerado automaticamente no MVP", () => {
    for (const type of ["SELF_90", "MANAGER_180", "FULL_360"] as const) {
      expect(relationshipsForType(type)).not.toContain("SUBORDINATE");
    }
  });
});
