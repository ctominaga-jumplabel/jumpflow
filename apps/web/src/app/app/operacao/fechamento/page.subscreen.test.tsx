import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Subtela gate of the Fechamento Operacional screen: the "Detalhamento por
 * consultor" tab only shows (and only loads its data) when the matrix grants
 * view on `OPERACAO_FECHAMENTO_DETALHAMENTO`. The "Fechamento" tab is governed
 * by the screen code. Guards / matrix / db layer and the heavy tab components
 * are mocked; FinanceTabs renders for real.
 */

let detailAllowed = true;

vi.mock("@/lib/auth/guards", () => ({
  requirePermission: vi.fn(async () => ({
    id: "u1",
    name: "Ana",
    email: "ana@jumplabel.com.br",
    roles: ["ADMIN"],
  })),
}));
vi.mock("@/lib/auth/permissions", () => ({
  can: vi.fn(async () => true),
  canEach: vi.fn(async (codes: readonly string[]) =>
    Object.fromEntries(
      codes.map((code) => [
        code,
        code === "OPERACAO_FECHAMENTO_DETALHAMENTO" ? detailAllowed : true,
      ]),
    ),
  ),
}));
vi.mock("@/lib/db/config", () => ({ isDatabaseConfigured: () => true }));

const listOperationClosings = vi.fn(
  async (input: { month: number; year: number }) => ({
    month: input.month,
    year: input.year,
    rows: [],
  }),
);
const listOperationClosingDetail = vi.fn(async () => ({
  rows: [],
  pagination: { total: 0, page: 1, pageSize: 50, totalPages: 1 },
  totalHours: 0,
  totalExceptions: 0,
}));
const getOperationFilterOptions = vi.fn(async () => ({
  clients: [],
  projects: [],
  consultants: [],
}));
vi.mock("@/lib/db/operation-closing", () => ({
  listOperationClosings: (input: { month: number; year: number }) =>
    listOperationClosings(input),
  listOperationClosingDetail: () => listOperationClosingDetail(),
  getOperationFilterOptions: () => getOperationFilterOptions(),
}));
vi.mock("@/lib/operations/closing", () => ({
  summarizeOverview: (month: number, year: number) => ({
    month,
    year,
    rows: [],
  }),
}));

vi.mock("@/components/operations/OperationClosingFilters", () => ({
  OperationClosingFilters: ({ tab }: { tab: string }) => (
    <div data-testid="filters" data-tab={tab} />
  ),
}));
vi.mock("@/components/operations/OperationClosingTable", () => ({
  OperationClosingTable: () => <div data-testid="closing-table" />,
}));
vi.mock("@/components/operations/OperationConsultantDetailTable", () => ({
  OperationConsultantDetailTable: ({ exportHref }: { exportHref?: string }) => (
    <div data-testid="detail-table" data-export={exportHref ?? ""} />
  ),
}));

import OperationClosingPage from "./page";

async function renderPage(params: Record<string, string> = {}) {
  render(await OperationClosingPage({ searchParams: Promise.resolve(params) }));
}

beforeEach(() => {
  detailAllowed = true;
  listOperationClosings.mockClear();
  listOperationClosingDetail.mockClear();
  getOperationFilterOptions.mockClear();
});

describe("Fechamento Operacional — subtela Detalhamento", () => {
  it("shows both tabs and loads the detail when the matrix grants it", async () => {
    await renderPage({ tab: "detalhamento" });

    expect(screen.getByRole("tab", { name: "Fechamento" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Detalhamento por consultor" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("detail-table").dataset.export).toContain(
      "/api/operacao/fechamento/detalhe/export",
    );
    expect(listOperationClosingDetail).toHaveBeenCalledTimes(1);
    expect(listOperationClosings).toHaveBeenCalledTimes(1);
  });

  it("hides the detail tab and never loads its data when the matrix denies it", async () => {
    detailAllowed = false;
    await renderPage({ tab: "detalhamento" });

    expect(screen.getByRole("tab", { name: "Fechamento" })).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Detalhamento por consultor" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("detail-table")).not.toBeInTheDocument();
    expect(screen.getByTestId("closing-table")).toBeInTheDocument();
    // The requested (denied) tab falls back to the first allowed one.
    expect(screen.getByTestId("filters").dataset.tab).toBe("fechamento");
    expect(listOperationClosingDetail).not.toHaveBeenCalled();
    expect(listOperationClosings).toHaveBeenCalledTimes(1);
  });
});
