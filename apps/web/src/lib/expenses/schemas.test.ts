import { describe, expect, it } from "vitest";
import {
  COMMENT_REQUIRED_MESSAGE,
  REASON_REQUIRED_MESSAGE,
  decideExpenseSchema,
  expenseInputSchema,
  setPaymentSchema,
  updateExpenseInputSchema,
} from "./schemas";

const validInput = {
  projectId: "seed-project-portal",
  date: "2026-06-10",
  amount: 184.9,
  description: "Estacionamento em visita ao cliente",
};

describe("expenseInputSchema", () => {
  it("accepts a minimal valid input", () => {
    expect(expenseInputSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects amount zero, negative and more than 2 decimals", () => {
    expect(expenseInputSchema.safeParse({ ...validInput, amount: 0 }).success).toBe(
      false,
    );
    expect(
      expenseInputSchema.safeParse({ ...validInput, amount: -10 }).success,
    ).toBe(false);
    expect(
      expenseInputSchema.safeParse({ ...validInput, amount: 10.123 }).success,
    ).toBe(false);
  });

  it("rejects amount above the 999999.99 ceiling", () => {
    expect(
      expenseInputSchema.safeParse({ ...validInput, amount: 1_000_000 }).success,
    ).toBe(false);
    expect(
      expenseInputSchema.safeParse({ ...validInput, amount: 999999.99 }).success,
    ).toBe(true);
  });

  it("rejects an empty or whitespace-only description", () => {
    expect(
      expenseInputSchema.safeParse({ ...validInput, description: "" }).success,
    ).toBe(false);
    expect(
      expenseInputSchema.safeParse({ ...validInput, description: "   " }).success,
    ).toBe(false);
  });

  it("rejects an invalid or impossible date", () => {
    expect(
      expenseInputSchema.safeParse({ ...validInput, date: "10/06/2026" }).success,
    ).toBe(false);
    expect(
      expenseInputSchema.safeParse({ ...validInput, date: "2026-02-30" }).success,
    ).toBe(false);
  });

  it("limits invoiceNumber to 60 chars (optional otherwise)", () => {
    expect(
      expenseInputSchema.safeParse({
        ...validInput,
        invoiceNumber: "x".repeat(61),
      }).success,
    ).toBe(false);
    expect(
      expenseInputSchema.safeParse({ ...validInput, invoiceNumber: undefined })
        .success,
    ).toBe(true);
  });
});

describe("updateExpenseInputSchema", () => {
  it("requires id but keeps projectId/date optional", () => {
    expect(
      updateExpenseInputSchema.safeParse({
        id: "exp-1",
        amount: 10,
        description: "Ajuste",
      }).success,
    ).toBe(true);
    expect(
      updateExpenseInputSchema.safeParse({
        amount: 10,
        description: "Ajuste",
      }).success,
    ).toBe(false);
  });
});

describe("decideExpenseSchema", () => {
  it("requires a non-empty comment on REJECTED", () => {
    const result = decideExpenseSchema.safeParse({
      expenseId: "exp-1",
      decision: "REJECTED",
      comment: "   ",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(COMMENT_REQUIRED_MESSAGE);
  });

  it("allows an empty comment on APPROVED", () => {
    expect(
      decideExpenseSchema.safeParse({
        expenseId: "exp-1",
        decision: "APPROVED",
        comment: "",
      }).success,
    ).toBe(true);
  });
});

describe("setPaymentSchema", () => {
  it("requires a reason on CANCEL_SCHEDULE", () => {
    const result = setPaymentSchema.safeParse({
      expenseId: "exp-1",
      action: "CANCEL_SCHEDULE",
      reason: "",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(REASON_REQUIRED_MESSAGE);
  });

  it("does not require a reason on SCHEDULE/MARK_PAID", () => {
    expect(
      setPaymentSchema.safeParse({ expenseId: "exp-1", action: "SCHEDULE" })
        .success,
    ).toBe(true);
    expect(
      setPaymentSchema.safeParse({ expenseId: "exp-1", action: "MARK_PAID" })
        .success,
    ).toBe(true);
  });
});
