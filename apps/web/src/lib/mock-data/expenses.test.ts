import { describe, expect, it } from "vitest";
import {
  createExpense,
  expenses,
  filterExpenses,
  summarizeExpenses,
} from "./expenses";

describe("expenses mock helpers", () => {
  it("filters by status", () => {
    const approved = filterExpenses(expenses, { status: "APPROVED" });
    expect(approved.length).toBeGreaterThan(0);
    expect(approved.every((e) => e.status === "APPROVED")).toBe(true);
  });

  it("filters by project and date range", () => {
    const result = filterExpenses(expenses, {
      projectId: "prj-atlas",
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(result.every((e) => e.projectId === "prj-atlas")).toBe(true);
    expect(result.every((e) => e.date >= "2026-06-01" && e.date <= "2026-06-30")).toBe(
      true,
    );
  });

  it("summarizes amounts by status", () => {
    const totals = summarizeExpenses(expenses);
    expect(totals.totalAmount).toBeCloseTo(
      expenses.reduce((s, e) => s + e.amount, 0),
      2,
    );
    expect(totals.approvedAmount).toBeGreaterThan(0);
    expect(totals.submitted).toBeGreaterThanOrEqual(1);
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
    expect(expense.paymentStatus).toBe("NOT_SCHEDULED");
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
