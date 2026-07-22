import { describe, expect, it } from "vitest";
import {
  approvalXlsxColumns,
  filterApprovalItemsForExport,
} from "./approval-export";
import type { ApprovalItem } from "@/lib/mock-data/approvals";

function hours(overrides: Partial<ApprovalItem>): ApprovalItem {
  return {
    id: "h1",
    type: "HOURS",
    source: "db",
    consultantName: "Ana",
    projectName: "Atlas",
    clientName: "Vix",
    period: "Semana 24",
    hours: 40,
    activitySummary: "Desenvolvimento",
    submittedAt: "2026-06-08T18:00:00.000Z",
    status: "PENDING",
    isAutomatic: false,
    ...overrides,
  };
}

function expense(overrides: Partial<ApprovalItem>): ApprovalItem {
  return {
    id: "e1",
    type: "EXPENSE",
    source: "db",
    stage: "FINANCE",
    consultantName: "Carlos",
    projectName: "Orion",
    clientName: "Banco Sul",
    period: "03 jun 2026",
    hours: 0,
    amount: 184.9,
    activitySummary: "Deslocamento",
    submittedAt: "2026-06-04T13:00:00.000Z",
    status: "APPROVED",
    isAutomatic: false,
    ...overrides,
  };
}

describe("filterApprovalItemsForExport", () => {
  const items = [
    hours({ id: "h1", status: "PENDING", consultantName: "Ana" }),
    expense({ id: "e1", status: "APPROVED", consultantName: "Carlos" }),
    hours({
      id: "h2",
      status: "PENDING",
      consultantName: "Bruno",
      clientName: "Banco Sul",
      projectName: "Orion",
    }),
  ];

  it("returns everything with an empty filter", () => {
    expect(filterApprovalItemsForExport(items, {}).map((i) => i.id)).toEqual([
      "h1",
      "e1",
      "h2",
    ]);
  });

  it("filters by kind, status and names like the queue", () => {
    expect(
      filterApprovalItemsForExport(items, { kind: "HOURS" }).map((i) => i.id),
    ).toEqual(["h1", "h2"]);
    expect(
      filterApprovalItemsForExport(items, { status: "APPROVED" }).map((i) => i.id),
    ).toEqual(["e1"]);
    expect(
      filterApprovalItemsForExport(items, { client: "Banco Sul" }).map(
        (i) => i.id,
      ),
    ).toEqual(["e1", "h2"]);
    expect(
      filterApprovalItemsForExport(items, {
        kind: "HOURS",
        client: "Banco Sul",
      }).map((i) => i.id),
    ).toEqual(["h2"]);
    expect(
      filterApprovalItemsForExport(items, { consultant: "Ana" }).map((i) => i.id),
    ).toEqual(["h1"]);
  });

  it("filters by submitted-date window (inclusive)", () => {
    expect(
      filterApprovalItemsForExport(items, { from: "2026-06-05" }).map((i) => i.id),
    ).toEqual(["h1", "h2"]);
    expect(
      filterApprovalItemsForExport(items, { to: "2026-06-04" }).map((i) => i.id),
    ).toEqual(["e1"]);
  });
});

describe("approvalXlsxColumns", () => {
  it("puts hours on the Horas column and amount on the Valor column", () => {
    const columns = approvalXlsxColumns();
    const byHeader = Object.fromEntries(columns.map((c) => [c.header, c]));
    const h = hours({});
    const e = expense({ isAutomatic: true, ruleKey: "DEFAULT_8H", comment: "ok" });
    expect(byHeader["Tipo"].value(h)).toBe("Horas");
    expect(byHeader["Horas"].value(h)).toBe(40);
    expect(byHeader["Valor"].value(h)).toBeNull();

    expect(byHeader["Tipo"].value(e)).toBe("Despesas");
    expect(byHeader["Etapa"].value(e)).toBe("Financeiro");
    expect(byHeader["Horas"].value(e)).toBeNull();
    expect(byHeader["Valor"].value(e)).toBe(184.9);
    expect(byHeader["Automático"].value(e)).toBe("Sim");
    expect(byHeader["Regra"].value(e)).toBe("DEFAULT_8H");
    expect(byHeader["Justificativa"].value(e)).toBe("ok");
    expect(byHeader["Status"].value(e)).toBe("Aprovado");
  });
});
