import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TimesheetWeekView } from "./TimesheetWeekView";

/**
 * "Novo lançamento" × matriz (HORAS_LANCAMENTOS): o servidor decide se a grade
 * pode levar à tela cheia `/app/horas/lancamento`. Sem a concessão, o botão
 * NÃO navega para lá e abre o formulário da própria grade.
 */
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => "/app/horas",
}));
vi.mock("@/app/app/horas/actions", () => ({
  createTimeEntry: vi.fn(),
  createWeeklyTimeEntries: vi.fn(),
  updateTimeEntry: vi.fn(),
  deleteTimeEntry: vi.fn(),
  copyPreviousWeek: vi.fn(),
  applyTimesheetDefault: vi.fn(),
  saveTimesheetDefault: vi.fn(),
  submitWeek: vi.fn(),
  decideHours: vi.fn(),
  transcribeActivityAudio: vi.fn(),
}));
vi.mock("@/app/app/horas/reopen-request-actions", () => ({
  requestEntryReopen: vi.fn(),
}));

const dbWeek = {
  label: "Semana 24 · 08–14 jun 2026",
  startDate: "2026-06-08",
  endDate: "2026-06-14",
  status: "DRAFT" as const,
  days: [
    { label: "Seg", date: "2026-06-08", weekend: false },
    { label: "Ter", date: "2026-06-09", weekend: false },
    { label: "Qua", date: "2026-06-10", weekend: false },
    { label: "Qui", date: "2026-06-11", weekend: false },
    { label: "Sex", date: "2026-06-12", weekend: false },
    { label: "Sáb", date: "2026-06-13", weekend: true },
    { label: "Dom", date: "2026-06-14", weekend: true },
  ],
  rows: [],
};
const projects = [
  { id: "proj-1", name: "Portal do Cliente", clientId: "cli-acme", clientName: "Acme Corp" },
];

afterEach(() => {
  push.mockClear();
});

describe("TimesheetWeekView — Novo lançamento × HORAS_LANCAMENTOS", () => {
  it("navega para a tela cheia quando a matriz concede (default)", () => {
    render(<TimesheetWeekView mode="db" week={dbWeek} projects={projects} />);
    fireEvent.click(screen.getByRole("button", { name: /Novo lançamento/ }));
    expect(push).toHaveBeenCalledWith(
      "/app/horas/lancamento?semana=2026-06-08",
    );
  });

  it("não leva à tela cheia quando a matriz nega; abre o formulário da grade", () => {
    render(
      <TimesheetWeekView
        mode="db"
        week={dbWeek}
        projects={projects}
        canOpenNewEntryScreen={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Novo lançamento/ }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
