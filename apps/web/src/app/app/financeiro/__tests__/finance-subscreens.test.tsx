import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";

/**
 * Subtelas do Financeiro na matriz (FINANCEIRO_CONTAS_RECEBER / _CONTAS_PAGAR /
 * _STATUS_FATURAMENTO): a aba negada some, os dados dela não são carregados, a
 * aba pedida negada cai na primeira permitida, nenhuma permitida →
 * /access-denied; Apuração, exports e actions da Apuração recusam.
 */

const h = vi.hoisted(() => ({
  grants: {} as Record<string, boolean>,
  user: { id: "u1", name: "Ana", email: "ana@x", roles: ["FINANCE"] },
}));

const m = vi.hoisted(() => ({
  listFinanceExpenses: vi.fn(async () => ({ expenses: [] })),
  getReceivablesOverview: vi.fn(async () => ({
    days: [],
    summary: {
      totalHours: 0,
      totalToInvoice: null,
      allocatedCount: 0,
      unratedBillableHours: 0,
      hasNonHourlyBilling: false,
    },
    includeFinancials: false,
  })),
  listPendingClosings: vi.fn(async () => ({
    rows: [],
    month: 10,
    year: 2026,
    pendingCount: 0,
  })),
  getReceivablesApuracao: vi.fn(async () => ({
    projects: [],
    includeFinancials: false,
  })),
  getReportFilterOptions: vi.fn(async () => ({
    clients: [],
    projects: [],
    consultants: [],
  })),
  listRevenueClosings: vi.fn(async () => ({ rows: [] })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    const err = new Error("NEXT_REDIRECT");
    Object.assign(err, { digest: `NEXT_REDIRECT;replace;${to};307;` });
    throw err;
  }),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/app/financeiro",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@jumpflow/database", () => ({ prisma: {}, Prisma: {} }));
vi.mock("@/lib/auth/guards", () => ({
  requireRole: vi.fn(async () => h.user),
  requireUser: vi.fn(async () => h.user),
}));
vi.mock("@/lib/auth/permissions", () => ({
  can: vi.fn(async (code: string) => h.grants[code] ?? true),
  canEach: vi.fn(async (codes: readonly string[]) =>
    Object.fromEntries(codes.map((c) => [c, h.grants[c] ?? true])),
  ),
}));
vi.mock("@/lib/db/config", () => ({ isDatabaseConfigured: () => true }));
vi.mock("@/lib/storage/provider", () => ({ isStorageConfigured: () => false }));

vi.mock("@/lib/db/expenses", () => ({
  listFinanceExpenses: m.listFinanceExpenses,
}));
vi.mock("@/lib/financial/receivables-journey", () => ({
  getReceivablesOverview: m.getReceivablesOverview,
  listPendingClosings: m.listPendingClosings,
  getReceivablesApuracao: m.getReceivablesApuracao,
  loadApuracaoStates: vi.fn(async () => new Map()),
  buildApuracaoWorkbook: vi.fn(async () => Buffer.from("")),
}));
vi.mock("@/lib/db/reports", () => ({
  getReportFilterOptions: m.getReportFilterOptions,
}));
vi.mock("@/lib/db/revenue", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listRevenueClosings: m.listRevenueClosings,
}));
vi.mock("@/lib/db/users", () => ({ resolveDbUser: vi.fn(async () => null) }));
vi.mock("@/lib/db/audit", () => ({
  recordAuditEvent: vi.fn(async () => {}),
  buildAuditEventData: vi.fn(),
}));

// Captura as props passadas pelo server à visão (sem renderizar o client).
vi.mock("@/components/financial/FinancialOverview", () => ({
  FinancialOverview: () => null,
}));

