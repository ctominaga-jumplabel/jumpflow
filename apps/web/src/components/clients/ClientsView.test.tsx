import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ClientItem } from "@/lib/clients/types";
import {
  ClientsView,
  mergeBillingEmailsDraft,
  parseBillingEmails,
} from "./ClientsView";

vi.mock("@/app/app/clientes/actions", () => ({
  createClient: vi.fn(),
  updateClient: vi.fn(),
  createBillingType: vi.fn(),
  updateBillingType: vi.fn(),
  lookupCnpj: vi.fn(),
}));

function dbClient(name: string): ClientItem {
  return {
    id: "cli-1",
    name,
    billingEmails: [],
    roundingRule: "NONE",
    invoiceKind: "SERVICE",
    status: "ACTIVE",
    projectCount: 0,
  };
}

function renderDemo(canViewFinancials = true) {
  return render(
    <ClientsView
      mode="demo"
      canManageClients
      canViewFinancials={canViewFinancials}
      canManageBillingTypes
      cnpjLookupAvailable={false}
      logoUploadAvailable={false}
    />,
  );
}

describe("billing email helpers", () => {
  it("parses valid emails and drops invalid/empty fragments", () => {
    expect(parseBillingEmails("a@x.com, nope, b@y.com;")).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
    expect(parseBillingEmails("   ")).toEqual([]);
  });

  it("merges a pending draft into the committed list without duplicates", () => {
    expect(mergeBillingEmailsDraft(["a@x.com"], "b@y.com")).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
    // Draft already present → no duplicate.
    expect(mergeBillingEmailsDraft(["a@x.com"], "a@x.com")).toEqual([
      "a@x.com",
    ]);
    // Invalid draft → committed list unchanged.
    expect(mergeBillingEmailsDraft(["a@x.com"], "not-an-email")).toEqual([
      "a@x.com",
    ]);
  });
});

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
    fireEvent.click(screen.getByRole("button", { name: "Tipos de cobrança" }));
    // The "Tipo" cell shows the name plus the charge-model label, which coincide
    // for the canonical types — assert at least one match.
    expect(screen.getAllByText("Hora trabalhada").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Novo tipo/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Nome"), {
      target: { value: "Pacote fechado" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(screen.getByText("Pacote fechado")).toBeInTheDocument();
    expect(
      screen.getByText("Tipo de cobrança salvo localmente."),
    ).toBeInTheDocument();
  });

  it("re-syncs the table when revalidated props change in db mode", () => {
    const { rerender } = render(
      <ClientsView
        mode="db"
        clients={[dbClient("Atlas Energia")]}
        billingTypes={[]}
        canManageClients
        canViewFinancials
        canManageBillingTypes
        cnpjLookupAvailable={false}
        logoUploadAvailable={false}
      />,
    );
    expect(screen.getByText("Atlas Energia")).toBeInTheDocument();

    // Simulate revalidatePath: the page re-renders with fresh server data.
    rerender(
      <ClientsView
        mode="db"
        clients={[dbClient("Atlas Energia Renovavel")]}
        billingTypes={[]}
        canManageClients
        canViewFinancials
        canManageBillingTypes
        cnpjLookupAvailable={false}
        logoUploadAvailable={false}
      />,
    );
    expect(screen.getByText("Atlas Energia Renovavel")).toBeInTheDocument();
    expect(screen.queryByText("Atlas Energia")).not.toBeInTheDocument();
  });

  // Regression: typing in CNPJ used to steal focus back to the dialog (the
  // Modal focus-management effect re-ran on every keystroke because its inline
  // onClose identity changed on each parent re-render). Focus must stay put.
  it("keeps focus on the CNPJ field while typing", () => {
    renderDemo();
    fireEvent.click(screen.getByRole("button", { name: /Novo cliente/ }));
    const dialog = screen.getByRole("dialog");
    const cnpj = within(dialog).getByLabelText("CNPJ") as HTMLInputElement;

    cnpj.focus();
    expect(document.activeElement).toBe(cnpj);

    fireEvent.change(cnpj, { target: { value: "11" } });
    expect(document.activeElement).toBe(cnpj);

    fireEvent.change(cnpj, { target: { value: "11.222" } });
    expect(document.activeElement).toBe(cnpj);
  });
});
