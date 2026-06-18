import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProjectItem } from "@/lib/projects/types";
import { CommercialView } from "./CommercialView";

vi.mock("@/app/app/projetos/actions", () => ({
  createSaleRate: vi.fn(),
  updateSaleRate: vi.fn(),
  updateProjectCommercial: vi.fn(),
}));

function projectWithAllocation(): ProjectItem {
  return {
    id: "prj-1",
    clientId: "cli-1",
    clientName: "Cliente Um",
    name: "Atlas",
    status: "ACTIVE",
    startDate: "2026-01-01",
    consumedHours: 0,
    allocatedConsultants: 1,
    allocations: [
      {
        id: "alloc-1",
        projectId: "prj-1",
        consultantId: "con-1",
        consultantName: "Ana Tester",
        role: "QA Senior",
        allocationPercent: 100,
        startDate: "2026-01-01",
        status: "ACTIVE",
        skills: [],
      },
    ],
    saleRates: [],
    hasActiveSaleRate: false,
    hasBillingConfig: false,
  };
}

describe("CommercialView", () => {
  it("lists allocated consultants as priceable rows with no value yet", () => {
    render(
      <CommercialView
        mode="demo"
        projects={[projectWithAllocation()]}
        consultants={[{ id: "con-1", name: "Ana Tester" }]}
        billingTypes={[]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Precificar/ }));
    const dialog = screen.getByRole("dialog");
    // The consultant linked in Operação shows up automatically in the single
    // "Valores de venda" table...
    expect(within(dialog).getByText(/Ana Tester - QA Senior/)).toBeInTheDocument();
    // ...with no sale value yet, ready for Comercial to define it.
    expect(within(dialog).getByText("Sem valor")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /Definir valor de Ana Tester/ }),
    ).toBeInTheDocument();
    // No separate redundant section.
    expect(
      within(dialog).queryByText("Consultores do projeto"),
    ).not.toBeInTheDocument();
  });

  it("counts active projects without a sale value in the pending queue", () => {
    render(
      <CommercialView
        mode="demo"
        projects={[projectWithAllocation()]}
        consultants={[{ id: "con-1", name: "Ana Tester" }]}
        billingTypes={[]}
      />,
    );
    expect(
      screen.getByText(/aguardando precificação/),
    ).toBeInTheDocument();
  });
});