import FinanceiroPage from "../page";
import ApuracaoPage from "../apuracao/page";
import { GET as apuracaoExport } from "@/app/api/financeiro/apuracao/export/route";
import { GET as pagarExport } from "@/app/api/financeiro/pagar/export/route";
import { GET as receberExport } from "@/app/api/financeiro/receber/export/route";
import { enviarApuracao, marcarApuracaoFaturada } from "../actions";
import { SUBSCREEN_CODES } from "@/lib/auth/permission-codes";

const RECEIVABLES = SUBSCREEN_CODES.finance.receivables;
const PAYABLES = SUBSCREEN_CODES.finance.payables;
const BILLING_STATUS = SUBSCREEN_CODES.finance.billingStatus;

type OverviewProps = {
  allowedTabs: string[];
  defaultTab: string;
  receivables?: unknown;
  receivablesFilterOptions?: unknown;
  financeExpenses?: unknown;
  pendingClosings?: unknown;
  apuracaoHref?: string;
  timesheetExportHref?: string;
  pagarExportHref?: string;
};

async function renderPage(
  params: Record<string, string> = {},
): Promise<OverviewProps> {
  const tree = (await FinanceiroPage({
    searchParams: Promise.resolve(params),
  })) as ReactElement<{ children: ReactElement<OverviewProps>[] }>;
  return tree.props.children[1].props;
}

