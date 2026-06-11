import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contract tests for the Relatorios CSV route handlers
 * (docs/relatorios-fechamento.md section 8 + section 10 "Route handlers"):
 *
 * - no database -> 503 NO_DATABASE
 * - invalid filters (from > to) -> 400 INVALID_INPUT
 * - `includeFinancials` is recomputed from the REAL user; any client query
 *   param/flag is ignored (a CONSULTANT passing ?includeFinancials=true gets no
 *   monetary columns)
 * - response headers: text/csv, attachment filename, Cache-Control no-store
 * - RBAC == screen: the read function is the SAME and a CONSULTANT can only
 *   export their own rows
 *
 * `requireUser`, `isDatabaseConfigured` and the read layer are mocked — the CSV
 * builders run for real so header presence is asserted against true output.
 */

import type { AppUser } from "@/lib/auth/types";
import type {
  ConsolidatedReport,
  ExpensesReport,
  HoursReport,
} from "@/lib/reports/types";

// --- mocks --------------------------------------------------------------

let currentUser: AppUser = {
  id: "user-1",
  name: "Ana",
  email: "ana@jumplabel.com.br",
  roles: ["CONSULTANT"],
};
let databaseConfigured = true;

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => currentUser),
}));

vi.mock("@/lib/db/config", () => ({
  isDatabaseConfigured: vi.fn(() => databaseConfigured),
}));

// Capture the (user, filter) each read function received, and let each test
// decide what report shape comes back.
const calls = {
  hours: undefined as { user: AppUser; filter: unknown } | undefined,
  expenses: undefined as { user: AppUser; filter: unknown } | undefined,
  consolidated: undefined as { user: AppUser; filter: unknown } | undefined,
};

let hoursReport: HoursReport;
let expensesReport: ExpensesReport;
let consolidatedReport: ConsolidatedReport;

vi.mock("@/lib/db/reports", () => ({
  getHoursReport: vi.fn(async (user: AppUser, filter: unknown) => {
    calls.hours = { user, filter };
    return hoursReport;
  }),
  getExpensesReport: vi.fn(async (user: AppUser, filter: unknown) => {
    calls.expenses = { user, filter };
    return expensesReport;
  }),
  getConsolidatedReport: vi.fn(async (user: AppUser, filter: unknown) => {
    calls.consolidated = { user, filter };
    return consolidatedReport;
  }),
}));

import { GET as hoursGet } from "../horas/route";
import { GET as expensesGet } from "../despesas/route";
import { GET as consolidatedGet } from "../consolidado/route";

function req(url: string): Request {
  return new Request(`http://localhost${url}`);
}

