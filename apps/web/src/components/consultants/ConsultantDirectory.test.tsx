import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConsultantDirectory } from "./ConsultantDirectory";

vi.mock("@/app/app/consultores/actions", () => ({
  loadConsultantProfile: vi.fn(async () => ({ ok: true, data: null })),
  saveBankAccount: vi.fn(async () => ({ ok: true, data: { id: "bank-1" } })),
  saveCompensation: vi.fn(async () => ({ ok: true, data: { id: "comp-1" } })),
  saveConsultantIdentity: vi.fn(async () => ({ ok: true, data: { id: "con-1" } })),
  loadConsultantAdHocPayments: vi.fn(async () => ({
    ok: true,
    data: { payments: [], projects: [] },
  })),
  saveConsultantAdHocPayment: vi.fn(async () => ({
    ok: true,
    data: { id: "adhoc-1" },
  })),
  deleteConsultantAdHocPayment: vi.fn(async () => ({
    ok: true,
    data: { id: "adhoc-1" },
  })),
}));

describe("ConsultantDirectory", () => {
  it("opens consultant details and gates sensitive actions by role", () => {
    render(<ConsultantDirectory canManagePeople={false} canManageFinancials={false} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Detalhes" })[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Identidade sincronizavel")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Salvar identidade" })).toBeDisabled();
    // Bank accounts render once a contract type is set; CLT shows a single
    // account whose action is gated by the People role.
    fireEvent.change(within(dialog).getByLabelText("Tipo de contratacao"), {
      target: { value: "CLT" },
    });
    expect(within(dialog).getByRole("button", { name: "Criar conta" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Salvar compensacao" })).toBeDisabled();
  });

  it("renders one bank account for CLT/PJ and two labelled accounts for CLT FLEX", () => {
    render(<ConsultantDirectory canManagePeople canManageFinancials />);
    fireEvent.click(screen.getAllByRole("button", { name: "Detalhes" })[0]);
    const dialog = screen.getByRole("dialog");
    const setType = (value: string) =>
      fireEvent.change(within(dialog).getByLabelText("Tipo de contratacao"), {
        target: { value },
      });

    setType("PJ");
    expect(
      within(dialog).getAllByRole("button", { name: "Criar conta" }),
    ).toHaveLength(1);
    expect(within(dialog).getByText("Conta PJ")).toBeInTheDocument();
    expect(within(dialog).queryByText("Conta CLT")).not.toBeInTheDocument();

    setType("CLT_FLEX");
    expect(
      within(dialog).getAllByRole("button", { name: "Criar conta" }),
    ).toHaveLength(2);
    expect(within(dialog).getByText("Conta CLT")).toBeInTheDocument();
    expect(within(dialog).getByText("Conta PJ")).toBeInTheDocument();
    // Each account exposes Banco, Agência, Conta Corrente and PIX.
    expect(within(dialog).getAllByLabelText("Banco")).toHaveLength(2);
    expect(within(dialog).getAllByLabelText("Agência")).toHaveLength(2);
    expect(within(dialog).getAllByLabelText("Conta Corrente")).toHaveLength(2);
    expect(within(dialog).getAllByLabelText("PIX")).toHaveLength(2);
  });
});

