import { describe, expect, it } from "vitest";
import { hoursXlsxColumns, expensesXlsxColumns } from "./xlsx-columns";
import type { HoursReportRow, ExpensesReportRow } from "./types";

const hourRow: HoursReportRow = {
  id: "h1",
  date: "2026-06-10",
  weekLabel: "Semana 24",
  consultantName: "Ana",
  clientName: "Vix",
  projectName: "Atlas",
  activity: "Desenvolvimento",
  hours: 8,
  billable: true,
  status: "APPROVED",
  submittedAt: "2026-06-11T10:00:00.000Z",
  decidedAt: "2026-06-12T09:00:00.000Z",
  billingRate: 200,
  billedAmount: 1600,
};

const statusLabel = (s: string) => (s === "APPROVED" ? "Aprovado" : s);

describe("hoursXlsxColumns", () => {
  it("omits monetary columns when financials are not allowed (mask)", () => {
    const columns = hoursXlsxColumns({ includeFinancials: false, statusLabel });
    const headers = columns.map((c) => c.header);
    expect(headers).not.toContain("Valor hora");
    expect(headers).not.toContain("Valor faturado");
    expect(headers).toEqual([
      "Data",
      "Semana",
      "Consultor",
      "Cliente",
      "Projeto",
      "Atividade",
      "Horas",
      "Faturável",
      "Status",
      "Enviado em",
      "Decidido em",
    ]);
  });

  it("appends monetary columns when financials are allowed", () => {
    const columns = hoursXlsxColumns({ includeFinancials: true, statusLabel });
    const headers = columns.map((c) => c.header);
    expect(headers).toContain("Valor hora");
    expect(headers).toContain("Valor faturado");
    const byHeader = Object.fromEntries(columns.map((c) => [c.header, c]));
    expect(byHeader["Valor hora"].value(hourRow)).toBe(200);
    expect(byHeader["Valor faturado"].value(hourRow)).toBe(1600);
    expect(byHeader["Horas"].value(hourRow)).toBe(8);
    expect(byHeader["Faturável"].value(hourRow)).toBe("Sim");
    expect(byHeader["Status"].value(hourRow)).toBe("Aprovado");
    expect(byHeader["Data"].value(hourRow)).toBe("2026-06-10");
  });

  it("tolerates missing optional financial values (null cells)", () => {
    const columns = hoursXlsxColumns({ includeFinancials: true, statusLabel });
    const byHeader = Object.fromEntries(columns.map((c) => [c.header, c]));
    const row = { ...hourRow, billingRate: null, billedAmount: null };
    expect(byHeader["Valor hora"].value(row)).toBeNull();
    expect(byHeader["Valor faturado"].value(row)).toBeNull();
  });
});

const expenseRow: ExpensesReportRow = {
  id: "e1",
  date: "2026-06-03",
  consultantName: "Carlos",
  clientName: "Vix",
  projectName: "Atlas",
  description: "Deslocamento",
  invoiceNumber: "NF-1",
  amount: 184.9,
  status: "FINANCE_APPROVED",
  stage: "Financeiro",
  hasReceipt: true,
  lastDecision: "OK",
  submittedAt: "2026-06-04T13:00:00.000Z",
};

describe("expensesXlsxColumns", () => {
  it("shapes the expected columns without receipt storage fields", () => {
    const columns = expensesXlsxColumns({ statusLabel: (s) => s });
    const byHeader = Object.fromEntries(columns.map((c) => [c.header, c]));
    expect(columns.map((c) => c.header)).toEqual([
      "Data",
      "Consultor",
      "Cliente",
      "Projeto",
      "Descrição",
      "Nota fiscal",
      "Valor",
      "Status",
      "Etapa",
      "Comprovante",
      "Última decisão",
      "Enviado em",
    ]);
    expect(byHeader["Valor"].value(expenseRow)).toBe(184.9);
    expect(byHeader["Comprovante"].value(expenseRow)).toBe("Sim");
    expect(byHeader["Nota fiscal"].value({ ...expenseRow, invoiceNumber: undefined })).toBe("");
  });
});
