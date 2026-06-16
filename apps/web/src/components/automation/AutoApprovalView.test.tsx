import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { AutoApprovalOverview } from "@/lib/db/automation";
import type { RunSummary } from "@/app/app/automacoes/aprovacao-automatica/actions";
import { AutoApprovalView } from "./AutoApprovalView";

/**
 * jsdom tests for the auto-approval admin screen. The server actions are mocked
 * so the component tree stays free of server-only imports; we assert what the
 * admin actually sees (status, KPIs, the three tables) and how "Executar agora"
 * + the exception toggle report through the polite live region.
 *
 * Project gotcha: post-action assertions are scoped to the FeedbackBanner live
 * region, never the whole document.
 */

const h = vi.hoisted(() => ({
  runResult: { ok: true, data: {} as RunSummary } as
    | { ok: true; data: RunSummary }
    | { ok: false; error: string; message: string },
  toggleResult: { ok: true, data: { id: "x1", active: false } } as
    | { ok: true; data: { id: string; active: boolean } }
    | { ok: false; error: string; message: string },
}));

const runAutoApprovalNow = vi.fn(async () => h.runResult);
const setExceptionActive = vi.fn(
  async (input: { exceptionId: string; active: boolean }) => {
    void input;
    return h.toggleResult;
  },
);
const createAutoApprovalException = vi.fn(async (input: unknown) => {
  void input;
  return { ok: true as const, data: { id: "new-exc" } };
});

vi.mock("@/app/app/automacoes/aprovacao-automatica/actions", () => ({
  runAutoApprovalNow: () => runAutoApprovalNow(),
  setExceptionActive: (input: { exceptionId: string; active: boolean }) =>
    setExceptionActive(input),
  createAutoApprovalException: (input: unknown) =>
    createAutoApprovalException(input),
}));

function overview(over: Partial<AutoApprovalOverview> = {}): AutoApprovalOverview {
  return {
    config: {
      autoApprovalEnabled: true,
      requiredDailyMinutes: 480,
      approvalDelayMinutes: 5,
    },
    activeExceptionsCount: 1,
    exceptions: [
      {
        id: "x1",
        consultantName: "Ana Martins",
        projectName: "Apollo",
        type: "ANY_HOURS",
        active: true,
      },
    ],
    recentAutoApprovals: [
      {
        entityId: "e1",
        ruleKey: "DEFAULT",
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
    consultantOptions: [{ id: "con-1", name: "Ana Martins" }],
    projectOptions: [{ id: "proj-1", name: "Apollo", clientName: "Acme" }],
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
  setExceptionActive.mockClear();
  createAutoApprovalException.mockClear();
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
  h.toggleResult = { ok: true, data: { id: "x1", active: false } };
});

describe("AutoApprovalView — status and KPIs", () => {
  it("shows the enabled status with the success color", () => {
    render(<AutoApprovalView overview={overview()} />);
    // Scope to the status KPI card: the exceptions table also renders "Ativa".
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

  it("renders the config KPIs (required hours, delay, exceptions)", () => {
    render(<AutoApprovalView overview={overview()} />);
    // 480 min -> 8h required daily total.
    expect(screen.getByText("8h")).toBeInTheDocument();
    expect(screen.getByText("5 min")).toBeInTheDocument();
    // Active exceptions count.
    const exceptionsKpi = screen
      .getByText("Exceções ativas")
      .closest("div") as HTMLElement;
    expect(within(exceptionsKpi).getByText("1")).toBeInTheDocument();
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
    expect(screen.getByText("DEFAULT")).toBeInTheDocument();
  });

  it("lists exceptions with the readable type label and a toggle", () => {
    render(<AutoApprovalView overview={overview()} />);
    expect(screen.getByText("Qualquer carga horária")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Desativar exceção de Ana Martins/ }),
    ).toBeInTheDocument();
  });

  it("renders empty states when there is nothing to show", () => {
    render(
      <AutoApprovalView
        overview={overview({
          activeExceptionsCount: 0,
          exceptions: [],
          recentAutoApprovals: [],
          pending: [],
        })}
      />,
    );
    expect(
      screen.getByText("Nenhum lançamento pendente"),
    ).toBeInTheDocument();
    expect(screen.getByText("Nenhuma exceção cadastrada")).toBeInTheDocument();
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
    // Scope the assertion to the live region (project gotcha).
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
    // It must NOT pretend anything was approved.
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

describe("AutoApprovalView — exception toggle", () => {
  it("calls setExceptionActive with the flipped flag and confirms", async () => {
    render(<AutoApprovalView overview={overview()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Desativar exceção de Ana Martins/ }),
    );

    await waitFor(() =>
      expect(setExceptionActive).toHaveBeenCalledWith({
        exceptionId: "x1",
        active: false,
      }),
    );
    await waitFor(() =>
      expect(liveRegion()).toHaveTextContent("Exceção desativada."),
    );
  });

  it("confirms reactivation for an inactive exception", async () => {
    h.toggleResult = { ok: true, data: { id: "x9", active: true } };
    render(
      <AutoApprovalView
        overview={overview({
          activeExceptionsCount: 0,
          exceptions: [
            {
              id: "x9",
              consultantName: "Ana Martins",
              projectName: "Apollo",
              type: "WEEKEND",
              active: false,
            },
          ],
        })}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Reativar exceção de Ana Martins/ }),
    );

    await waitFor(() =>
      expect(setExceptionActive).toHaveBeenCalledWith({
        exceptionId: "x9",
        active: true,
      }),
    );
    await waitFor(() =>
      expect(liveRegion()).toHaveTextContent("Exceção reativada."),
    );
  });
});

describe("AutoApprovalView — create exception", () => {
  it("registers a new exception through the modal", async () => {
    render(<AutoApprovalView overview={overview()} />);
    fireEvent.click(screen.getByRole("button", { name: /Nova exceção/ }));

    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Consultor"), {
      target: { value: "con-1" },
    });
    fireEvent.change(within(dialog).getByLabelText("Projeto"), {
      target: { value: "proj-1" },
    });
    fireEvent.change(within(dialog).getByLabelText("Tipo de exceção"), {
      target: { value: "WEEKEND" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Cadastrar/ }));

    await waitFor(() =>
      expect(createAutoApprovalException).toHaveBeenCalledWith({
        consultantId: "con-1",
        projectId: "proj-1",
        type: "WEEKEND",
        note: undefined,
      }),
    );
    await waitFor(() =>
      expect(liveRegion()).toHaveTextContent("Exceção cadastrada."),
    );
  });
});
