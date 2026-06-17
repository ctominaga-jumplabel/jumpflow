import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApprovalQueue } from "./ApprovalQueue";

// Default items are all mock-sourced, so decisions stay local; mocking the
// actions modules keeps server-only imports out of the jsdom test tree.
vi.mock("@/app/app/horas/actions", () => ({
  decideHours: vi.fn(),
}));
vi.mock("@/app/app/despesas/actions", () => ({
  decideAsManager: vi.fn(),
  decideAsFinance: vi.fn(),
}));

describe("ApprovalQueue", () => {
  it("renders the pending queue and a decision panel", () => {
    render(<ApprovalQueue />);
    expect(screen.getByText("Fila de aprovação")).toBeInTheDocument();
    expect(screen.getByText("Decisão")).toBeInTheDocument();
    expect(screen.queryByText("Em breve")).not.toBeInTheDocument();
  });

  it("switches to the history tab", () => {
    render(<ApprovalQueue />);
    fireEvent.click(screen.getByRole("button", { name: /Histórico/ }));
    expect(screen.getByText("Decisões recentes")).toBeInTheDocument();
  });

  it("filters the queue by kind (horas vs despesas)", () => {
    render(<ApprovalQueue />);
    // Default: all pending items (hours + expenses).
    expect(screen.getByText("5 pendentes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Despesas" }));
    expect(screen.getByText("2 pendentes")).toBeInTheDocument();
  });

  it("approves the selected item with local feedback", () => {
    render(<ApprovalQueue />);
    expect(screen.getByText("5 pendentes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Aprovar$/ }));
    expect(screen.getByText(/aprovado \(local\)/)).toBeInTheDocument();
    expect(screen.getByText("4 pendentes")).toBeInTheDocument();
  });

  it("rejects only with a justification and reports it", () => {
    render(<ApprovalQueue />);
    fireEvent.change(screen.getByLabelText(/Comentário/), {
      target: { value: "Reenviar com a nota fiscal." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Reprovar$/ }));
    expect(screen.getByText(/reprovado com justificativa/)).toBeInTheDocument();
  });

  it("keeps the Reprovar button enabled but blocks rejecting without a justification", () => {
    render(<ApprovalQueue />);
    const reject = screen.getByRole("button", { name: /^Reprovar$/ });
    // The button is clickable (not disabled) so the user gets feedback.
    expect(reject).not.toBeDisabled();
    fireEvent.click(reject);
    // No decision was applied: the inline validation message shows instead.
    expect(
      screen.getByText(/Informe uma justificativa para reprovar/),
    ).toBeInTheDocument();
    expect(screen.getByText("5 pendentes")).toBeInTheDocument();
  });

  it("filters approvals by project", () => {
    render(<ApprovalQueue />);
    fireEvent.change(screen.getByLabelText("Projeto"), {
      target: { value: "Atlas" },
    });
    expect(screen.getByText("3 pendentes")).toBeInTheDocument();
  });

  it("decides visible pending items in bulk with a justification", async () => {
    render(<ApprovalQueue />);
    fireEvent.click(screen.getByRole("button", { name: /Selecionar visíveis/ }));
    expect(await screen.findByText(/5 selecionado/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Justificativa de massa"), {
      target: { value: "Revisao em lote." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Reprovar seleção/ }));
    expect(
      await screen.findByText(/5 item\(ns\) reprovado\(s\)/),
    ).toBeInTheDocument();
    expect(await screen.findByText("0 pendentes")).toBeInTheDocument();
  });

  it("offers a 'Reabrir seleção' action only on the history tab", () => {
    render(<ApprovalQueue />);
    // Pending tab: no reopen action.
    expect(
      screen.queryByRole("button", { name: /Reabrir seleção/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Histórico/ }));
    expect(
      screen.getByRole("button", { name: /Reabrir seleção/ }),
    ).toBeInTheDocument();
  });

  it("reopens decided history items back to the pending queue in bulk", async () => {
    render(<ApprovalQueue />);
    expect(screen.getByText("5 pendentes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Histórico/ }));
    // Select every decided item, then reopen the selection.
    fireEvent.click(screen.getByRole("button", { name: /Selecionar visíveis/ }));
    fireEvent.click(screen.getByRole("button", { name: /Reabrir seleção/ }));
    expect(
      await screen.findByText(/item\(ns\) reaberto\(s\) para a fila pendente/),
    ).toBeInTheDocument();
    // All 5 decided mock items (auto-approved/approved/rejected, hours and
    // despesas) return to PENDING, joining the 5 already pending -> 10.
    expect(await screen.findByText("10 pendentes")).toBeInTheDocument();
  });

  it("clears the selection when switching tabs", () => {
    render(<ApprovalQueue />);
    fireEvent.click(screen.getByRole("button", { name: /Selecionar visíveis/ }));
    expect(screen.getByText(/5 selecionado/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Histórico/ }));
    expect(screen.getByText(/0 selecionado/)).toBeInTheDocument();
  });
});
