import { describe, expect, it } from "vitest";
import {
  buildOperationClosingExportRows,
  operationClosingXlsxColumns,
} from "./closing-export";
import {
  summarizeOverview,
  summarizeReadiness,
  type OperationClosingRow,
} from "./closing";

function projectRow(overrides: Partial<OperationClosingRow>): OperationClosingRow {
  return {
    projectId: "p1",
    projectName: "Atlas",
    clientName: "Vix",
    closingId: null,
    status: "OPEN",
    closedAt: null,
    closedByName: null,
    notifiedAt: null,
    readiness: summarizeReadiness([]),
    exceptionCount: 0,
    ...overrides,
  };
}

describe("buildOperationClosingExportRows", () => {
  it("emits one row per allocated consultant with pt-BR labels", () => {
    const overview = summarizeOverview(6, 2026, [
      projectRow({
        status: "CLOSED",
        closedAt: "2026-07-01T12:00:00.000Z",
        closedByName: "Ana Gestora",
        readiness: summarizeReadiness([
          { consultantId: "c1", consultantName: "Bruno", state: "APPROVED", hours: 40 },
          { consultantId: "c2", consultantName: "Carla", state: "PENDING_REVIEW", hours: 32 },
        ]),
      }),
    ]);
    const rows = buildOperationClosingExportRows(overview);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      projectName: "Atlas",
      clientName: "Vix",
      closingStatus: "Fechado",
      consultantName: "Bruno",
      readiness: "Aprovado",
      hours: 40,
      closedAt: "2026-07-01T12:00:00.000Z",
      closedByName: "Ana Gestora",
    });
    expect(rows[1].readiness).toBe("Aguardando aprovação");
    expect(rows[1].consultantName).toBe("Carla");
  });

  it("keeps a placeholder row for a project with no allocated consultants", () => {
    const overview = summarizeOverview(6, 2026, [
      projectRow({ projectName: "Vega", clientName: "Loja Norte" }),
    ]);
    const rows = buildOperationClosingExportRows(overview);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      projectName: "Vega",
      closingStatus: "Aberto",
      consultantName: "",
      readiness: "Sem equipe alocada",
      hours: 0,
      closedAt: "",
      closedByName: "",
    });
  });
});

describe("operationClosingXlsxColumns", () => {
  it("has stable headers coherent with the screen", () => {
    expect(operationClosingXlsxColumns().map((c) => c.header)).toEqual([
      "Projeto",
      "Cliente",
      "Status do fechamento",
      "Consultor",
      "Situação",
      "Horas",
      "Fechado em",
      "Fechado por",
    ]);
  });
});
