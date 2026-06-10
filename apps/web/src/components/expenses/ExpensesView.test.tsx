import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ExpensesView } from "./ExpensesView";

function renderView(canManagePayments = false) {
  return render(
    <ExpensesView
      consultantName="Ana Tester"
      canManagePayments={canManagePayments}
      today="2026-06-10"
    />,
  );
}

describe("ExpensesView", () => {
  it("renders the summary, filters and list", () => {
    renderView();
    expect(screen.getByText("Total lançado")).toBeInTheDocument();
    expect(screen.getByText("Filtros")).toBeInTheDocument();
    expect(screen.getByText("Despesas")).toBeInTheDocument();
    // A seeded expense description is visible.
    expect(
      screen.getByText(/Material de apoio para oficina de discovery/),
    ).toBeInTheDocument();
  });

  it("creates a new expense and reports honest feedback", () => {
    renderView();
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
    expect(screen.getByText(/enviada para aprovação/)).toBeInTheDocument();
  });

  it("blocks submitting an expense without required fields", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Nova despesa/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Enviar para aprovação/ }),
    );
    expect(within(dialog).getByText("Selecione um projeto.")).toBeInTheDocument();
  });

  it("filters the list by status", () => {
    renderView();
    // DRAFT seed is visible before filtering.
    expect(
      screen.getByText(/Material de apoio para oficina de discovery/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Aprovada/ }));
    expect(
      screen.queryByText(/Material de apoio para oficina de discovery/),
    ).not.toBeInTheDocument();
  });

  it("only lets financial roles change payment status", () => {
    const { rerender } = renderView(false);
    expect(
      screen.queryByLabelText(/Status de pagamento/),
    ).not.toBeInTheDocument();

    rerender(
      <ExpensesView
        consultantName="Ana Tester"
        canManagePayments
        today="2026-06-10"
      />,
    );
    expect(
      screen.getAllByLabelText(/Status de pagamento/).length,
    ).toBeGreaterThan(0);
  });
});
