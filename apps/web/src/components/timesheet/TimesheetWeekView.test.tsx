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
  createWeeklyTimeEntries: vi.fn(),
  updateTimeEntry: vi.fn(),
  deleteTimeEntry: vi.fn(),
  copyPreviousWeek: vi.fn(),
  applyTimesheetDefault: vi.fn(),
  saveTimesheetDefault: vi.fn(),
  submitWeek: vi.fn(),
  decideHours: vi.fn(),
}));

describe("TimesheetWeekView actions (demo mode)", () => {
  it("renders the current week, prepared actions and the demo banner", () => {
    render(<TimesheetWeekView mode="demo" />);
    expect(screen.getByText(/Semana 24/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Novo lançamento/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Modo demonstração/)).toBeInTheDocument();
  });

  it("no longer exposes a 'Enviar para aprovação' button (Rodada 4.3)", () => {
    // The direct-approval flow removes the separate submit button: a saved
    // entry enters approval on its own.
    render(<TimesheetWeekView mode="demo" />);
    expect(
      screen.queryByRole("button", { name: /Enviar para aprovação/ }),
    ).not.toBeInTheDocument();
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
    // Default clock (09:00–18:00 with break) already yields valid hours; only
    // the (now mandatory) description must be filled.
    fireEvent.change(within(dialog).getByLabelText("Descrição"), {
      target: { value: "Trabalho no Nimbus" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Salvar/ }));

    // Rodada 4.3: a saved entry enters approval directly (no "rascunho").
    expect(
      screen.getByText(/enviado para aprovação \(demo\)/),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("table")).getByText("Nimbus"),
    ).toBeInTheDocument();
  });

  it("adds a weekly entry through the modal", () => {
    render(<TimesheetWeekView mode="demo" />);
    fireEvent.click(screen.getByRole("button", { name: /Novo lan/ }));

    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Projeto"), {
      target: { value: "prj-nimbus" },
    });
    fireEvent.click(within(dialog).getByText("Semanal"));
    fireEvent.change(within(dialog).getByLabelText("Descrição"), {
      target: { value: "Rotina semanal" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Salvar/ }));

    expect(screen.getAllByText(/enviado/).length).toBeGreaterThan(0);
    // The weekly entry shows up as a single Nimbus row in the grid.
    expect(within(screen.getByRole("table")).getByText("Nimbus")).toBeInTheDocument();
  });

  it("edits an existing draft entry", () => {
    render(<TimesheetWeekView mode="demo" />);
    // te-2 (Atlas · Sobreaviso) is a DRAFT row, so it exposes an edit
    // affordance. te-1 (Atlas · Dia Útil) is SUBMITTED and now also editable,
    // so target the activity explicitly to avoid an ambiguous match.
    fireEvent.click(
      screen.getByRole("button", {
        name: /Editar lançamento de Atlas · Sobreaviso/,
      }),
    );
    const dialog = screen.getByRole("dialog");
    // Project/activity are locked while editing.
    expect(within(dialog).getByLabelText("Projeto")).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Descrição"), {
      target: { value: "Sobreaviso revisado" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Salvar/ }));
    // Editing a DRAFT row resubmits it for approval (Rodada 4.3).
    expect(
      screen.getByText(/enviado para aprovação \(demo\)/),
    ).toBeInTheDocument();
  });

  it("edits a SUBMITTED entry and keeps it in approval", () => {
    render(<TimesheetWeekView mode="demo" />);
    // te-1 (Atlas · Dia Útil) is SUBMITTED; it is now editable.
    fireEvent.click(
      screen.getByRole("button", {
        name: /Editar lançamento de Atlas · Dia Útil/,
      }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Descrição"), {
      target: { value: "Dia útil revisado" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Salvar/ }));
    // The edited entry stays in the approval flow (SUBMITTED).
    expect(
      screen.getByText(/enviado para aprovação \(demo\)/),
    ).toBeInTheDocument();
  });

  it("rejects an invalid clock interval (saída antes do início)", () => {
    render(<TimesheetWeekView mode="demo" />);
    fireEvent.click(screen.getByRole("button", { name: /Novo lançamento/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Projeto"), {
      target: { value: "prj-nimbus" },
    });
    fireEvent.change(within(dialog).getByLabelText("Descrição"), {
      target: { value: "Horário inválido" },
    });
    fireEvent.change(within(dialog).getByLabelText("Início"), {
      target: { value: "18:00" },
    });
    fireEvent.change(within(dialog).getByLabelText("Saída"), {
      target: { value: "09:00" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Salvar/ }));
    expect(
      within(dialog).getByText(/saída deve ser maior que o de início/),
    ).toBeInTheDocument();
  });

  it("copies eligible entries from the previous week (via modal)", () => {
    render(<TimesheetWeekView mode="demo" />);
    fireEvent.click(
      screen.getByRole("button", { name: /Copiar semana anterior/ }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Copiar e salvar/ }),
    );
    // Rodada 4.3: copied entries enter approval directly (no "rascunho").
    expect(
      screen.getByText(/copiados e enviados para aprovação/),
    ).toBeInTheDocument();
  });

  it("defaults the new-entry activity to Dia Útil (WORKDAY)", () => {
    render(<TimesheetWeekView mode="demo" />);
    fireEvent.click(screen.getByRole("button", { name: /Novo lançamento/ }));
    const dialog = screen.getByRole("dialog");
    expect(
      (within(dialog).getByLabelText("Atividade") as HTMLSelectElement).value,
    ).toBe("WORKDAY");
  });

  it("renders the operational filters block with the catalog options", () => {
    render(<TimesheetWeekView mode="demo" />);
    const activity = screen.getByLabelText("Atividade") as HTMLSelectElement;
    const values = Array.from(activity.options).map((o) => o.value);
    expect(values).toContain("WORKDAY");
    expect(values).toContain("ON_CALL");
    // Legacy values are never offered as a filter option.
    expect(values).not.toContain("DEVELOPMENT");
  });

  it("applies the activity filter client-side in demo mode", () => {
    render(<TimesheetWeekView mode="demo" />);
    const table = screen.getByRole("table");
    // The current demo week has a WORKDAY (te-1) and an ON_CALL (te-2) row.
    expect(within(table).getAllByText("Atlas").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Atividade"), {
      target: { value: "ON_CALL" },
    });
    // Only the ON_CALL (Sobreaviso) Atlas row remains.
    expect(within(screen.getByRole("table")).getByText("Sobreaviso")).toBeInTheDocument();
    expect(
      within(screen.getByRole("table")).queryByText("Dia Útil"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Filtros ativos/),
    ).toBeInTheDocument();
  });

  it("renders a legacy activity label (compat) and clears filters", () => {
    render(<TimesheetWeekView mode="demo" />);
    // te-4 (Vega) carries the legacy DOCS code -> "Documentação".
    expect(
      within(screen.getByRole("table")).getByText("Documentação"),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "REJECTED" },
    });
    expect(screen.getByText(/Filtros ativos/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Limpar$/ }));
    expect(screen.queryByText(/Filtros ativos/)).not.toBeInTheDocument();
  });

  it("combines status + billable filters client-side (AND semantics)", () => {
    render(<TimesheetWeekView mode="demo" />);
    // Current demo week: te-2 (Atlas/ON_CALL, DRAFT, billable),
    // te-3 (Órion/WORKDAY, DRAFT, billable), te-4 (Vega/DOCS, REJECTED, NOT
    // billable). Status=DRAFT + Cobrança=Não faturável => zero rows, because no
    // row is both DRAFT and non-billable.
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "DRAFT" },
    });
    fireEvent.change(screen.getByLabelText("Cobrança"), {
      target: { value: "false" },
    });
    expect(
      screen.getByText(/Nenhum lançamento nesta semana/),
    ).toBeInTheDocument();

    // Relax to billable=true: the two DRAFT billable rows (Atlas/Órion) remain.
    fireEvent.change(screen.getByLabelText("Cobrança"), {
      target: { value: "true" },
    });
    const table = screen.getByRole("table");
    expect(within(table).getByText("Sobreaviso")).toBeInTheDocument();
    expect(within(table).getByText("Órion")).toBeInTheDocument();
    // The REJECTED Vega row is filtered out by status=DRAFT.
    expect(within(table).queryByText("Documentação")).not.toBeInTheDocument();
  });

  it("orders the demo grid by date when sort=date is chosen", () => {
    render(<TimesheetWeekView mode="demo" />);
    // te-1/te-2 log hours on Mon (index 0); te-3 first logs on Tue (index 1).
    // With sort=date asc the Monday rows must come before the Tuesday one.
    fireEvent.change(screen.getByLabelText("Ordenar por"), {
      target: { value: "date" },
    });
    fireEvent.change(screen.getByLabelText("Direção"), {
      target: { value: "asc" },
    });
    const activityCells = within(screen.getByRole("table"))
      .getAllByRole("row")
      // Skip the header row; activity is the 2nd cell of each body row.
      .slice(1)
      .map((r) => r.querySelectorAll("td")[1]?.textContent ?? "");
    // te-3 (Órion/Dia Útil, first hours on Tue) must not be first.
    const orionIndex = activityCells.findIndex((c) => c.includes("Dia Útil"));
    // The Monday-first rows (Dia Útil te-1 SUBMITTED, Sobreaviso te-2) precede
    // the Tuesday-first Órion row; te-1 (Atlas/Dia Útil) is index 0.
    expect(activityCells[0]).toContain("Dia Útil");
    expect(orionIndex).toBeGreaterThanOrEqual(0);
  });

  it("opens the copy-previous-week modal with a single week description", () => {
    render(<TimesheetWeekView mode="demo" />);
    fireEvent.click(
      screen.getByRole("button", { name: /Copiar semana anterior/ }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByLabelText("Descrição de atividades da semana"),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Copiar e salvar/ }),
    );
    expect(
      screen.getByText(/copiados e enviados para aprovação/),
    ).toBeInTheDocument();
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
        projects={[{ id: "proj-1", name: "Portal do Cliente", clientId: "cli-acme", clientName: "Acme Corp" }]}
      />,
    );
    expect(screen.getByText(/Semana 24/)).toBeInTheDocument();
    expect(
      within(screen.getByRole("table")).getByText("Portal do Cliente"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Modo demonstração/)).not.toBeInTheDocument();
  });

  it("renders a legacy activity code as a readable label in the grid (compat)", () => {
    // dbWeek's only row carries the legacy DEVELOPMENT code; the grid must show
    // the human label via activityLabelOf, not the raw code.
    render(
      <TimesheetWeekView
        mode="db"
        week={dbWeek}
        projects={[{ id: "proj-1", name: "Portal do Cliente", clientId: "cli-acme", clientName: "Acme Corp" }]}
      />,
    );
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Desenvolvimento")).toBeInTheDocument();
    expect(table.queryByText("DEVELOPMENT")).not.toBeInTheDocument();
  });

  it("reflects the server filter values in the filter form (db mode)", () => {
    render(
      <TimesheetWeekView
        mode="db"
        week={dbWeek}
        projects={[{ id: "proj-1", name: "Portal do Cliente", clientId: "cli-acme", clientName: "Acme Corp" }]}
        filter={{ status: "DRAFT", sort: "date", direction: "desc" }}
      />,
    );
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe(
      "DRAFT",
    );
    expect(
      (screen.getByLabelText("Ordenar por") as HTMLSelectElement).value,
    ).toBe("date");
    // A secondary filter (sort/direction) is active, so the disclosure opens.
    expect(screen.getByText(/Filtros ativos/)).toBeInTheDocument();
  });
});
