import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Proves the role-protected module pages actually enforce RBAC on the server.
 * The proxy only checks authentication, and route-permissions.ts is a pure map;
 * without this test, dropping `requireRole` from a page would pass unnoticed.
 */
const requireRoleMock = vi.fn(async (roles: unknown) => {
  void roles;

  return {
    id: "u1",
    name: "Ana",
    email: "ana@jumplabel.com.br",
    roles: ["ADMIN" as const],
  };
});

vi.mock("@/lib/auth/guards", () => ({
  requireRole: (roles: unknown) => requireRoleMock(roles),
  // ApprovalQueue imports the Horas actions module, which also pulls
  // requireUser from this module; provide it so the mock stays complete.
  requireUser: vi.fn(async () => ({
    id: "u1",
    name: "Ana",
    email: "ana@jumplabel.com.br",
    roles: ["ADMIN" as const],
  })),
}));

import FinanceiroPage from "./financeiro/page";
import AprovacoesPage from "./aprovacoes/page";
import { FINANCIAL_ROLES } from "@/lib/auth/route-permissions";

afterEach(() => vi.clearAllMocks());

describe("module RBAC guards", () => {
  it("Financeiro requires the financial roles", async () => {
    await FinanceiroPage();
    expect(requireRoleMock).toHaveBeenCalledTimes(1);
    expect(requireRoleMock).toHaveBeenCalledWith(FINANCIAL_ROLES);
  });

  it("Aprovações requires manager/admin/finance roles", async () => {
    await AprovacoesPage();
    expect(requireRoleMock).toHaveBeenCalledTimes(1);
    // FINANCE entered in Round 3: it decides the finance stage of expenses.
    expect(requireRoleMock).toHaveBeenCalledWith([
      "ADMIN",
      "AREA_MANAGER",
      "PROJECT_MANAGER",
      "FINANCE",
    ]);
  });
});
