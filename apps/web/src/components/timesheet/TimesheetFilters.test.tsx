import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TimesheetFilters } from "./TimesheetFilters";
import type { TimesheetFilter } from "@/lib/timesheet/filters";

/**
 * jsdom tests for the operational filters block (Rodada 4.2,
 * docs/horas-operacional-filtros.md section 4). The query string is the source
 * of truth, so in db mode the controls are uncontrolled `defaultValue`s
 * submitted via a GET form; the secondary controls sit behind a disclosure that
 * must open when one of them is active.
 */

const projects = [
  { id: "proj-atlas", name: "Atlas", clientName: "Vix Energia" },
  { id: "proj-orion", name: "Órion", clientName: "Banco Sul" },
];

function renderDb(filter: TimesheetFilter, weekStart = "2026-06-08") {
  return render(
    <TimesheetFilters
      mode="db"
      weekStart={weekStart}
      filter={filter}
      projects={projects}
      onPickDate={vi.fn()}
    />,
  );
}

describe("TimesheetFilters (db mode) — query string reflection", () => {
  it("reflects every filter value in its field", () => {
    renderDb({
      status: "APPROVED",
      projectId: "proj-orion",
      projectStatus: "PAUSED",
      activity: "ON_CALL",
      billable: false,
      sort: "status",
      direction: "desc",
    });

    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe(
      "APPROVED",
    );
    expect((screen.getByLabelText("Projeto") as HTMLSelectElement).value).toBe(
      "proj-orion",
    );
    expect(
      (screen.getByLabelText("Status do projeto") as HTMLSelectElement).value,
    ).toBe("PAUSED");
    expect(
      (screen.getByLabelText("Atividade") as HTMLSelectElement).value,
    ).toBe("ON_CALL");
    expect(
      (screen.getByLabelText("Cobrança") as HTMLSelectElement).value,
    ).toBe("false");
    expect(
      (screen.getByLabelText("Ordenar por") as HTMLSelectElement).value,
    ).toBe("status");
    expect((screen.getByLabelText("Direção") as HTMLSelectElement).value).toBe(
      "desc",
    );
  });

  it("leaves fields at their empty default when no filter is set", () => {
    renderDb({});
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe(
      "",
    );
    expect((screen.getByLabelText("Atividade") as HTMLSelectElement).value).toBe(
      "",
    );
    expect(
      (screen.getByLabelText("Cobrança") as HTMLSelectElement).value,
    ).toBe("");
  });

  it("reflects billable=true as the Faturável option", () => {
    renderDb({ billable: true });
    expect(
      (screen.getByLabelText("Cobrança") as HTMLSelectElement).value,
    ).toBe("true");
  });
});

describe("TimesheetFilters — secondary disclosure", () => {
  // The <details> has no accessible name; query it directly via the DOM.
  function details(container: HTMLElement): HTMLDetailsElement {
    const el = container.querySelector("details");
    if (!el) throw new Error("expected a <details> disclosure");
    return el as HTMLDetailsElement;
  }

  it("stays closed when only essential filters are active", () => {
    const { container } = renderDb({ status: "DRAFT", projectId: "proj-atlas" });
    expect(details(container).open).toBe(false);
  });

  it("stays closed with no filters", () => {
    const { container } = renderDb({});
    expect(details(container).open).toBe(false);
  });

  it("opens when billable is active", () => {
    const { container } = renderDb({ billable: false });
    expect(details(container).open).toBe(true);
  });

  it("opens when sort is active", () => {
    const { container } = renderDb({ sort: "date" });
    expect(details(container).open).toBe(true);
  });

  it("opens when direction is active", () => {
    const { container } = renderDb({ direction: "desc" });
    expect(details(container).open).toBe(true);
  });
});

describe("TimesheetFilters (db mode) — form and clear", () => {
  it("submits via GET to /app/horas with the week as a hidden field", () => {
    const { container } = renderDb({ status: "DRAFT" }, "2026-06-08");
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(form?.getAttribute("method")).toBe("get");
    expect(form?.getAttribute("action")).toBe("/app/horas");
    const hidden = form?.querySelector(
      'input[type="hidden"][name="semana"]',
    ) as HTMLInputElement | null;
    expect(hidden?.value).toBe("2026-06-08");
  });

  it("points Clear at the current week with no other params", () => {
    renderDb({ status: "DRAFT", activity: "ON_CALL" }, "2026-06-08");
    const clear = screen.getByRole("link", { name: /^Limpar$/ });
    expect(clear).toHaveAttribute("href", "/app/horas?semana=2026-06-08");
  });

  it("shows the active-filters hint only when a reducing filter is set", () => {
    const { rerender } = renderDb({});
    expect(screen.queryByText(/Filtros aplicados/)).not.toBeInTheDocument();
    rerender(
      <TimesheetFilters
        mode="db"
        weekStart="2026-06-08"
        filter={{ status: "DRAFT" }}
        projects={projects}
        onPickDate={vi.fn()}
      />,
    );
    expect(screen.getByText(/Filtros aplicados/)).toBeInTheDocument();
  });
});

describe('TimesheetFilters — "Ir para data"', () => {
  it("renders the date input with an explanatory hint", () => {
    renderDb({});
    const input = screen.getByLabelText("Ir para data");
    expect(input).toHaveAttribute("type", "date");
    expect(input).toHaveAttribute("aria-describedby", "hf-date-hint");
    expect(
      screen.getByText(/Abre a semana que contém a data/),
    ).toBeInTheDocument();
  });

  it("calls onPickDate with the chosen ISO date", () => {
    const onPickDate = vi.fn();
    render(
      <TimesheetFilters
        mode="db"
        weekStart="2026-06-08"
        filter={{}}
        projects={projects}
        onPickDate={onPickDate}
      />,
    );
    fireEvent.change(screen.getByLabelText("Ir para data"), {
      target: { value: "2026-06-22" },
    });
    expect(onPickDate).toHaveBeenCalledWith("2026-06-22");
  });
});
