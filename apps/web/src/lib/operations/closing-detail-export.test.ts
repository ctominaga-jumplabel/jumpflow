import { describe, expect, it } from "vitest";
import {
  buildOperationDetailExportRows,
  operationDetailXlsxColumns,
} from "./closing-detail-export";
import type { OperationDetailRow } from "./closing";

function detailRow(overrides: Partial<OperationDetailRow>): OperationDetailRow {
  return {
    id: "e1",
    date: "2026-06-10",
    consultantId: "c1",
    consultantName: "Bruno",
    clientName: "Vix",
    projectName: "Atlas",
    activityType: "WORKDAY",
    hours: 8,
    billable: true,
    status: "APPROVED",
    hasAttachment: false,
    decidedAt: "2026-06-11T12:00:00.000Z",
    isException: false,
    ...overrides,
  };
}

describe("buildOperationDetailExportRows", () => {
  it("maps a launch to the DP columns with pt-BR labels", () => {
    const rows = buildOperationDetailExportRows([detailRow({})]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      date: "2026-06-10",
      consultantName: "Bruno",
      clientProject: "Vix / Atlas",
      activity: "Dia Útil",
      hours: 8,
      billable: "Sim",
      status: "Aprovado",
      decidedAt: "2026-06-11T12:00:00.000Z",
    });
  });

  it("renders non-billable and a missing decision as blanks/Não", () => {
    const rows = buildOperationDetailExportRows([
      detailRow({ billable: false, status: "SUBMITTED", decidedAt: null }),
    ]);
    expect(rows[0].billable).toBe("Não");
    expect(rows[0].status).toBe("Enviado");
    expect(rows[0].decidedAt).toBe("");
  });
});

describe("operationDetailXlsxColumns", () => {
  it("has the headers the DP asked for, in order", () => {
    expect(operationDetailXlsxColumns().map((c) => c.header)).toEqual([
      "Data",
      "Consultor",
      "Cliente / Projeto",
      "Atividade",
      "Horas",
      "Faturável",
      "Status",
      "Decidido em",
    ]);
  });
});
