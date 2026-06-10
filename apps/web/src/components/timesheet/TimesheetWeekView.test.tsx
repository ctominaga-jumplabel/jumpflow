import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { TimesheetWeekView } from "./TimesheetWeekView";

describe("TimesheetWeekView actions", () => {
  it("renders the current week and prepared actions", () => {
    render(<TimesheetWeekView />);
    expect(screen.getByText(/Semana 24/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Enviar para aprovação/ }),
    ).toBeInTheDocument();
  });

  it("navigates to the next week", () => {
    render(<TimesheetWeekView />);
    fireEvent.click(screen.getByRole("button", { name: /Próxima semana/ }));
    expect(screen.getByText(/Semana 25/)).toBeInTheDocument();
    expect(
      screen.getByText(/Nenhum lançamento nesta semana/),
    ).toBeInTheDocument();
  });

  it("reports feedback at the navigation boundary", () => {
    render(<TimesheetWeekView />);
    // From the current week (index 1) two steps back hits the boundary.
    fireEvent.click(screen.getByRole("button", { name: /Semana anterior/ }));
    fireEvent.click(screen.getByRole("button", { name: /Semana anterior/ }));
    expect(screen.getByText(/Não há mais semanas/)).toBeInTheDocument();
  });

  it("adds a new draft entry through the modal", () => {
    render(<TimesheetWeekView />);
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
    render(<TimesheetWeekView />);
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
    render(<TimesheetWeekView />);
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
    render(<TimesheetWeekView />);
    fireEvent.click(
      screen.getByRole("button", { name: /Enviar para aprovação/ }),
    );
    expect(screen.getByText(/enviado\(s\) para aprovação/)).toBeInTheDocument();
  });

  it("copies eligible entries from the previous week", () => {
    render(<TimesheetWeekView />);
    fireEvent.click(
      screen.getByRole("button", { name: /Copiar semana anterior/ }),
    );
    expect(screen.getByText(/copiados como rascunho/)).toBeInTheDocument();
  });
});
