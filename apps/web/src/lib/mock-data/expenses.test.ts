import { describe, expect, it } from "vitest";
import {
  createExpense,
  expenses,
  filterExpenses,
  summarizeExpenses,
} from "./expenses";

describe("expenses mock helpers (single status chain)", () => {
  it("filters by status", () => {
    const submitted = filterExpenses(expenses, { status: "SUBMITTED" });
    expect(submitted.length).toBeGreaterThan(0);
    expect(submitted.every((e) => e.status === "SUBMITTED")).toBe(true);
  });

  it("filters by project and date range", () => {
    const result = filterExpenses(expenses, {
      projectId: "prj-atlas",
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(result.every((e) => e.projectId === "prj-atlas")).toBe(true);
    expect(
      result.every((e) => e.date >= "2026-06-01" && e.date <= "2026-06-30"),
    ).toBe(true);
  });

  it("summarizes amounts along the chain", () => {
    const totals = summarizeExpenses(expenses);
    expect(totals.totalAmount).toBeCloseTo(
      expenses.reduce((s, e) => s + e.amount, 0),
      2,
    );
    // aPagar = FINANCE_APPROVED, agendada = PAYMENT_SCHEDULED, paga = PAID.
    expect(totals.toPayAmount).toBeCloseTo(
      expenses
        .filter((e) => e.status === "FINANCE_APPROVED")
        .reduce((s, e) => s + e.amount, 0),
      2,
    );
    expect(totals.scheduledAmount).toBeCloseTo(
      expenses
        .filter((e) => e.status === "PAYMENT_SCHEDULED")
        .reduce((s, e) => s + e.amount, 0),
      2,
    );
    expect(totals.paidAmount).toBeCloseTo(
      expenses
        .filter((e) => e.status === "PAID")
        .reduce((s, e) => s + e.amount, 0),
      2,
    );
    expect(totals.awaiting).toBeGreaterThanOrEqual(1);
    expect(totals.rejected).toBeGreaterThanOrEqual(1);
  });

  it("every demo item is flagged as mock source", () => {
    expect(expenses.every((e) => e.source === "mock")).toBe(true);
  });

  it("creates a submitted expense with a submittedAt stamp", () => {
    const expense = createExpense(
      {
        projectId: "prj-atlas",
        date: "2026-06-10",
        amount: 99.9,
        description: "Teste",
      },
      {
        id: "exp-test",
        projectName: "Atlas",
        clientName: "Vix Energia",
        consultantName: "Tester",
        status: "SUBMITTED",
        submittedAt: "2026-06-10T12:00:00Z",
      },
    );
    expect(expense.status).toBe("SUBMITTED");
    expect(expense.submittedAt).toBe("2026-06-10T12:00:00Z");
    expect(expense.source).toBe("mock");
  });

  it("creates a draft without a submittedAt stamp", () => {
    const expense = createExpense(
      {
        projectId: "prj-atlas",
        date: "2026-06-10",
        amount: 10,
        description: "Rascunho",
      },
      {
        id: "exp-draft",
        projectName: "Atlas",
        clientName: "Vix Energia",
        consultantName: "Tester",
        status: "DRAFT",
      },
    );
    expect(expense.status).toBe("DRAFT");
    expect(expense.submittedAt).toBeUndefined();
  });
});