const ownHoursRow: HoursReport["rows"][number] = {
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

beforeEach(() => {
  currentUser = {
    id: "user-1",
    name: "Ana",
    email: "ana@jumplabel.com.br",
    roles: ["CONSULTANT"],
  };
  databaseConfigured = true;
  calls.hours = undefined;
  calls.expenses = undefined;
  calls.consolidated = undefined;
  // Default reports reflect a CONSULTANT scope (no financials).
  hoursReport = {
    rows: [ownHoursRow],
    totals: emptyHoursTotals(),
    includeFinancials: false,
    pagination: meta(1),
  };
  expensesReport = { rows: [], totals: emptyExpenseTotals(), pagination: meta(0) };
  consolidatedReport = { clients: [], totals: emptyConsolidatedTotals(), includeFinancials: false };
});

function meta(total: number): HoursReport["pagination"] {
  return { total, page: 1, pageSize: total, totalPages: 1 };
}

function emptyHoursTotals(): HoursReport["totals"] {
  return { count: 0, totalHours: 0, hoursByStatus: {}, hoursByProject: [] };
}
function emptyExpenseTotals(): ExpensesReport["totals"] {
  return {
    awaiting: 0,
    rejected: 0,
    toPay: 0,
    toPayAmount: 0,
    scheduled: 0,
    scheduledAmount: 0,
    paid: 0,
    paidAmount: 0,
    totalAmount: 0,
  };
}
function emptyConsolidatedTotals(): ConsolidatedReport["totals"] {
  return { approvedHours: 0, pendingHours: 0, expenseEntering: 0, expensePending: 0 };
}

// --- no database --------------------------------------------------------

describe("no database -> 503 NO_DATABASE", () => {
  it.each([
    ["horas", () => hoursGet(req("/api/relatorios/horas"))],
    ["despesas", () => expensesGet(req("/api/relatorios/despesas"))],
    ["consolidado", () => consolidatedGet(req("/api/relatorios/consolidado"))],
  ])("%s", async (_label, run) => {
    databaseConfigured = false;
    const res = await run();
    expect(res.status).toBe(503);
    expect(await res.text()).toBe("NO_DATABASE");
  });

  it("does not call the read layer when no database", async () => {
    databaseConfigured = false;
    await hoursGet(req("/api/relatorios/horas"));
    expect(calls.hours).toBeUndefined();
  });
});

// --- invalid input ------------------------------------------------------

describe("invalid filters -> 400 INVALID_INPUT", () => {
  it("hours: from > to", async () => {
    const res = await hoursGet(
      req("/api/relatorios/horas?from=2026-06-30&to=2026-06-01"),
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("INVALID_INPUT");
    expect(calls.hours).toBeUndefined();
  });

  it("expenses: invalid status enum", async () => {
    const res = await expensesGet(
      req("/api/relatorios/despesas?status=NOPE"),
    );
    expect(res.status).toBe(400);
  });

  it("consolidated: from > to", async () => {
    const res = await consolidatedGet(
      req("/api/relatorios/consolidado?from=2026-12-01&to=2026-01-01"),
    );
    expect(res.status).toBe(400);
    expect(calls.consolidated).toBeUndefined();
  });

  it("consolidated: malformed month", async () => {
    const res = await consolidatedGet(
      req("/api/relatorios/consolidado?month=2026-13"),
    );
    expect(res.status).toBe(400);
  });
});

// --- headers ------------------------------------------------------------

describe("CSV response headers", () => {
  it("hours sets text/csv, attachment filename and no-store", async () => {
    const res = await hoursGet(
      req("/api/relatorios/horas?from=2026-06-01&to=2026-06-30"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="relatorio-horas_2026-06-01_2026-06-30.csv"',
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    // Note: WHATWG `Response.text()` strips a leading UTF-8 BOM on decode, so
    // the BOM contract is asserted at the builder level in csv.test.ts. Here we
    // just confirm the header row is present.
    const body = await res.text();
    expect(body.split("\r\n")[0]).toContain('"date"');
  });

  it("expenses filename uses the range slug", async () => {
    const res = await expensesGet(
      req("/api/relatorios/despesas?from=2026-06-01&to=2026-06-30"),
    );
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="relatorio-despesas_2026-06-01_2026-06-30.csv"',
    );
  });

  it("consolidated filename uses the month period", async () => {
    const res = await consolidatedGet(
      req("/api/relatorios/consolidado?month=2026-06"),
    );
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="consolidado_2026-06.csv"',
    );
  });

  it("hours filename falls back to `tudo` without a range", async () => {
    const res = await hoursGet(req("/api/relatorios/horas"));
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="relatorio-horas_tudo.csv"',
    );
  });
});

// --- includeFinancials recomputed from the real user --------------------

describe("includeFinancials is recomputed from the real user", () => {
  it("CONSULTANT ?includeFinancials=true gets NO monetary hour columns", async () => {
    // The client hint is a lie: the report comes back with includeFinancials
    // false (server truth) and the CSV must omit billingRate/billedAmount.
    const res = await hoursGet(
      req("/api/relatorios/horas?includeFinancials=true"),
    );
    const header = (await res.text()).split("\r\n")[0];
    expect(header).not.toContain("billingRate");
    expect(header).not.toContain("billedAmount");
    // The bogus flag is never forwarded as a filter the read layer respects.
    expect(calls.hours?.filter).not.toHaveProperty("includeFinancials");
  });

  it("ADMIN report (includeFinancials true) DOES carry monetary columns", async () => {
    currentUser = { ...currentUser, roles: ["ADMIN"] };
    hoursReport = {
      rows: [{ ...ownHoursRow, billingRate: 320, billedAmount: 2560 }],
      totals: { ...emptyHoursTotals(), totalBilled: 2560 },
      includeFinancials: true,
      pagination: meta(1),
    };
    const res = await hoursGet(req("/api/relatorios/horas"));
    const header = (await res.text()).split("\r\n")[0];
    expect(header).toContain("billingRate");
    expect(header).toContain("billedAmount");
  });

  it("consolidated CONSULTANT omits billedAmount column", async () => {
    const res = await consolidatedGet(req("/api/relatorios/consolidado"));
    const header = (await res.text()).split("\r\n")[0];
    expect(header).not.toContain("billedAmount");
  });
});

// --- RBAC == screen -----------------------------------------------------

describe("RBAC matches the screen (same read function)", () => {
  it("hours passes the REAL user to the read function", async () => {
    await hoursGet(req("/api/relatorios/horas"));
    expect(calls.hours?.user.roles).toEqual(["CONSULTANT"]);
    expect(calls.hours?.user.id).toBe("user-1");
  });

  it("hours CSV ignores page/pageSize (exports the whole filtered set)", async () => {
    await hoursGet(
      req("/api/relatorios/horas?status=APPROVED&page=2&pageSize=25"),
    );
    const filter = calls.hours?.filter as Record<string, unknown>;
    // The other filters are forwarded...
    expect(filter.status).toBe("APPROVED");
    // ...but pagination is stripped so the read returns everything.
    expect(filter).not.toHaveProperty("page");
    expect(filter).not.toHaveProperty("pageSize");
  });

  it("expenses CSV ignores page/pageSize", async () => {
    await expensesGet(
      req("/api/relatorios/despesas?clientStatus=ACTIVE&page=3&pageSize=100"),
    );
    const filter = calls.expenses?.filter as Record<string, unknown>;
    expect(filter.clientStatus).toBe("ACTIVE");
    expect(filter).not.toHaveProperty("page");
    expect(filter).not.toHaveProperty("pageSize");
  });

  it("CONSULTANT export only contains the rows the read layer returned", async () => {
    // The read layer (resolveReportScope) restricts a CONSULTANT to its own
    // consultant id; the route just serializes those rows. Verify it emits the
    // single own row and nothing else.
    const res = await hoursGet(req("/api/relatorios/horas"));
    const dataLines = (await res.text())
      .replace(/^﻿/, "")
      .split("\r\n")
      .filter((l) => l.length > 0)
      .slice(1);
    expect(dataLines).toHaveLength(1);
    expect(dataLines[0]).toContain("Ana");
    expect(dataLines[0]).toContain("Atlas");
  });
});
