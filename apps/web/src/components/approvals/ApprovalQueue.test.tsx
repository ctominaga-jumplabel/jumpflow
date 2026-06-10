import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApprovalQueue } from "./ApprovalQueue";

// Default items are all mock-sourced, so decisions stay local; mocking the
// actions module keeps server-only imports out of the jsdom test tree.
vi.mock("@/app/app/horas/actions", () => ({
  decideHours: vi.fn(),
}));

describe("ApprovalQueue", () => {
  it("renders the pending queue and a decision panel", () => {
    render(<ApprovalQueue />);
    expect(screen.getByText("Fila de aprovação")).toBeInTheDocument();
    expect(screen.getByText("Decisão")).toBeInTheDocument();
    expect(screen.queryByText("Em breve")).not.toBeInTheDocument();
  });

  it("requires a comment before rejection is allowed", () => {
    render(<ApprovalQueue />);
    const reject = screen.getByRole("button", { name: /Reprovar/ });
    expect(reject).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Comentário/), {
      target: { value: "Ajustar descrição." },
    });
    expect(reject).not.toBeDisabled();
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
    fireEvent.click(screen.getByRole("button", { name: /Aprovar/ }));
    expect(screen.getByText(/aprovado \(local\)/)).toBeInTheDocument();
    expect(screen.getByText("4 pendentes")).toBeInTheDocument();
  });

  it("rejects only with a justification and reports it", () => {
    render(<ApprovalQueue />);
    fireEvent.change(screen.getByLabelText(/Comentário/), {
      target: { value: "Reenviar com a nota fiscal." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Reprovar/ }));
    expect(screen.getByText(/reprovado com justificativa/)).toBeInTheDocument();
  });
});
