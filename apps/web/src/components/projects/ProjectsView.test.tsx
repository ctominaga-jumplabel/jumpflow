import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProjectItem } from "@/lib/projects/types";
import { ProjectsView } from "./ProjectsView";

vi.mock("@/app/app/projetos/actions", () => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
  createAllocation: vi.fn(),
  updateAllocation: vi.fn(),
  createSaleRate: vi.fn(),
  updateSaleRate: vi.fn(),
  addAllocationSkill: vi.fn(),
  removeAllocationSkill: vi.fn(),
  updateAllocationSkill: vi.fn(),
}));

function dbProject(managerName: string): ProjectItem {
  return {
    id: "prj-1",
    clientId: "cli-1",
    clientName: "Cliente Um",
    name: "Atlas",
    status: "ACTIVE",
    managerUserId: "usr-1",
    managerName,
    startDate: "2026-01-01",
    consumedHours: 0,
    allocatedConsultants: 0,
    allocations: [],
    saleRates: [],
  };
}

function renderDemo(canViewCommercials = true) {
  return render(
    <ProjectsView
      mode="demo"
      canManageProjects
      canViewCommercials={canViewCommercials}
      canManageSaleRates={canViewCommercials}
    />,
  );
}

describe("ProjectsView", () => {
  it("renders projects and masks commercial fields when unauthorized", () => {
    renderDemo(false);
    expect(screen.getByText("Atlas")).toBeInTheDocument();
    expect(screen.getAllByText("•••").length).toBeGreaterThan(0);
    expect(screen.queryByText(/320,00/)).not.toBeInTheDocument();
  });

  it("creates a local project in demo mode", () => {
    renderDemo();
    fireEvent.click(screen.getByRole("button", { name: /Novo projeto/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Cliente"), {
      target: { value: "cli-nova" },
    });
    fireEvent.change(within(dialog).getByLabelText("Nome"), {
      target: { value: "Portal Parceiros" },
    });
    fireEvent.change(within(dialog).getByLabelText("Inicio"), {
      target: { value: "2026-08-01" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(screen.getByText("Portal Parceiros")).toBeInTheDocument();
    expect(screen.getByText("Projeto salvo localmente.")).toBeInTheDocument();
  }, 10_000);

  it("adds a local sale rate in the project detail", () => {
    renderDemo();
    fireEvent.click(
      screen.getByRole("button", { name: /Vínculos e valores de Atlas/ }),
    );
    let detail = screen.getByRole("dialog");
    fireEvent.click(within(detail).getByRole("button", { name: "Valores de venda" }));
    fireEvent.click(within(detail).getByRole("button", { name: /Novo valor/ }));
    const dialogs = screen.getAllByRole("dialog");
    const rateDialog = dialogs[dialogs.length - 1];
    fireEvent.change(within(rateDialog).getByLabelText("Valor hora"), {
      target: { value: "410" },
    });
    fireEvent.click(within(rateDialog).getByRole("button", { name: "Salvar" }));
    detail = screen.getByRole("dialog");
    expect(within(detail).getByText(/410,00/)).toBeInTheDocument();
    expect(screen.getByText("Valor de venda salvo localmente.")).toBeInTheDocument();
  });

  it("adds a skill to an allocation in the project detail (demo mode)", () => {
    renderDemo();
    fireEvent.click(
      screen.getByRole("button", { name: /Vínculos e valores de Atlas/ }),
    );
    let detail = screen.getByRole("dialog");
    fireEvent.click(within(detail).getByRole("button", { name: "Skills" }));
    // The seeded Atlas allocation (Ana Tester) already carries one skill tag.
    detail = screen.getByRole("dialog");
    expect(within(detail).getByText("QA Automation")).toBeInTheDocument();
    fireEvent.click(
      within(detail).getByRole("button", { name: /Adicionar skill/ }),
    );
    const dialogs = screen.getAllByRole("dialog");
    const skillDialog = dialogs[dialogs.length - 1];
    fireEvent.change(within(skillDialog).getByLabelText("Skill"), {
      target: { value: "skill-react" },
    });
    fireEvent.change(within(skillDialog).getByLabelText("Nivel"), {
      target: { value: "ADVANCED" },
    });
    fireEvent.click(within(skillDialog).getByRole("button", { name: "Salvar" }));
    detail = screen.getByRole("dialog");
    expect(within(detail).getByText("React")).toBeInTheDocument();
    expect(
      screen.getByText("Skill da alocação salva localmente."),
    ).toBeInTheDocument();
  });

  it("re-syncs the table when revalidated props change in db mode", () => {
    const { rerender } = render(
      <ProjectsView
        mode="db"
        projects={[dbProject("Ana Martins")]}
        canManageProjects
        canViewCommercials
        canManageSaleRates
      />,
    );
    expect(screen.getByText("Ana Martins")).toBeInTheDocument();

    // Simulate revalidatePath: the page re-renders with fresh server data.
    rerender(
      <ProjectsView
        mode="db"
        projects={[dbProject("Christopher Tominaga")]}
        canManageProjects
        canViewCommercials
        canManageSaleRates
      />,
    );
    expect(screen.getByText("Christopher Tominaga")).toBeInTheDocument();
    expect(screen.queryByText("Ana Martins")).not.toBeInTheDocument();
  });
});
