import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConsultantDirectory } from "./ConsultantDirectory";

vi.mock("@/app/app/consultores/actions", () => ({
  saveBankAccount: vi.fn(async () => ({ ok: true, data: { id: "bank-1" } })),
  saveCompensation: vi.fn(async () => ({ ok: true, data: { id: "comp-1" } })),
  saveConsultantIdentity: vi.fn(async () => ({ ok: true, data: { id: "con-1" } })),
}));

describe("ConsultantDirectory", () => {
  it("opens consultant details and gates sensitive actions by role", () => {
    render(<ConsultantDirectory canManagePeople={false} canManageFinancials={false} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Detalhes" })[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Identidade sincronizavel")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Salvar identidade" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Criar conta" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Salvar compensacao" })).toBeDisabled();
  });
});

