import { describe, expect, it } from "vitest";
import {
  actionAllowedForContract,
  canReopenPeopleRelease,
  consultantPaymentTransitions,
  DEDICATED_PAYMENT_ACTIONS,
  PEOPLE_RELEASED_OR_BEYOND,
  transitionAllowedFrom,
} from "./state-machine";

describe("consultant payment state machine", () => {
  it("defines the PJ invoice-to-paid flow behind the DP release", () => {
    expect(consultantPaymentTransitions.RELEASE_BY_PEOPLE).toMatchObject({
      expected: ["OPEN"],
      next: "PEOPLE_RELEASED",
    });
    expect(consultantPaymentTransitions.REQUEST_INVOICE).toMatchObject({
      expected: ["PEOPLE_RELEASED"],
      next: "WAITING_FOR_INVOICE",
    });
    expect(consultantPaymentTransitions.MARK_INVOICE_RECEIVED).toMatchObject({
      next: "INVOICE_RECEIVED",
    });
    expect(consultantPaymentTransitions.VALIDATE_INVOICE).toMatchObject({
      expected: ["INVOICE_RECEIVED"],
      next: "INVOICE_VALIDATED",
    });
    expect(consultantPaymentTransitions.MARK_PAID).toMatchObject({
      expected: ["PROCESSED"],
      next: "PAID",
    });
  });

  it("never lets OPEN skip the DP release (NF request, CLT approval, NF received)", () => {
    expect(transitionAllowedFrom("REQUEST_INVOICE", "OPEN")).toBe(false);
    expect(transitionAllowedFrom("APPROVE_CLT_PAYMENT", "OPEN")).toBe(false);
    expect(transitionAllowedFrom("MARK_INVOICE_RECEIVED", "OPEN")).toBe(false);
    // Manual "NF recebida" não pula o pedido de NF.
    expect(
      transitionAllowedFrom("MARK_INVOICE_RECEIVED", "PEOPLE_RELEASED"),
    ).toBe(false);
    expect(
      transitionAllowedFrom("MARK_INVOICE_RECEIVED", "WAITING_FOR_INVOICE"),
    ).toBe(true);
    expect(transitionAllowedFrom("APPROVE_CLT_PAYMENT", "PEOPLE_RELEASED")).toBe(
      true,
    );
    expect(transitionAllowedFrom("REQUEST_INVOICE", "PEOPLE_RELEASED")).toBe(
      true,
    );
  });

  it("only OPEN can be released by People", () => {
    expect(transitionAllowedFrom("RELEASE_BY_PEOPLE", "OPEN")).toBe(true);
    for (const status of PEOPLE_RELEASED_OR_BEYOND) {
      expect(transitionAllowedFrom("RELEASE_BY_PEOPLE", status)).toBe(false);
    }
    expect(transitionAllowedFrom("RELEASE_BY_PEOPLE", "CANCELLED")).toBe(false);
  });

  it("REOPEN_RELEASE returns PEOPLE_RELEASED / WAITING_FOR_INVOICE to OPEN", () => {
    expect(consultantPaymentTransitions.REOPEN_RELEASE.next).toBe("OPEN");
    expect(transitionAllowedFrom("REOPEN_RELEASE", "PEOPLE_RELEASED")).toBe(true);
    expect(transitionAllowedFrom("REOPEN_RELEASE", "WAITING_FOR_INVOICE")).toBe(
      true,
    );
    expect(transitionAllowedFrom("REOPEN_RELEASE", "INVOICE_RECEIVED")).toBe(
      false,
    );
    expect(transitionAllowedFrom("REOPEN_RELEASE", "OPEN")).toBe(false);
  });

  it("blocks reopening the release once an NF was received", () => {
    expect(
      canReopenPeopleRelease({ status: "PEOPLE_RELEASED", invoiceReceivedAt: null }),
    ).toBe(true);
    expect(
      canReopenPeopleRelease({
        status: "WAITING_FOR_INVOICE",
        invoiceReceivedAt: null,
      }),
    ).toBe(true);
    expect(
      canReopenPeopleRelease({
        status: "WAITING_FOR_INVOICE",
        invoiceReceivedAt: "2026-10-01",
      }),
    ).toBe(false);
    expect(
      canReopenPeopleRelease({ status: "INVOICE_RECEIVED", invoiceReceivedAt: null }),
    ).toBe(false);
    expect(canReopenPeopleRelease({ status: "PAID", invoiceReceivedAt: null })).toBe(
      false,
    );
  });

  it("keeps the matrix-gated steps out of the generic advance", () => {
    expect([...DEDICATED_PAYMENT_ACTIONS].sort()).toEqual([
      "RELEASE_BY_PEOPLE",
      "REOPEN_RELEASE",
      "REQUEST_INVOICE",
    ]);
  });

  it("lets CLT skip invoice steps while PJ/CLT_FLEX require them", () => {
    expect(actionAllowedForContract("APPROVE_CLT_PAYMENT", "CLT")).toBe(true);
    expect(actionAllowedForContract("REQUEST_INVOICE", "CLT")).toBe(false);
    expect(actionAllowedForContract("RELEASE_BY_PEOPLE", "CLT")).toBe(true);
    expect(actionAllowedForContract("APPROVE_CLT_PAYMENT", "PJ")).toBe(false);
    expect(actionAllowedForContract("REQUEST_INVOICE", "CLT_FLEX")).toBe(true);
  });
});
