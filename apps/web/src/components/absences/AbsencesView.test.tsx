import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// A view chama as server actions e navega; mockamos ambos para manter a árvore
// livre de imports server-only no jsdom.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
const requestTimeOff = vi.fn();
const decideTimeOff = vi.fn();
const cancelTimeOff = vi.fn();
vi.mock("@/app/app/ausencias/actions", () => ({
  requestTimeOff: (...args: unknown[]) => requestTimeOff(...args),
  decideTimeOff: (...args: unknown[]) => decideTimeOff(...args),
  cancelTimeOff: (...args: unknown[]) => cancelTimeOff(...args),
}));

import { AbsencesView } from "./AbsencesView";
import type {
  PendingTimeOffItem,
  TimeOffListItem,
} from "@/lib/db/time-off-view";

const ownItem: TimeOffListItem = {
  id: "to1",
  kind: "VACATION",
  status: "REQUESTED",
  paid: true,
  startDate: "2026-07-20",
  endDate: "2026-07-24",
  workingDays: 5,
  note: null,
  decisionComment: null,
};

const pendingItem: PendingTimeOffItem = {
  ...ownItem,
  id: "p1",
  consultantId: "c1",
  consultantName: "Ana Consultora",
  vacationBalanceDays: 30,
};

describe("AbsencesView — consultor (escopo próprio)", () => {
  it("mostra a seção do consultor com as próprias ausências e o saldo", () => {
    render(
      <AbsencesView
        own={{ items: [ownItem], vacationBalanceDays: 30 }}
        canDecide={false}
      />,
    );
    expect(screen.getByText("Minhas ausências")).toBeInTheDocument();
    expect(screen.getByText(/Saldo de férias/)).toBeInTheDocument();
    expect(screen.getByText(/20\/07\/2026 a 24\/07\/2026/)).toBeInTheDocument();
    // Sem poder de decisão: a fila de decisão não aparece.
    expect(screen.queryByText("Ausências para decisão")).not.toBeInTheDocument();
  });

  it("oferece cancelar uma ausência viva (REQUESTED)", () => {
    render(
      <AbsencesView
        own={{ items: [ownItem], vacationBalanceDays: null }}
        canDecide={false}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Cancelar" }),
    ).toBeInTheDocument();
  });

  it("não oferece cancelar para uma ausência já reprovada", () => {
    render(
      <AbsencesView
        own={{
          items: [{ ...ownItem, status: "REJECTED" }],
          vacationBalanceDays: null,
        }}
        canDecide={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Cancelar" }),
    ).not.toBeInTheDocument();
  });
});

describe("AbsencesView — decisão (ADMIN/PEOPLE)", () => {
  it("mostra a fila e o painel de decisão", () => {
    render(<AbsencesView pending={[pendingItem]} canDecide />);
    expect(screen.getByText("Ausências para decisão")).toBeInTheDocument();
    // Aparece na lista (botão) e no painel de detalhe.
    expect(screen.getAllByText("Ana Consultora").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "Aprovar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reprovar" })).toBeInTheDocument();
  });

  it("reprovar sem comentário mostra erro e NÃO chama a action", () => {
    render(<AbsencesView pending={[pendingItem]} canDecide />);
    fireEvent.click(screen.getByRole("button", { name: "Reprovar" }));
    expect(
      screen.getByText(/Informe uma justificativa para reprovar/i),
    ).toBeInTheDocument();
    expect(decideTimeOff).not.toHaveBeenCalled();
  });

  it("reprovar com comentário chama decideTimeOff(approve=false)", () => {
    render(<AbsencesView pending={[pendingItem]} canDecide />);
    fireEvent.change(
      screen.getByLabelText(/Comentário/i),
      { target: { value: "Fora do período permitido" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Reprovar" }));
    expect(decideTimeOff).toHaveBeenCalledWith({
      id: "p1",
      approve: false,
      comment: "Fora do período permitido",
    });
  });

  it("aprovar chama decideTimeOff(approve=true)", () => {
    render(<AbsencesView pending={[pendingItem]} canDecide />);
    fireEvent.click(screen.getByRole("button", { name: "Aprovar" }));
    expect(decideTimeOff).toHaveBeenCalledWith({
      id: "p1",
      approve: true,
      comment: undefined,
    });
  });

  it("sem pedidos, mostra o estado vazio da fila", () => {
    render(<AbsencesView pending={[]} canDecide />);
    expect(
      screen.getByText(/Nenhum pedido de ausência aguardando decisão/i),
    ).toBeInTheDocument();
  });
});
