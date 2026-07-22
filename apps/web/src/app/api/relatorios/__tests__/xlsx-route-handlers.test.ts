import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contract test for the Hours .xlsx export route (Onda 6, P2). Mirrors the CSV
 * route-handler tests, but the highest-value guard here is the leak regression:
 * a CONSULTANT must never receive the monetary columns, even passing
 * ?includeFinancials=true — the flag is recomputed from the real user.
 *
 * requireUser / isDatabaseConfigured / the read + audit layers are mocked; the
 * xlsx builder runs for real and we read the workbook back to assert columns.
 */

import type { AppUser } from "@/lib/auth/types";
import type { HoursReport } from "@/lib/reports/types";

let currentUser: AppUser = {
  id: "user-1",
  name: "Ana",
  email: "ana@jumplabel.com.br",
  roles: ["CONSULTANT"],
};
let databaseConfigured = true;
let hoursReport: HoursReport;

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => currentUser),
}));
vi.mock("@/lib/db/config", () => ({
  isDatabaseConfigured: vi.fn(() => databaseConfigured),
}));
vi.mock("@/lib/db/reports", () => ({
  getHoursReport: vi.fn(async () => hoursReport),
}));
vi.mock("@/lib/db/users", () => ({ resolveDbUser: vi.fn(async () => ({ id: "u1" })) }));
vi.mock("@/lib/db/audit", () => ({ recordAuditEvent: vi.fn(async () => {}) }));

import { GET as hoursXlsxGet } from "../horas/xlsx/route";

function req(url: string): Request {
  return new Request(`http://localhost${url}`);
}

const ownRow: HoursReport["rows"][number] = {
  id: "e1",
  date: "2026-06-10",
  weekLabel: "Semana 24",
  consultantName: "Ana",
  clientName: "Vix",
  projectName: "Atlas",
  activity: "Desenvolvimento",
  hours: 8,
  billable: true,
  status: "APPROVED",
};

function totals(): HoursReport["totals"] {
  return { count: 0, totalHours: 0, hoursByStatus: {}, hoursByProject: [] };
}

async function headerCells(res: Response): Promise<string[]> {
  const wb = new ExcelJS.Workbook();
  const buf = Buffer.from(await res.arrayBuffer());
  await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.worksheets[0];
  const row = ws.getRow(1);
  const out: string[] = [];
  row.eachCell((c) => out.push(String(c.value)));
  return out;
}

beforeEach(() => {
  currentUser = {
    id: "user-1",
    name: "Ana",
    email: "ana@jumplabel.com.br",
    roles: ["CONSULTANT"],
  };
  databaseConfigured = true;
  hoursReport = {
    rows: [ownRow],
    totals: totals(),
    includeFinancials: false,
    pagination: { total: 1, page: 1, pageSize: 1, totalPages: 1 },
  };
});

describe("hours xlsx route", () => {
  it("returns 503 NO_DATABASE without a database", async () => {
    databaseConfigured = false;
    const res = await hoursXlsxGet(req("/api/relatorios/horas/xlsx"));
    expect(res.status).toBe(503);
  });

  it("sets the spreadsheet content type and filename", async () => {
    const res = await hoursXlsxGet(
      req("/api/relatorios/horas/xlsx?from=2026-06-01&to=2026-06-30"),
    );
    expect(res.headers.get("Content-Type")).toContain("spreadsheetml.sheet");
    expect(res.headers.get("Content-Disposition")).toContain(
      "relatorio-horas_2026-06-01_2026-06-30.xlsx",
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("CONSULTANT ?includeFinancials=true gets NO monetary columns", async () => {
    const res = await hoursXlsxGet(
      req("/api/relatorios/horas/xlsx?includeFinancials=true"),
    );
    const headers = await headerCells(res);
    expect(headers).not.toContain("Valor hora");
    expect(headers).not.toContain("Valor faturado");
  });

  it("financial report DOES carry the monetary columns", async () => {
    currentUser = { ...currentUser, roles: ["ADMIN"] };
    hoursReport = {
      rows: [{ ...ownRow, billingRate: 320, billedAmount: 2560 }],
      totals: { ...totals(), totalBilled: 2560 },
      includeFinancials: true,
      pagination: { total: 1, page: 1, pageSize: 1, totalPages: 1 },
    };
    const res = await hoursXlsxGet(req("/api/relatorios/horas/xlsx"));
    const headers = await headerCells(res);
    expect(headers).toContain("Valor hora");
    expect(headers).toContain("Valor faturado");
  });
});
