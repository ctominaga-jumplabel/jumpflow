import { describe, expect, it } from "vitest";
import {
  actionAllowedForContract,
  consultantPaymentTransitions,
} from "./state-machine";

describe("consultant payment state machine", () => {
  it("defines the PJ invoice-to-paid flow", () => {
    expect(consultantPaymentTransitions.REQUEST_INVOICE).toMatchObject({
      expected: "OPEN",
      next: "WAITING_FOR_INVOICE",
    });
    expect(consultantPaymentTransitions.MARK_INVOICE_RECEIVED).toMatchObject({
      expected: "WAITING_FOR_INVOICE",
      next: "INVOICE_RECEIVED",
    });
    expect(consultantPaymentTransitions.VALIDATE_INVOICE).toMatchObject({
      expected: "INVOICE_RECEIVED",
      next: "INVOICE_VALIDATED",
    });
    expect(consultantPaymentTransitions.MARK_PAID).toMatchObject({
      expected: "PROCESSED",
      next: "PAID",
    });
  });

  it("lets CLT skip invoice steps while PJ/CLT_FLEX require them", () => {
    expect(actionAllowedForContract("APPROVE_CLT_PAYMENT", "CLT")).toBe(true);
    expect(actionAllowedForContract("REQUEST_INVOICE", "CLT")).toBe(false);
    expect(actionAllowedForContract("APPROVE_CLT_PAYMENT", "PJ")).toBe(false);
    expect(actionAllowedForContract("REQUEST_INVOICE", "CLT_FLEX")).toBe(true);
  });
});
