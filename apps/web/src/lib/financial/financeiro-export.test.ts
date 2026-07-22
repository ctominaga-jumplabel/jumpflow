import { describe, expect, it } from "vitest";
import {
  filterRevenueRows,
  revenueXlsxColumns,
  financeExpensesXlsxColumns,
} from "./financeiro-export";
import type { RevenueClosingRow } from "./types";
import type { Expense } from "@/lib/expenses/types";

function row(overrides: Partial<RevenueClosingRow>): RevenueClosingRow {
  return {
    id: "r1",
    projectId: "p1",
    clientName: "Vix",
    projectName: "Atlas",
    opportunityType: "ALLOCATION",
    approvedHours: 10,
    billingHourlyRate: 200,
    amount: 2000,
    status: "OPEN",
    fiscalDocument: null,
    ...overrides,
  };
}

describe("filterRevenueRows", () => {
  const rows = [
    row({ id: "a", clientName: "Vix", projectName: "Atlas", status: "OPEN" }),
    row({ id: "b", clientName: "Banco Sul", projectName: "Orion", status: "CLOSED" }),
    row({ id: "c", clientName: "Vix", projectName: "Helios", status: "CLOSED" }),
  ];

  it("returns all rows with an empty filter", () => {
    expect(filterRevenueRows(rows, {}).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("filters by client, project and status like the screen", () => {
    expect(
      filterRevenueRows(rows, { clientName: "Vix" }).map((r) => r.id),
    ).toEqual(["a", "c"]);
    expect(
      filterRevenueRows(rows, { status: "CLOSED" }).map((r) => r.id),
    ).toEqual(["b", "c"]);
    expect(
      filterRevenueRows(rows, { clientName: "Vix", status: "CLOSED" }).map(
        (r) => r.id,
      ),
    ).toEqual(["c"]);
    expect(
      filterRevenueRows(rows, { projectName: "Orion" }).map((r) => r.id),
    ).toEqual(["b"]);
  });
});

describe("revenueXlsxColumns", () => {
  it("exposes the opportunity type label and fiscal fields", () => {
    const columns = revenueXlsxColumns();
    const byHeader = Object.fromEntries(columns.map((c) => [c.header, c]));
    const r = row({
      opportunityType: "SQUAD",
      status: "INVOICED",
      fiscalDocument: {
        id: "f1",
        status: "ISSUED",
        invoiceNumber: "123",
        protocol: null,
        issuedAt: null,
      },
    });
    expect(byHeader["Tipo"].value(r)).toBe("Squad");
    expect(byHeader["Status"].value(r)).toBe("Faturado");
    expect(byHeader["NF status"].value(r)).toBe("Emitida");
    expect(byHeader["NF número"].value(r)).toBe("123");
    expect(byHeader["Valor"].value(r)).toBe(2000);
  });

  it("labels an unclassified type and empty fiscal document", () => {
    const columns = revenueXlsxColumns();
    const byHeader = Object.fromEntries(columns.map((c) => [c.header, c]));
    const r = row({ opportunityType: null, fiscalDocument: null });
    expect(byHeader["Tipo"].value(r)).toBe("Não classificado");
    expect(byHeader["NF status"].value(r)).toBe("");
    expect(byHeader["NF número"].value(r)).toBe("");
  });
});

describe("financeExpensesXlsxColumns", () => {
  it("shapes finance-approved expense rows with a pt-BR status label", () => {
    const columns = financeExpensesXlsxColumns();
    const byHeader = Object.fromEntries(columns.map((c) => [c.header, c]));
    const expense: Expense = {
      id: "e1",
      projectId: "p1",
      projectName: "Atlas",
      clientName: "Vix",
      consultantName: "Ana",
      date: "2026-06-03",
      amount: 500,
      description: "Hospedagem",
      invoiceNumber: "NF-9",
      status: "PAYMENT_SCHEDULED",
      source: "db",
    };
    expect(byHeader["Valor"].value(expense)).toBe(500);
    expect(byHeader["Status"].value(expense)).toBe("Pagamento agendado");
    expect(byHeader["Nota fiscal"].value({ ...expense, invoiceNumber: undefined })).toBe("");
  });
});
