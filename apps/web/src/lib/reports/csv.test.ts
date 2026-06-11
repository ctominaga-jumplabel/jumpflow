import { describe, expect, it } from "vitest";
import {
  buildConsolidatedCsv,
  buildExpensesCsv,
  buildHoursCsv,
  csvField,
  sanitizeText,
} from "./csv";
import type {
  ConsolidatedClient,
  ExpensesReportRow,
  HoursReportRow,
} from "@/lib/reports/types";

const BOM = "﻿";

function lines(csv: string): string[] {
  expect(csv.startsWith(BOM)).toBe(true);
  expect(csv.endsWith("\r\n")).toBe(true);
  return csv.slice(BOM.length).split("\r\n").filter((l) => l.length > 0);
}

const identityLabel = (s: string) => s;

const hoursRow = (over: Partial<HoursReportRow> = {}): HoursReportRow => ({
  id: "e1",
  date: "2026-06-10",
  weekLabel: "Semana 24 · 08–14 jun 2026",
  consultantName: "Ana",
  clientName: "Vix",
  projectName: "Atlas",
  activity: "Desenvolvimento",
  hours: 8,
  billable: true,
  status: "APPROVED",
  submittedAt: "2026-06-09T10:00:00.000Z",
  decidedAt: "2026-06-11T12:00:00.000Z",
  ...over,
});

describe("csvField", () => {
  it("quotes and doubles inner quotes (RFC 4180)", () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("sanitizeText (anti CSV injection)", () => {
  it("prefixes apostrophe for formula-leading characters", () => {
    expect(sanitizeText("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(sanitizeText("+1")).toBe("'+1");
    expect(sanitizeText("-1")).toBe("'-1");
    expect(sanitizeText("@cmd")).toBe("'@cmd");
    expect(sanitizeText("\tTAB")).toBe("'\tTAB");
    expect(sanitizeText("\rCR")).toBe("'\rCR");
  });

  it("leaves safe text untouched", () => {
    expect(sanitizeText("Desenvolvimento")).toBe("Desenvolvimento");
    expect(sanitizeText("")).toBe("");
  });
});

describe("buildHoursCsv", () => {
  it("always emits a header even with zero rows", () => {
    const csv = buildHoursCsv([], {
      includeFinancials: false,
      statusLabel: identityLabel,
    });
    const rows = lines(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("date");
    expect(rows[0]).not.toContain("billingRate");
  });

  it("omits monetary columns when includeFinancials is false", () => {
    const csv = buildHoursCsv([hoursRow()], {
      includeFinancials: false,
      statusLabel: identityLabel,
    });
    expect(csv).not.toContain("billingRate");
    expect(csv).not.toContain("billedAmount");
  });

  it("includes monetary columns with a dot decimal when allowed", () => {
    const csv = buildHoursCsv(
      [hoursRow({ billingRate: 320, billedAmount: 2560 })],
      { includeFinancials: true, statusLabel: identityLabel },
    );
    const header = lines(csv)[0];
    expect(header).toContain("billingRate");
    expect(header).toContain("billedAmount");
    expect(csv).toContain('"320.00"');
    expect(csv).toContain('"2560.00"');
  });

  it("formats hours with up to 2 decimals and a dot", () => {
    const csv = buildHoursCsv([hoursRow({ hours: 12.5 })], {
      includeFinancials: false,
      statusLabel: identityLabel,
    });
    expect(csv).toContain('"12.5"');
  });

  it("sanitizes a malicious project name", () => {
    const csv = buildHoursCsv([hoursRow({ projectName: "=cmd()" })], {
      includeFinancials: false,
      statusLabel: identityLabel,
    });
    expect(csv).toContain('"\'=cmd()"');
  });
});

describe("buildExpensesCsv", () => {
  const row: ExpensesReportRow = {
    id: "x1",
    date: "2026-06-03",
    consultantName: "Ana",
    clientName: "Vix",
    projectName: "Atlas",
    description: "Uber, ida e volta",
    invoiceNumber: "NF-1",
    amount: 42.9,
    status: "PAID",
    stage: "Finalizada",
    hasReceipt: true,
    lastDecision: "Aprovado",
    submittedAt: "2026-06-03T09:00:00.000Z",
  };

  it("quotes a description with a comma", () => {
    const csv = buildExpensesCsv([row], { statusLabel: identityLabel });
    expect(csv).toContain('"Uber, ida e volta"');
    expect(csv).toContain('"42.90"');
  });

  it("never includes storage fields", () => {
    const csv = buildExpensesCsv([row], { statusLabel: identityLabel });
    expect(csv).not.toMatch(/storage/i);
    expect(csv).not.toMatch(/fileName/);
  });

  it("emits a stable header with zero rows", () => {
    const csv = buildExpensesCsv([], { statusLabel: identityLabel });
    expect(lines(csv)).toHaveLength(1);
  });
});

describe("buildConsolidatedCsv", () => {
  const groups: ConsolidatedClient[] = [
    {
      clientName: "Vix",
      projects: [
        {
          projectId: "p1",
          projectName: "Atlas",
          approvedHours: 40,
          pendingHours: 8,
          billedAmount: 12800,
          expenseApproved: 100,
          expenseScheduled: 0,
          expensePaid: 50,
          expenseEntering: 150,
          expensePending: 20,
        },
      ],
    },
  ];

  it("omits billedAmount column when financials disabled", () => {
    const csv = buildConsolidatedCsv(groups, { includeFinancials: false });
    expect(csv).not.toContain("billedAmount");
    expect(lines(csv)[0]).toContain("approvedHours");
  });

  it("includes billedAmount when financials enabled", () => {
    const csv = buildConsolidatedCsv(groups, { includeFinancials: true });
    expect(lines(csv)[0]).toContain("billedAmount");
    expect(csv).toContain('"12800.00"');
    expect(csv).toContain('"40"');
  });
});
