import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionAdminView } from "./PermissionAdminView";
import type { PermissionView, RoleView } from "@/lib/db/permissions";

const actions = vi.hoisted(() => ({
  saveRolePermissions: vi.fn(async () => ({ ok: true, data: { roleId: "r", changed: 1 } })),
  savePermission: vi.fn(async () => ({ ok: true, data: { id: "new", code: "X" } })),
  togglePermissionActive: vi.fn(async () => ({ ok: true, data: { id: "p", active: false } })),
  deletePermissionAction: vi.fn(async () => ({ ok: true, data: { id: "p" } })),
  saveRole: vi.fn(async () => ({ ok: true, data: { id: "r-new", key: "auditoria" } })),
  toggleRoleActive: vi.fn(async () => ({ ok: true, data: { id: "r", active: false } })),
  deleteRoleAction: vi.fn(async () => ({ ok: true, data: { id: "r" } })),
}));
vi.mock("@/app/app/admin/permissoes/actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const role = (over: Partial<RoleView>): RoleView => ({
  id: "r-admin",
  key: "ADMIN",
  name: "ADMIN",
  label: "Administrador",
  description: null,
  active: true,
  isSystem: true,
  userCount: 2,
  ...over,
});
const ROLES: RoleView[] = [
  role({}),
  role({ id: "r-aud", key: "auditoria", name: null, label: "Auditoria", isSystem: false, userCount: 0 }),
];

const perm = (over: Partial<PermissionView>): PermissionView => ({
  id: "p-horas",
  code: "HORAS",
  name: "Horas",
  module: "Horas",
  description: null,
  active: true,
  parentId: null,
  sortOrder: 10,
  isSystem: true,
  ...over,
});
const PERMISSIONS: PermissionView[] = [
  perm({ id: "p-lanc", code: "HORAS_LANCAMENTOS", name: "Lançamentos", parentId: "p-horas", sortOrder: 11 }),
  perm({}),
  perm({ id: "p-custom", code: "HORAS_LOTE", name: "Em lote", parentId: "p-horas", sortOrder: 12, isSystem: false }),
  perm({ id: "p-dash", code: "DASHBOARD", name: "Dashboard", module: "Relatórios & Análises", sortOrder: 0 }),
];

function renderView() {
  return render(
    <PermissionAdminView
      roles={ROLES}
      permissions={PERMISSIONS}
      matrices={{ "r-admin": [{ permissionId: "p-horas", canView: true, canCreate: true, canEdit: true, canDelete: true }] }}
      screenRoutes={{ HORAS: "/app/horas", DASHBOARD: "/app/dashboard" }}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("PermissionAdminView", () => {
  it("shows the three tabs and starts on the matrix", () => {
    renderView();
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Matriz", "Grupos de acesso2", "Funcionalidades4"]);
    expect(screen.getByRole("tab", { name: "Matriz" })).toHaveAttribute("aria-selected", "true");
  });

  it("lists features as módulo → tela → subtelas with the screen route", () => {
    renderView();
    fireEvent.click(screen.getByRole("tab", { name: /Funcionalidades/ }));
    const sections = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(sections).toEqual(["Relatórios & Análises", "Horas"]);
    const horas = screen.getByRole("region", { name: "Horas" });
    const names = within(horas)
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r).getAllByRole("cell")[0].textContent);
    expect(names).toEqual(["Horas", "Lançamentos", "Em lote"]);
    // Subtelas inherit the parent's route.
    expect(within(horas).getAllByText("/app/horas")).toHaveLength(3);
  });

  it("protects system features from deletion but allows custom ones", () => {
    renderView();
    fireEvent.click(screen.getByRole("tab", { name: /Funcionalidades/ }));
    expect(screen.getByRole("button", { name: "Excluir Horas" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Excluir Em lote" })).toBeEnabled();
  });

  it("deletes a custom feature after confirmation", async () => {
    renderView();
    fireEvent.click(screen.getByRole("tab", { name: /Funcionalidades/ }));
    fireEvent.click(screen.getByRole("button", { name: "Excluir Em lote" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));
    await waitFor(() =>
      expect(actions.deletePermissionAction).toHaveBeenCalledWith({ permissionId: "p-custom" }),
    );
  });

  it("creates a subtela with a code suggested from the parent", async () => {
    renderView();
    fireEvent.click(screen.getByRole("tab", { name: /Funcionalidades/ }));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar subtela em Horas" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Nome"), { target: { value: "Relatório semanal" } });
    expect(within(dialog).getByLabelText(/Código/)).toHaveValue("HORAS_RELATORIO_SEMANAL");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cadastrar" }));
    await waitFor(() =>
      expect(actions.savePermission).toHaveBeenCalledWith(
        expect.objectContaining({ code: "HORAS_RELATORIO_SEMANAL", module: "Horas", parentId: "p-horas" }),
      ),
    );
  });

  it("protects system groups and deletes empty custom groups", async () => {
    renderView();
    fireEvent.click(screen.getByRole("tab", { name: /Grupos de acesso/ }));
    expect(screen.getByRole("button", { name: "Excluir Administrador" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Inativar Administrador" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Excluir Auditoria" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(actions.deleteRoleAction).toHaveBeenCalledWith({ roleId: "r-aud" }));
  });

  it("opens a group's matrix from the Grupos tab", () => {
    renderView();
    fireEvent.click(screen.getByRole("tab", { name: /Grupos de acesso/ }));
    fireEvent.click(screen.getByRole("button", { name: "Configurar permissões de Auditoria" }));
    expect(screen.getByRole("tab", { name: "Matriz" })).toHaveAttribute("aria-selected", "true");
    const matrix = document.getElementById("perm-panel-matriz")!;
    expect(matrix).toBeVisible();
    expect(within(matrix).getAllByDisplayValue("Auditoria (personalizado)").length).toBeGreaterThan(0);
  });
});
