import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { AppUser } from "@/lib/auth/types";

/**
 * Relatórios page — matrix subtela gate. Every tab (Horas, Despesas,
 * Consolidado) is a subtela: a denied tab is left out of `allowedTabs`, its
 * report is never read, a `?tab=` pointing at it falls back to the first
 * allowed tab, and no tab left → /access-denied.
 */

const user: AppUser = {
  id: "user-1",
  name: "Ana",
  email: "ana@jumplabel.com.br",
  roles: ["ADMIN"],
};

let grants: Record<string, boolean>;

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => user),
}));
vi.mock("@/lib/auth/permissions", () => ({
  canEach: vi.fn(async (codes: readonly string[]) =>
    Object.fromEntries(codes.map((c) => [c, grants[c] ?? true])),
  ),
}));
vi.mock("@/lib/db/config", () => ({ isDatabaseConfigured: () => true }));

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

const reads = {
  hours: vi.fn(async () => ({ kind: "hours" })),
  expenses: vi.fn(async () => ({ kind: "expenses" })),
  consolidated: vi.fn(async () => ({ kind: "consolidated" })),
};
vi.mock("@/lib/db/reports", () => ({
  resolveReportScope: vi.fn(async () => ({ broad: true })),
  getReportFilterOptions: vi.fn(async () => ({
    clients: [],
    projects: [],
    consultants: [],
    allocations: [],
  })),
  getHoursReport: () => reads.hours(),
  getExpensesReport: () => reads.expenses(),
  getConsolidatedReport: () => reads.consolidated(),
}));

// Capture the props the page hands to the view.
let viewProps: Record<string, unknown> | undefined;
vi.mock("@/components/reports/ReportsView", () => ({
  ReportsView: (props: Record<string, unknown>) => {
    viewProps = props;
    return null;
  },
}));

import RelatoriosPage from "./page";

async function renderPage(params: Record<string, string> = {}) {
  const element = await RelatoriosPage({
    searchParams: Promise.resolve(params),
  });
  render(element);
  return viewProps!;
}

beforeEach(() => {
  grants = {};
  viewProps = undefined;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("RelatoriosPage — matrix subtelas", () => {
  it("keeps the default behavior when every tab is granted", async () => {
    const props = await renderPage();
    expect(props.allowedTabs).toEqual(["horas", "despesas", "consolidado"]);
    expect(props.tab).toBe("horas");
    expect(reads.hours).toHaveBeenCalledTimes(1);
    expect(reads.expenses).not.toHaveBeenCalled();
    expect(reads.consolidated).not.toHaveBeenCalled();
  });

  it("hides a denied tab and never reads its data, even when requested", async () => {
    grants = { RELATORIOS_DESPESAS: false };
    const props = await renderPage({ tab: "despesas" });
    expect(props.allowedTabs).toEqual(["horas", "consolidado"]);
    expect(props.tab).toBe("horas");
    expect(props.expensesReport).toBeUndefined();
    expect(reads.expenses).not.toHaveBeenCalled();
    expect(reads.hours).toHaveBeenCalledTimes(1);
  });

  it("defaults to the first allowed tab when Horas is denied", async () => {
    grants = { HORAS_RELATORIOS: false };
    const props = await renderPage();
    expect(props.allowedTabs).toEqual(["despesas", "consolidado"]);
    expect(props.tab).toBe("despesas");
    expect(reads.hours).not.toHaveBeenCalled();
    expect(reads.expenses).toHaveBeenCalledTimes(1);
  });

  it("redirects to /access-denied when no tab is allowed", async () => {
    grants = {
      HORAS_RELATORIOS: false,
      RELATORIOS_DESPESAS: false,
      RELATORIOS_CONSOLIDADO: false,
    };
    await expect(renderPage()).rejects.toThrow("REDIRECT:/access-denied");
    expect(reads.hours).not.toHaveBeenCalled();
    expect(reads.expenses).not.toHaveBeenCalled();
    expect(reads.consolidated).not.toHaveBeenCalled();
  });
});
