import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProjectList } from "./ProjectList";
import { MASKED_VALUE } from "@/lib/format";

describe("ProjectList", () => {
  it("renders projects and is not a placeholder", () => {
    render(<ProjectList canViewFinancials />);
    expect(screen.getByText("Atlas")).toBeInTheDocument();
    expect(screen.queryByText("Em breve")).not.toBeInTheDocument();
  });

  it("shows financial fields when authorized", () => {
    render(<ProjectList canViewFinancials />);
    // Atlas billing rate is R$ 320,00.
    expect(screen.getByText(/320,00/)).toBeInTheDocument();
    expect(screen.queryByText(MASKED_VALUE)).not.toBeInTheDocument();
  });

  it("masks financial fields when not authorized", () => {
    render(<ProjectList canViewFinancials={false} />);
    expect(screen.getAllByText(MASKED_VALUE).length).toBeGreaterThan(0);
    expect(screen.queryByText(/320,00/)).not.toBeInTheDocument();
  });

  it("filters by status via the filter chips", () => {
    render(<ProjectList canViewFinancials />);
    expect(screen.getByText("Lumen")).toBeInTheDocument(); // closed project
    fireEvent.click(screen.getByRole("button", { name: "Ativo" }));
    expect(screen.queryByText("Lumen")).not.toBeInTheDocument();
    expect(screen.getByText("Atlas")).toBeInTheDocument();
  });
});
