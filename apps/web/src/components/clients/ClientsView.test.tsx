import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClientsView } from "./ClientsView";

vi.mock("@/app/app/clientes/actions", () => ({
  createClient: vi.fn(),
  updateClient: vi.fn(),
  createBillingType: vi.fn(),
  updateBillingType: vi.fn(),
  lookupCnpj: vi.fn(),
}));

function renderDemo(canViewFinancials = true) {
  return render(
    <ClientsView
      mode="demo"
      canManageClients
      canViewFinancials={canViewFinancials}
      canManageBillingTypes
      cnpjLookupAvailable={false}
    />,
  );
}

describe("ClientsView", () => {
  it("renders clients and masks financial fields when role cannot view them", () => {
    renderDemo(false);
    expect(screen.getByText("Atlas Energia")).toBeInTheDocument();
    expect(screen.getAllByText("•••").length).toBeGreaterThan(0);
  });

  it("creates a local client in demo mode", () => {
    renderDemo();
    fireEvent.click(screen.getByRole("button", { name: /Novo cliente/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Nome"), {
      target: { value: "Cliente Novo" },
    });
    fireEvent.change(within(dialog).getByLabelText("CNPJ"), {
      target: { value: "11.222.333/0001-44" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(screen.getByText("Cliente Novo")).toBeInTheDocument();
    expect(screen.getByText("Cliente salvo localmente.")).toBeInTheDocument();
  }, 10_000);

  it("manages billing types in the secondary tab", () => {
    renderDemo();
    fireEvent.click(screen.getByRole("button", { name: "Tipos de cobranca" }));
    expect(screen.getByText("Hora por projeto")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Novo tipo/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Nome"), {
      target: { value: "Pacote fechado" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(screen.getByText("Pacote fechado")).toBeInTheDocument();
    expect(
      screen.getByText("Tipo de cobranca salvo localmente."),
    ).toBeInTheDocument();
  });
});
