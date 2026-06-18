import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AutoApprovalOverview } from "@/lib/db/automation";
import type { RunSummary } from "@/app/app/automacoes/aprovacao-automatica/actions";
import { AutoApprovalView } from "./AutoApprovalView";

/**
 * jsdom tests for the auto-approval admin screen. The rule configuration moved
 * to the project screen, so this screen is observability-only: status/KPIs, the
 * pending + recent tables, and the single "Executar agora" mutation. The action
 * is mocked so the tree stays free of server-only imports.
 *
 * Project gotcha: post-action assertions are scoped to the FeedbackBanner live
 * region, never the whole document.
 */

const h = vi.hoisted(() => ({
  runResult: { ok: true, data: {} as RunSummary } as
    | { ok: true; data: RunSummary }
    | { ok: false; error: string; message: string },
}));

const runAutoApprovalNow = vi.fn(async () => h.runResult);

vi.mock("@/app/app/automacoes/aprovacao-automatica/actions", () => ({
  runAutoApprovalNow: () => runAutoApprovalNow(),
}));

// Stubbed: the rule panel pulls in server actions (next-auth/Prisma) not needed
// for the dashboard tests; the central hub is exercised via the project screen.
vi.mock("@/components/projects/shared/AutoApprovalConfigPanel", () => ({
  AutoApprovalConfigPanel: () => null,
}));

function overview(over: Partial<AutoApprovalOverview> = {}): AutoApprovalOverview {
  return {
    config: {
      autoApprovalEnabled: true,
      requiredDailyMinutes: 480,
      approvalDelayMinutes: 5,
    },
    projectRuleCount: 2,
    consultantRuleCount: 3,
    recentAutoApprovals: [
      {
        entityId: "e1",
        ruleKey: "RULE_RANGE",
        createdAt: new Date("2026-06-10T12:00:00Z"),
        consultantName: "Bruno Costa",
        projectName: "Beta",
      },
    ],
    pending: [
      {
        entryId: "p1",
        consultantName: "Carla Dias",
        projectName: "Gamma",
        date: new Date("2026-06-09T00:00:00Z"),
        hours: 6,
        activity: "Dia Útil",
        reasons: ["Aguardando intervalo mínimo após o envio"],
      },
    ],
    ...over,
  };
}

/** The FeedbackBanner is the only aria-live="polite" region in the view. */
function liveRegion(): HTMLElement {
  const region = document.querySelector('[aria-live="polite"]');
  if (!region) throw new Error("live region not found");
  return region as HTMLElement;
}

beforeEach(() => {
  runAutoApprovalNow.mockClear();
  h.runResult = {
    ok: true,
    data: {
      processed: 4,
      approved: 3,
      pending: 1,
      raced: 0,
      skipped: false,
    },
  };
});

describe("AutoApprovalView — status and KPIs", () => {
  it("shows the enabled status with the success color", () => {
    render(<AutoApprovalView overview={overview()} />);
    const kpi = screen
      .getByText("Aprovação automática")
      .closest("div") as HTMLElement;
    const active = within(kpi).getByText("Ativa");
    expect(active).toHaveClass("text-success");
    expect(screen.getByText("Motor habilitado")).toBeInTheDocument();
  });

  it("shows the disabled status with the warning color", () => {
    render(
      <AutoApprovalView
        overview={overview({
          config: {
            autoApprovalEnabled: false,
            requiredDailyMinutes: 480,
            approvalDelayMinutes: 5,
          },
        })}
      />,
    );
    const kpi = screen
      .getByText("Aprovação automática")
      .closest("div") as HTMLElement;
    const off = within(kpi).getByText("Desativada");
    expect(off).toHaveClass("text-warning");
    expect(screen.getByText("Motor pausado")).toBeInTheDocument();
  });

  it("renders the config KPIs (delay + rule counts)", () => {
    render(<AutoApprovalView overview={overview()} />);
    expect(screen.getByText("5 min")).toBeInTheDocument();
    const projectKpi = screen
      .getByText("Projetos com regra")
      .closest("div") as HTMLElement;
    expect(within(projectKpi).getByText("2")).toBeInTheDocument();
    const consultantKpi = screen
      .getByText("Regras por consultor")
      .closest("div") as HTMLElement;
    expect(within(consultantKpi).getByText("3")).toBeInTheDocument();
  });
});

