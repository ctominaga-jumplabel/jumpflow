import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApprovalQueue } from "./ApprovalQueue";

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
});