beforeEach(() => {
  h.grants = {};
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("/app/financeiro — subtelas", () => {
  it("todas concedidas: comportamento inalterado (3 abas, dados carregados)", async () => {
    const props = await renderPage({ tab: "pagar" });
    expect(props.allowedTabs).toEqual(["receber", "pagar", "pendentes"]);
    expect(props.defaultTab).toBe("pagar");
    expect(m.getReceivablesOverview).toHaveBeenCalledTimes(1);
    expect(m.getReportFilterOptions).toHaveBeenCalledTimes(1);
    expect(m.listFinanceExpenses).toHaveBeenCalledTimes(1);
    expect(m.listPendingClosings).toHaveBeenCalledTimes(1);
    expect(props.apuracaoHref).toMatch(/^\/app\/financeiro\/apuracao\?/);
    expect(props.pagarExportHref).toBe("/api/financeiro/pagar/export");
  });

  it("Contas a Receber negada: aba some, dados/links dela não são montados", async () => {
    h.grants[RECEIVABLES] = false;
    const props = await renderPage();
    expect(props.allowedTabs).toEqual(["pagar", "pendentes"]);
    expect(props.defaultTab).toBe("pagar");
    expect(m.getReceivablesOverview).not.toHaveBeenCalled();
    expect(m.getReportFilterOptions).not.toHaveBeenCalled();
    expect(props.receivables).toBeUndefined();
    expect(props.apuracaoHref).toBeUndefined();
    expect(props.timesheetExportHref).toBeUndefined();
  });

  it("Contas a Pagar negada: ?tab=pagar cai na primeira permitida", async () => {
    h.grants[PAYABLES] = false;
    const props = await renderPage({ tab: "pagar" });
    expect(props.allowedTabs).toEqual(["receber", "pendentes"]);
    expect(props.defaultTab).toBe("receber");
    expect(m.listFinanceExpenses).not.toHaveBeenCalled();
    expect(props.financeExpenses).toBeUndefined();
    expect(props.pagarExportHref).toBeUndefined();
  });

  it("Status de Faturamento negada: fila de pendentes não é consultada", async () => {
    h.grants[BILLING_STATUS] = false;
    const props = await renderPage({ tab: "pendentes" });
    expect(props.allowedTabs).toEqual(["receber", "pagar"]);
    expect(props.defaultTab).toBe("receber");
    expect(m.listPendingClosings).not.toHaveBeenCalled();
    expect(props.pendingClosings).toBeUndefined();
  });

  it("nenhuma aba permitida → /access-denied", async () => {
    h.grants = {
      [RECEIVABLES]: false,
      [PAYABLES]: false,
      [BILLING_STATUS]: false,
    };
    await expect(renderPage()).rejects.toMatchObject({
      digest: expect.stringContaining("/access-denied"),
    });
    expect(m.getReceivablesOverview).not.toHaveBeenCalled();
    expect(m.listFinanceExpenses).not.toHaveBeenCalled();
    expect(m.listPendingClosings).not.toHaveBeenCalled();
  });
});

describe("/app/financeiro/apuracao — parte de Contas a Receber", () => {
  const params = { from: "2026-10-01", to: "2026-10-31" };

  it("concedida: carrega a apuração", async () => {
    await ApuracaoPage({ searchParams: Promise.resolve(params) });
    expect(m.getReceivablesApuracao).toHaveBeenCalledTimes(1);
  });

  it("negada: /access-denied sem consultar nada", async () => {
    h.grants[RECEIVABLES] = false;
    await expect(
      ApuracaoPage({ searchParams: Promise.resolve(params) }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining("/access-denied"),
    });
    expect(m.getReceivablesApuracao).not.toHaveBeenCalled();
  });
});

describe("exports do Financeiro — recusam quando a subtela é negada", () => {
  const apuracaoUrl =
    "http://x/api/financeiro/apuracao/export?from=2026-10-01&to=2026-10-31";

  it("apuração export: 403 com Contas a Receber negada", async () => {
    h.grants[RECEIVABLES] = false;
    const res = await apuracaoExport(new Request(apuracaoUrl));
    expect(res.status).toBe(403);
    expect(m.getReceivablesApuracao).not.toHaveBeenCalled();
  });

  it("apuração export: segue normal quando concedida", async () => {
    const res = await apuracaoExport(new Request(apuracaoUrl));
    expect(res.status).toBe(200);
    expect(m.getReceivablesApuracao).toHaveBeenCalledTimes(1);
  });

  it("receber export: 403 com Contas a Receber negada", async () => {
    h.grants[RECEIVABLES] = false;
    const res = await receberExport(
      new Request("http://x/api/financeiro/receber/export"),
    );
    expect(res.status).toBe(403);
    expect(m.listRevenueClosings).not.toHaveBeenCalled();
  });

  it("pagar export: 403 com Contas a Pagar negada", async () => {
    h.grants[PAYABLES] = false;
    const res = await pagarExport();
    expect(res.status).toBe(403);
    expect(m.listFinanceExpenses).not.toHaveBeenCalled();
  });

  it("pagar export: segue normal quando concedida", async () => {
    const res = await pagarExport();
    expect(res.status).toBe(200);
    expect(m.listFinanceExpenses).toHaveBeenCalledTimes(1);
  });
});

describe("actions da Apuração — FORBIDDEN com Contas a Receber negada", () => {
  const input = { projectId: "p1", from: "2026-10-01", to: "2026-10-31" };

  it("enviarApuracao recusa", async () => {
    h.grants[RECEIVABLES] = false;
    const result = await enviarApuracao(input);
    expect(result).toMatchObject({ ok: false, error: "FORBIDDEN" });
  });

  it("marcarApuracaoFaturada recusa", async () => {
    h.grants[RECEIVABLES] = false;
    const result = await marcarApuracaoFaturada(input);
    expect(result).toMatchObject({ ok: false, error: "FORBIDDEN" });
  });

  it("concedida: passa do gate (falha só adiante, na validação)", async () => {
    const result = await enviarApuracao({ ...input, from: "inválido" });
    expect(result).toMatchObject({ ok: false, error: "INVALID_INPUT" });
  });
});

describe("FinancialOverview — renderiza só as abas permitidas", () => {
  it("omite a aba negada mantendo os rótulos", async () => {
    const actual = await vi.importActual<
      typeof import("@/components/financial/FinancialOverview")
    >("@/components/financial/FinancialOverview");
    render(<actual.FinancialOverview allowedTabs={["receber", "pendentes"]} />);
    expect(
      screen.getByRole("tab", { name: "Contas a Receber" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Status de Faturamento" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Contas a Pagar" })).toBeNull();
  });
});
