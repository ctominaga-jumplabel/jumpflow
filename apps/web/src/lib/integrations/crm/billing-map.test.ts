import { afterEach, describe, expect, it, vi } from "vitest";

import {
  WARNING_BILLING_MODEL_UNMAPPED,
  WARNING_BILLING_TYPE_NOT_FOUND,
  resolveBillingTypeId,
} from "./billing-map";

/**
 * CRM -> JumpFlow billing de/para (D10). The Prisma client is INJECTED, so we
 * pass a minimal fake with `billingType.findUnique`; no module mock needed.
 */
const findUnique = vi.fn();

function fakePrisma() {
  return { billingType: { findUnique } } as unknown as Parameters<
    typeof resolveBillingTypeId
  >[0];
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("resolveBillingTypeId", () => {
  it.each([
    ["FIXED", "Preço por projeto"],
    ["RECURRING", "Mensalidade fixa"],
    ["VARIABLE", "Hora trabalhada"],
    ["HYBRID", "Hora + Fixo"],
  ])("maps %s to the BillingType name %s", async (model, expectedName) => {
    findUnique.mockResolvedValue({ id: "bt-1" });

    const result = await resolveBillingTypeId(fakePrisma(), model);

    expect(findUnique).toHaveBeenCalledWith({
      where: { name: expectedName },
      select: { id: true },
    });
    expect(result).toEqual({ billingTypeId: "bt-1", warning: null });
  });

  it("is case-insensitive and trims the incoming model", async () => {
    findUnique.mockResolvedValue({ id: "bt-9" });

    const result = await resolveBillingTypeId(fakePrisma(), "  fixed  ");

    expect(findUnique).toHaveBeenCalledWith({
      where: { name: "Preço por projeto" },
      select: { id: true },
    });
    expect(result.billingTypeId).toBe("bt-9");
    expect(result.warning).toBeNull();
  });

  it("returns null + BILLING_MODEL_UNMAPPED for OTHER / unknown / empty", async () => {
    for (const value of ["OTHER", "SOMETHING_ELSE", "", null, undefined]) {
      findUnique.mockClear();
      const result = await resolveBillingTypeId(fakePrisma(), value);
      expect(result.billingTypeId).toBeNull();
      expect(result.warning).toBe(
        `${WARNING_BILLING_MODEL_UNMAPPED}:${value ?? ""}`,
      );
      // No catalog lookup happens for an unmapped model.
      expect(findUnique).not.toHaveBeenCalled();
    }
  });

  it("returns null + BILLING_TYPE_NOT_FOUND when the mapped name is absent from the catalog", async () => {
    findUnique.mockResolvedValue(null);

    const result = await resolveBillingTypeId(fakePrisma(), "FIXED");

    expect(result.billingTypeId).toBeNull();
    expect(result.warning).toBe(
      `${WARNING_BILLING_TYPE_NOT_FOUND}:Preço por projeto`,
    );
  });
});