describe("AutoApprovalView — regras cadastradas", () => {
  // Minimal ProjectItem shapes: buildRuleRows only reads name + the two rule
  // fields, so we cast loose fixtures instead of full ProjectItem objects.
  const projects = [
    {
      id: "proj-1",
      name: "Apollo",
      clientName: "Acme",
      autoApprovalRule: {
        weekendEnabled: true,
        hoursRangeEnabled: true,
        minMinutes: 1,
        maxMinutes: 540,
      },
      autoApprovalConsultantRules: [],
      allocations: [],
    },
    {
      id: "proj-2",
      name: "Beta",
      clientName: "Globex",
      autoApprovalRule: undefined,
      autoApprovalConsultantRules: [
        {
          id: "car-1",
          consultantId: "c1",
          consultantName: "Diana Souza",
          weekendEnabled: false,
          hoursRangeEnabled: true,
          minMinutes: 480,
          maxMinutes: 480,
        },
      ],
      allocations: [],
    },
  ] as unknown as Parameters<typeof AutoApprovalView>[0]["projects"];

  it("lists project-level and per-consultant rules with weekend + range summary", () => {
    render(<AutoApprovalView overview={overview()} projects={projects} />);
    // Project rule row: scope "Projeto (todos)", range 00:01 – 09:00.
    expect(screen.getByText("Projeto (todos)")).toBeInTheDocument();
    expect(screen.getByText("00:01 – 09:00")).toBeInTheDocument();
    // Per-consultant row: scope is the consultant, min==max → exact 08:00.
    expect(screen.getByText("Diana Souza")).toBeInTheDocument();
    expect(screen.getByText("08:00 – 08:00")).toBeInTheDocument();
  });

  it("shows an empty state when no project has a rule", () => {
    render(<AutoApprovalView overview={overview()} projects={[]} />);
    expect(screen.getByText("Nenhuma regra cadastrada")).toBeInTheDocument();
  });
});

describe("AutoApprovalView — tables", () => {
  it("lists pending entries with their pt-BR estimated reason", () => {
    render(<AutoApprovalView overview={overview()} />);
    expect(screen.getByText("Carla Dias")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
    expect(
      screen.getByText("Aguardando intervalo mínimo após o envio"),
    ).toBeInTheDocument();
  });

  it("lists the latest automatic approvals with the applied rule", () => {
    render(<AutoApprovalView overview={overview()} />);
    expect(screen.getByText("Bruno Costa")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("RULE_RANGE")).toBeInTheDocument();
  });

  it("renders empty states when there is nothing to show", () => {
    render(
      <AutoApprovalView
        overview={overview({ recentAutoApprovals: [], pending: [] })}
      />,
    );
    expect(screen.getByText("Nenhum lançamento pendente")).toBeInTheDocument();
    expect(
      screen.getByText("Nenhuma aprovação automática ainda"),
    ).toBeInTheDocument();
  });
});

describe("AutoApprovalView — Executar agora", () => {
  it("calls the action and reports the run summary in the live region", async () => {
    render(<AutoApprovalView overview={overview()} />);
    fireEvent.click(screen.getByRole("button", { name: /Executar agora/ }));

    await waitFor(() => expect(runAutoApprovalNow).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(liveRegion()).toHaveTextContent(
        "4 processados, 3 aprovados, 1 pendentes.",
      ),
    );
  });

  it("appends the raced count to the summary when present", async () => {
    h.runResult = {
      ok: true,
      data: { processed: 5, approved: 2, pending: 1, raced: 2, skipped: false },
    };
    render(<AutoApprovalView overview={overview()} />);
    fireEvent.click(screen.getByRole("button", { name: /Executar agora/ }));

    await waitFor(() =>
      expect(liveRegion()).toHaveTextContent("(2 em concorrência)"),
    );
  });

  it("reports a disabled engine honestly (info, no false success)", async () => {
    h.runResult = {
      ok: true,
      data: {
        processed: 0,
        approved: 0,
        pending: 0,
        raced: 0,
        skipped: true,
        reason: "disabled",
      },
    };
    render(<AutoApprovalView overview={overview()} />);
    fireEvent.click(screen.getByRole("button", { name: /Executar agora/ }));

    await waitFor(() =>
      expect(liveRegion()).toHaveTextContent(
        "Automação desativada — nada foi processado.",
      ),
    );
    expect(liveRegion()).not.toHaveTextContent("aprovados");
  });

  it("surfaces an action failure as a warning", async () => {
    h.runResult = {
      ok: false,
      error: "UNEXPECTED",
      message: "Falha ao executar a aprovação automática.",
    };
    render(<AutoApprovalView overview={overview()} />);
    fireEvent.click(screen.getByRole("button", { name: /Executar agora/ }));

    await waitFor(() =>
      expect(liveRegion()).toHaveTextContent(
        "Falha ao executar a aprovação automática.",
      ),
    );
  });
});
