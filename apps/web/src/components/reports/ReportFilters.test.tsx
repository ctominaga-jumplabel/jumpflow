import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReportFilterOptions } from "@/lib/db/reports";
import { ReportFilters } from "./ReportFilters";

const options: ReportFilterOptions = {
  clients: [
    { id: "client-a", name: "Cliente A" },
    { id: "client-b", name: "Cliente B" },
  ],
  projects: [
    { id: "proj-a", name: "Projeto A", clientId: "client-a" },
    { id: "proj-b", name: "Projeto B", clientId: "client-b" },
  ],
  // > 1 consultant so the Consultor field renders.
  consultants: [
    { id: "cons-a", name: "Consultor A" },
    { id: "cons-b", name: "Consultor B" },
  ],
};

/** The <details> element wrapping the advanced filters. */
function advancedDetails(): HTMLDetailsElement {
  const summary = screen.getByText("Filtros avançados");
  const details = summary.closest("details");
  if (!details) throw new Error("advanced <details> not found");
  return details as HTMLDetailsElement;
}

describe("ReportFilters — reflects the query string (hours tab)", () => {
  it("renders basic + advanced field values from `values`", () => {
    render(
      <ReportFilters
        tab="horas"
        options={options}
        values={{
          period: "mes-atual",
          from: "2026-06-01",
          to: "2026-06-30",
          clientId: "client-b",
          projectId: "proj-b",
          consultantId: "cons-b",
          status: "APPROVED",
          activityType: "ON_CALL",
          // advanced:
          clientStatus: "INACTIVE",
          projectStatus: "PAUSED",
          consultantStatus: "ON_LEAVE",
          billable: "false",
          sort: "hours",
          direction: "desc",
          pageSize: "100",
        }}
      />,
    );

    expect((screen.getByLabelText("Período") as HTMLSelectElement).value).toBe(
      "mes-atual",
    );
    expect((screen.getByLabelText("De") as HTMLInputElement).value).toBe(
      "2026-06-01",
    );
    expect((screen.getByLabelText("Até") as HTMLInputElement).value).toBe(
      "2026-06-30",
    );
    expect((screen.getByLabelText("Cliente") as HTMLSelectElement).value).toBe(
      "client-b",
    );
    expect((screen.getByLabelText("Projeto") as HTMLSelectElement).value).toBe(
      "proj-b",
    );
    expect(
      (screen.getByLabelText("Consultor") as HTMLSelectElement).value,
    ).toBe("cons-b");
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe(
      "APPROVED",
    );
    expect(
      (screen.getByLabelText("Atividade") as HTMLSelectElement).value,
    ).toBe("ON_CALL");

    // Advanced fields.
    expect(
      (screen.getByLabelText("Status do cliente") as HTMLSelectElement).value,
    ).toBe("INACTIVE");
    expect(
      (screen.getByLabelText("Status do projeto") as HTMLSelectElement).value,
    ).toBe("PAUSED");
    expect(
      (screen.getByLabelText("Status do consultor") as HTMLSelectElement)
        .value,
    ).toBe("ON_LEAVE");
    expect(
      (screen.getByLabelText("Faturável") as HTMLSelectElement).value,
    ).toBe("false");
    expect(
      (screen.getByLabelText("Ordenar por") as HTMLSelectElement).value,
    ).toBe("hours");
    expect((screen.getByLabelText("Direção") as HTMLSelectElement).value).toBe(
      "desc",
    );
    expect(
      (screen.getByLabelText("Itens por página") as HTMLSelectElement).value,
    ).toBe("100");
  });

  it("opens the advanced disclosure when an advanced filter is active", () => {
    render(
      <ReportFilters
        tab="horas"
        options={options}
        values={{ clientStatus: "ACTIVE" }}
      />,
    );
    expect(advancedDetails().open).toBe(true);
  });

  it("opens the disclosure for an advanced sort/pageSize/billable filter", () => {
    const cases: Record<string, string>[] = [
      { sort: "hours" },
      { pageSize: "25" },
      { billable: "true" },
      { direction: "desc" },
    ];
    for (const values of cases) {
      const { unmount } = render(
        <ReportFilters tab="horas" options={options} values={values} />,
      );
      expect(advancedDetails().open).toBe(true);
      unmount();
    }
  });

  it("keeps the disclosure CLOSED when only basic filters are active", () => {
    render(
      <ReportFilters
        tab="horas"
        options={options}
        values={{
          period: "mes-atual",
          clientId: "client-a",
          status: "APPROVED",
          activityType: "ON_CALL",
        }}
      />,
    );
    expect(advancedDetails().open).toBe(false);
  });

  it("keeps the disclosure CLOSED when there are no filters at all", () => {
    render(<ReportFilters tab="horas" options={options} values={{}} />);
    expect(advancedDetails().open).toBe(false);
  });

  it("treats an advanced param of `ALL` as absent (disclosure stays closed)", () => {
    render(
      <ReportFilters
        tab="horas"
        options={options}
        values={{ clientStatus: "ALL", projectStatus: "ALL" }}
      />,
    );
    expect(advancedDetails().open).toBe(false);
  });

  it("carries the active tab in a hidden field and posts via GET", () => {
    const { container } = render(
      <ReportFilters tab="horas" options={options} values={{}} />,
    );
    const form = container.querySelector("form");
    expect(form?.getAttribute("method")).toBe("get");
    expect(form?.getAttribute("action")).toBe("/app/relatorios");
    const tabInput = container.querySelector<HTMLInputElement>(
      'input[type="hidden"][name="tab"]',
    );
    expect(tabInput?.value).toBe("horas");
  });
});

describe("ReportFilters — tab-specific fields", () => {
  it("renders the expenses sort options (amount) and stage field", () => {
    render(
      <ReportFilters
        tab="despesas"
        options={options}
        values={{ sort: "amount", stage: "FINANCEIRO" }}
      />,
    );
    const sort = screen.getByLabelText("Ordenar por") as HTMLSelectElement;
    expect(sort.value).toBe("amount");
    const optionTexts = within(sort)
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);
    expect(optionTexts).toContain("amount");
    expect(optionTexts).not.toContain("hours");

    expect((screen.getByLabelText("Etapa") as HTMLSelectElement).value).toBe(
      "FINANCEIRO",
    );
    // The expenses tab has no "Faturável" field.
    expect(screen.queryByLabelText("Faturável")).not.toBeInTheDocument();
  });

  it("renders the consolidated month field and hides sort/pagination/period", () => {
    render(
      <ReportFilters
        tab="consolidado"
        options={options}
        values={{ month: "2026-06" }}
      />,
    );
    expect(
      (screen.getByLabelText("Mês (aaaa-mm)") as HTMLInputElement).value,
    ).toBe("2026-06");
    expect(screen.queryByLabelText("Período")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Ordenar por")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Itens por página"),
    ).not.toBeInTheDocument();
  });

  it("hides the Consultor field when only one consultant is in scope", () => {
    render(
      <ReportFilters
        tab="horas"
        options={{ ...options, consultants: [{ id: "me", name: "Eu" }] }}
        values={{}}
      />,
    );
    expect(screen.queryByLabelText("Consultor")).not.toBeInTheDocument();
  });
});
