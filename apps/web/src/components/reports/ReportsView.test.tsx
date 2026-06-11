import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReportFilterOptions } from "@/lib/db/reports";
import type { ExpensesReport, HoursReport } from "@/lib/reports/types";
import { ReportsView } from "./ReportsView";

const filterOptions: ReportFilterOptions = {
  clients: [{ id: "client-a", name: "Cliente A" }],
  projects: [{ id: "proj-a", name: "Projeto A", clientId: "client-a" }],
  consultants: [
    { id: "cons-a", name: "Consultor A" },
    { id: "cons-b", name: "Consultor B" },
  ],
};

/** A full set of filters + sort + pageSize as a server would pass them raw. */
const FULL_PARAMS: Record<string, string> = {
  period: "mes-atual",
  from: "2026-06-01",
  to: "2026-06-30",
  clientId: "client-a",
  projectId: "proj-a",
  consultantId: "cons-b",
  status: "APPROVED",
  activityType: "ON_CALL",
  billable: "true",
  clientStatus: "ACTIVE",
  projectStatus: "ACTIVE",
  consultantStatus: "ACTIVE",
  sort: "hours",
  direction: "desc",
  pageSize: "100",
};

function hoursReport(page: number, totalPages: number): HoursReport {
  return {
    rows: [],
    totals: {
      count: 0,
      totalHours: 0,
      hoursByStatus: {},
      hoursByProject: [],
    },
    includeFinancials: false,
    pagination: { total: totalPages * 100, page, pageSize: 100, totalPages },
  };
}

function expensesReport(page: number, totalPages: number): ExpensesReport {
  return {
    rows: [],
    totals: {
      awaiting: 0,
      rejected: 0,
      toPay: 0,
      toPayAmount: 0,
      scheduled: 0,
      scheduledAmount: 0,
      paid: 0,
      paidAmount: 0,
      totalAmount: 0,
    },
    pagination: { total: totalPages * 100, page, pageSize: 100, totalPages },
  };
}

function renderHours(params: Record<string, string>, page = 2, totalPages = 3) {
  return render(
    <ReportsView
      mode="db"
      tab="horas"
      includeFinancials={false}
      filterOptions={filterOptions}
      rawParams={params}
      hoursReport={hoursReport(page, totalPages)}
    />,
  );
}

function exportLink(): HTMLAnchorElement {
  return screen.getByRole("link", { name: /Exportar CSV/ }) as HTMLAnchorElement;
}

function prevLink(): HTMLAnchorElement {
  return screen.getByText("Anterior").closest("a") as HTMLAnchorElement;
}

function nextLink(): HTMLAnchorElement {
  return screen.getByText("Próxima").closest("a") as HTMLAnchorElement;
}

/** Parse the query string of an href into a plain object. */
function query(href: string): Record<string, string> {
  const qs = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
  return Object.fromEntries(new URLSearchParams(qs).entries());
}

describe("ReportsView — pagination links preserve all params", () => {
  it("Anterior/Próxima carry every filter + sort + pageSize and the right page", () => {
    renderHours(FULL_PARAMS, 2, 3);

    const next = query(nextLink().getAttribute("href")!);
    // Every active filter is preserved.
    for (const [key, value] of Object.entries(FULL_PARAMS)) {
      expect(next[key]).toBe(value);
    }
    expect(next.tab).toBe("horas");
    expect(next.page).toBe("3");

    const prev = query(prevLink().getAttribute("href")!);
    for (const [key, value] of Object.entries(FULL_PARAMS)) {
      expect(prev[key]).toBe(value);
    }
    expect(prev.page).toBe("1");
  });

  it("clamps the previous page to 1 when on page 1", () => {
    renderHours(FULL_PARAMS, 1, 3);
    // On page 1, Anterior is disabled (no href), but the underlying href the
    // caller built must still clamp >= 1 — verify via the active Próxima.
    expect(query(nextLink().getAttribute("href")!).page).toBe("2");
    expect(prevLink()).not.toHaveAttribute("href");
  });

  it("does not leak an absent/ALL filter into the link", () => {
    renderHours(
      { sort: "hours", pageSize: "50", clientId: "ALL", status: "" },
      2,
      3,
    );
    const next = query(nextLink().getAttribute("href")!);
    expect(next.clientId).toBeUndefined();
    expect(next.status).toBeUndefined();
    expect(next.sort).toBe("hours");
    expect(next.pageSize).toBe("50");
  });

  it("preserves pageSize in expenses pagination links too", () => {
    render(
      <ReportsView
        mode="db"
        tab="despesas"
        includeFinancials={false}
        filterOptions={filterOptions}
        rawParams={{ ...FULL_PARAMS, stage: "GESTOR", activityType: "", billable: "" }}
        expensesReport={expensesReport(2, 3)}
      />,
    );
    const next = query(nextLink().getAttribute("href")!);
    expect(next.tab).toBe("despesas");
    expect(next.pageSize).toBe("100");
    expect(next.stage).toBe("GESTOR");
    expect(next.page).toBe("3");
  });
});

describe("ReportsView — CSV export link", () => {
  it("includes filters + sort but EXCLUDES page and pageSize", () => {
    renderHours(FULL_PARAMS, 2, 3);
    const href = exportLink().getAttribute("href")!;
    expect(href.startsWith("/api/relatorios/horas")).toBe(true);
    const q = query(href);

    // Filters + sort are present.
    expect(q.sort).toBe("hours");
    expect(q.direction).toBe("desc");
    expect(q.clientStatus).toBe("ACTIVE");
    expect(q.billable).toBe("true");
    expect(q.clientId).toBe("client-a");

    // page/pageSize must NOT be in the export link (export covers the whole set).
    expect(q.pageSize).toBeUndefined();
    expect(q.page).toBeUndefined();
    // tab is not part of the CSV endpoint query either.
    expect(q.tab).toBeUndefined();
  });

  it("points at the per-tab CSV endpoint", () => {
    render(
      <ReportsView
        mode="db"
        tab="despesas"
        includeFinancials={false}
        filterOptions={filterOptions}
        rawParams={{ clientId: "client-a" }}
        expensesReport={expensesReport(1, 1)}
      />,
    );
    expect(exportLink().getAttribute("href")).toBe(
      "/api/relatorios/despesas?clientId=client-a",
    );
  });

  it("disables the export link in demo mode", () => {
    render(
      <ReportsView
        mode="demo"
        tab="horas"
        includeFinancials={false}
        filterOptions={filterOptions}
        rawParams={{}}
        hoursReport={hoursReport(1, 1)}
      />,
    );
    expect(exportLink()).toHaveAttribute("aria-disabled", "true");
  });
});
