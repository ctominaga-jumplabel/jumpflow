import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Subtela "Tipos de cobrança" na página de Clientes: o servidor resolve a
 * matriz, esconde a aba e nao carrega os tipos quando ninguem precisa deles.
 */

const h = vi.hoisted(() => ({
  user: { id: "u", roles: ["SALES"] as string[] },
  allowed: true,
  listBillingTypes: vi.fn(async () => [{ id: "bt-1" }]),
  listClients: vi.fn(async () => []),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireRole: vi.fn(async () => h.user),
}));
vi.mock("@/lib/auth/permissions", () => ({
  canEach: vi.fn(async (codes: string[]) =>
    Object.fromEntries(codes.map((c) => [c, h.allowed])),
  ),
}));
vi.mock("@/lib/db/config", () => ({ isDatabaseConfigured: () => true }));
vi.mock("@/lib/db/clients", () => ({
  listBillingTypes: h.listBillingTypes,
  listClients: h.listClients,
}));
vi.mock("@/lib/cnpj/provider", () => ({ isCnpjLookupConfigured: () => false }));
vi.mock("@/lib/storage/provider", () => ({ isStorageConfigured: () => false }));
vi.mock("@/components/ui/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("@/components/clients/ClientsView", () => ({
  ClientsView: () => null,
}));

import ClientesPage from "./page";

function viewProps(tree: unknown): Record<string, unknown> {
  // O componente da view é o 2º filho do wrapper.
  const children = (tree as { props: { children: unknown[] } }).props.children;
  return (children[1] as { props: Record<string, unknown> }).props;
}

beforeEach(() => {
  h.listBillingTypes.mockClear();
  h.user = { id: "u", roles: ["SALES"] };
  h.allowed = true;
});

describe("ClientesPage — subtela Tipos de cobrança", () => {
  it("negada: esconde a aba e não carrega os tipos (sem campo financeiro)", async () => {
    h.allowed = false;
    const props = viewProps(await ClientesPage());
    expect(props.canViewBillingTypes).toBe(false);
    expect(props.canManageBillingTypes).toBe(false);
    expect(props.billingTypes).toEqual([]);
    expect(h.listBillingTypes).not.toHaveBeenCalled();
  });

  it("negada: perfil financeiro ainda recebe os tipos para o formulário de cliente", async () => {
    h.allowed = false;
    h.user = { id: "u", roles: ["FINANCE"] };
    const props = viewProps(await ClientesPage());
    expect(props.canViewBillingTypes).toBe(false);
    expect(props.canManageBillingTypes).toBe(false);
    expect(h.listBillingTypes).toHaveBeenCalledTimes(1);
  });

  it("concedida: comportamento padrão inalterado", async () => {
    h.user = { id: "u", roles: ["FINANCE"] };
    const props = viewProps(await ClientesPage());
    expect(props.canViewBillingTypes).toBe(true);
    expect(props.canManageBillingTypes).toBe(true);
    expect(props.billingTypes).toEqual([{ id: "bt-1" }]);
  });
});
