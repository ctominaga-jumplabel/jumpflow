import { describe, expect, it } from "vitest";
import { getBankProvider } from "./provider";

describe("bank provider", () => {
  it("fails honestly when no bank provider is configured", async () => {
    const result = await getBankProvider().sendPayment({
      paymentId: "pay-1",
      consultantId: "consultant-1",
      amount: 1000,
    });

    expect(result).toMatchObject({
      ok: false,
      error: "INVALID_INPUT",
    });
  });
});
