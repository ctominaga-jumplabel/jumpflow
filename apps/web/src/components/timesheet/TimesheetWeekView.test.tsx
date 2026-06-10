import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { TimesheetWeekView } from "./TimesheetWeekView";

// Demo mode never calls the server actions or navigates; mock both so the
// component tree stays free of server-only imports in jsdom.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/app/horas/actions", () => ({
  createTimeEntry: vi.fn(),
  updateTimeEntry: vi.fn(),
  deleteTimeEntry: vi.fn(),
  copyPreviousWeek: vi.fn(),
  submitWeek: vi.fn(),
  decideHours: vi.fn(),
}));

describe("TimesheetWeekView actions (demo mode)", () => {
  it("renders the current week, prepared actions and the demo banner", () => {
    render(<TimesheetWeekView mode="demo" />);
    expect(screen.getByText(/Semana 24/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Enviar para aprovação/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Modo demonstração/)).toBeInTheDocument();
  });

  it("navigates to the next week", () => {
    render(<TimesheetWeekView mode="demo" />);
    fireEvent.click(screen.getByRole("button", { name: /Próxima semana/ }));
    expect(screen.getByText(/Semana 25/)).toBeInTheDocument();
    expect(
      screen.getByText(/Nenhum lançamento nesta semana/),
    ).toBeInTheDocument();
  });

  it("reports feedback at the navigation boundary", () => {
    render(<TimesheetWeekView mode="demo" />);
    // From the current week (index 1) two steps back hits the boundary.
    fireEvent.click(screen.getByRole("button", { name: /Semana anterior/ }));
    fireEvent.click(screen.getByRole("button", { name: /Semana anterior/ }));
    expect(screen.getByText(/Não há mais semanas/)).toBeInTheDocument();
  });

  it("adds a new draft entry through the modal", () => {
    render(<TimesheetWeekView mode="demo" />);
    fireEvent.click(screen.getByRole("button", { name: /Novo lançamento/ }));

    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Projeto"), {
      target: { value: "prj-nimbus" },
    });
    fireEvent.change(within(dialog).getByLabelText("Horas"), {
      target: { value: "6" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Salvar/ }));

    expect(screen.getByText(/adicionado como rascunho/)).toBeInTheDocument();
    expect(
      within(screen.getByRole("table")).getByText("Nimbus"),
    ).toBeInTheDocument();
  });

  it("edits an existing draft entry", () => {
    render(<TimesheetWeekView mode="demo" />);
    // te-2 (Atlas · Reunião) is a DRAFT row, so it exposes an edit affordance.
    fireEvent.click(
      screen.getByRole("button", { name: /Editar lançamento de Atlas/ }),
    );
    const dialog = screen.getByRole("dialog");
    // Project/activity are locked while editing.
    expect(within(dialog).getByLabelText("Projeto")).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Horas"), {
      target: { value: "5" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Salvar/ }));
    expect(screen.getByText(/atualizado \(rascunho local\)/)).toBeInTheDocument();
  });

  it("rejects hours outside the 0–24 range", () => {
    render(<TimesheetWeekView mode="demo" />);
    fireEvent.click(screen.getByRole("button", { name: /Novo lançamento/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Projeto"), {
      target: { value: "prj-nimbus" },
    });
    fireEvent.change(within(dialog).getByLabelText("Horas"), {
      target: { value: "25" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Salvar/ }));
    expect(
      within(dialog).getByText(/Informe horas entre 0 e 24/),
    ).toBeInTheDocument();
  });

  it("submits draft entries for approval", () => {
    render(<TimesheetWeekView mode="demo" />);
    fireEvent.click(
      screen.getByRole("button", { name: /Enviar para aprovação/ }),
    );
    expect(screen.getByText(/enviado\(s\) para aprovação/)).toBeInTheDocument();
  });

  it("copies eligible entries from the previous week", () => {
    render(<TimesheetWeekView mode="demo" />);
    fireEvent.click(
      screen.getByRole("button", { name: /Copiar semana anterior/ }),
    );
    expect(screen.getByText(/copiados como rascunho/)).toBeInTheDocument();
  });
});

describe("TimesheetWeekView (db mode)", () => {
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
    rows: [
      {
        id: "proj-1|DEVELOPMENT|DRAFT",
        projectId: "proj-1",
        projectName: "Portal do Cliente",
        clientName: "Acme Corp",
        activity: "DEVELOPMENT" as const,
        billable: true,
        status: "DRAFT" as const,
        hours: [8, 0, 0, 0, 0, 0, 0],
        entryIds: ["entry-1", null, null, null, null, null, null],
      },
    ],
  };

  it("renders server data without the demo banner", () => {
    render(
      <TimesheetWeekView
        mode="db"
        week={dbWeek}
        projects={[{ id: "proj-1", name: "Portal do Cliente", clientName: "Acme Corp" }]}
      />,
    );
    expect(screen.getByText(/Semana 24/)).toBeInTheDocument();
    expect(
      within(screen.getByRole("table")).getByText("Portal do Cliente"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Modo demonstração/)).not.toBeInTheDocument();
  });
});
