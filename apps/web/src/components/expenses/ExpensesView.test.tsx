import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Expense } from "@/lib/expenses/types";
import { ExpensesView } from "./ExpensesView";

// Server actions never run in jsdom: mock the module so the db-mode wiring
// can be asserted without Prisma/auth imports.
vi.mock("@/app/app/despesas/actions", () => ({
  createExpense: vi.fn(async () => ({ ok: true, data: { id: "exp-new" } })),
  updateExpense: vi.fn(async () => ({ ok: true, data: { id: "exp-new" } })),
  deleteExpense: vi.fn(async () => ({ ok: true, data: { id: "exp-new" } })),
  submitExpense: vi.fn(async () => ({ ok: true, data: { id: "exp-new" } })),
  attachReceipt: vi.fn(async () => ({ ok: false, error: "NO_STORAGE", message: "x" })),
  replaceReceipt: vi.fn(async () => ({ ok: false, error: "NO_STORAGE", message: "x" })),
  getReceiptUrl: vi.fn(async () => ({ ok: false, error: "NO_STORAGE", message: "x" })),
}));

import { submitExpense } from "@/app/app/despesas/actions";

function renderDemo() {
  return render(
    <ExpensesView mode="demo" consultantName="Ana Tester" today="2026-06-10" />,
  );
}

const dbExpense: Expense = {
  id: "exp-db-1",
  projectId: "proj-1",
  projectName: "Portal",
  clientName: "Cliente X",
  consultantName: "Ana Tester",
  date: "2026-06-08",
  amount: 120.5,
  description: "Despesa real de banco",
  status: "DRAFT",
  source: "db",
};

describe("ExpensesView (demo mode)", () => {
  it("renders the banner, summary, filters and list", () => {
    renderDemo();
    expect(screen.getByText(/Modo demonstração/)).toBeInTheDocument();
    expect(screen.getByText("Total lançado")).toBeInTheDocument();
    expect(screen.getByText("Filtros")).toBeInTheDocument();
    expect(screen.getByText("Despesas")).toBeInTheDocument();
    // A seeded expense description is visible.
    expect(
      screen.getByText(/Material de apoio para oficina de discovery/),
    ).toBeInTheDocument();
  });

  it("creates a new expense and reports honest local feedback", () => {
    renderDemo();
    fireEvent.click(screen.getByRole("button", { name: /Nova despesa/ }));

    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Projeto"), {
      target: { value: "prj-atlas" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Valor/), {
      target: { value: "150" },
    });
    fireEvent.change(within(dialog).getByLabelText("Descrição"), {
      target: { value: "Táxi para o cliente" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Enviar para aprovação/ }),
    );

    // Scope to the list table: the modal lingers briefly during its exit
    // animation, so query the row explicitly rather than the whole document.
    expect(
      within(screen.getByRole("table")).getByText("Táxi para o cliente"),
    ).toBeInTheDocument();
    expect(screen.getByText(/enviada para aprovação \(local\)/)).toBeInTheDocument();
  });

  it("blocks submitting an expense without required fields", () => {
    renderDemo();
    fireEvent.click(screen.getByRole("button", { name: /Nova despesa/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Enviar para aprovação/ }),
    );
    expect(within(dialog).getByText("Selecione um projeto.")).toBeInTheDocument();
  });

  it("filters the list by status of the new chain", () => {
    renderDemo();
    // DRAFT seed is visible before filtering.
    expect(
      screen.getByText(/Material de apoio para oficina de discovery/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Paga$/ }));
    expect(
      screen.queryByText(/Material de apoio para oficina de discovery/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Estacionamento durante visita técnica/),
    ).toBeInTheDocument();
  });
});

describe("ExpensesView (db mode)", () => {
  it("renders server data without the demo banner", () => {
    render(
      <ExpensesView
        mode="db"
        consultantName="Ana Tester"
        today="2026-06-10"
        expenses={[dbExpense]}
        projects={[{ id: "proj-1", name: "Portal", clientName: "Cliente X" }]}
        storageAvailable={false}
      />,
    );
    expect(screen.queryByText(/Modo demonstração/)).not.toBeInTheDocument();
    expect(screen.getByText("Despesa real de banco")).toBeInTheDocument();
  });

  it("submits a DRAFT through the server action", async () => {
    render(
      <ExpensesView
        mode="db"
        consultantName="Ana Tester"
        today="2026-06-10"
        expenses={[dbExpense]}
        projects={[{ id: "proj-1", name: "Portal", clientName: "Cliente X" }]}
        storageAvailable={false}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Enviar despesa Despesa real/ }),
    );
    expect(
      await screen.findByText("Despesa enviada para aprovação."),
    ).toBeInTheDocument();
    expect(vi.mocked(submitExpense)).toHaveBeenCalledWith({ id: "exp-db-1" });
  });

  it("shows the storage-unavailable warning in the form", () => {
    render(
      <ExpensesView
        mode="db"
        consultantName="Ana Tester"
        today="2026-06-10"
        expenses={[]}
        projects={[{ id: "proj-1", name: "Portal", clientName: "Cliente X" }]}
        storageAvailable={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Nova despesa/ }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/Anexos indisponíveis: storage não configurado/),
    ).toBeInTheDocument();
  });
});
