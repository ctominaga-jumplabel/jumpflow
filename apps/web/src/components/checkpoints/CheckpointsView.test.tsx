import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { CheckpointsView } from "./CheckpointsView";
import type { CheckpointViewModel } from "@/lib/db/checkpoint";
import type {
  CheckpointInsights,
  CheckpointOption,
} from "@/lib/checkpoint/types";
import type { CheckpointFlags } from "@/lib/checkpoint/flags";

/**
 * Checkpoint UI tests. The server actions are mocked so the suite is hermetic
 * (no DB, no Prisma). GOTCHA: motion's AnimatePresence keeps exiting/closed
 * nodes mounted in jsdom — scope post-action assertions to the result region
 * (the card / insights panel) instead of the whole document.
 */

const createCheckpoint = vi.fn();
const setVisibility = vi.fn();
const archiveCheckpoint = vi.fn();
const attachCheckpointAudio = vi.fn();
const transcribeCheckpoint = vi.fn();
const extractCheckpointInsights = vi.fn();
const decideOpportunity = vi.fn();
const decideCase = vi.fn();

vi.mock("@/app/app/checkpoints/actions", () => ({
  createCheckpoint: (...a: unknown[]) => createCheckpoint(...a),
  setVisibility: (...a: unknown[]) => setVisibility(...a),
  archiveCheckpoint: (...a: unknown[]) => archiveCheckpoint(...a),
  attachCheckpointAudio: (...a: unknown[]) => attachCheckpointAudio(...a),
  transcribeCheckpoint: (...a: unknown[]) => transcribeCheckpoint(...a),
  extractCheckpointInsights: (...a: unknown[]) => extractCheckpointInsights(...a),
  decideOpportunity: (...a: unknown[]) => decideOpportunity(...a),
  decideCase: (...a: unknown[]) => decideCase(...a),
}));

const flagsOff: CheckpointFlags = { enabled: true, voice: false, ai: false };
const flagsAi: CheckpointFlags = { enabled: true, voice: false, ai: true };
const flagsVoice: CheckpointFlags = { enabled: true, voice: true, ai: false };

function checkpoint(over: Partial<CheckpointViewModel> = {}): CheckpointViewModel {
  return {
    id: "cp1",
    consultantId: "con1",
    consultantName: "Ana Lima",
    managerUserId: "u1",
    managerName: "Bia Gestora",
    type: "ONE_ON_ONE",
    occurredAt: new Date("2026-06-20").toISOString(),
    weekStart: null,
    weekEnd: null,
    title: "Acompanhamento semanal",
    relatedProjectId: null,
    relatedProjectName: null,
    status: "RECORDED",
    visibility: "PRIVATE",
    extractionStatus: "NONE",
    transcriptionStatus: "NONE",
    createdAt: new Date("2026-06-20").toISOString(),
    canManage: true,
    canViewRaw: true,
    notes: "Conversamos sobre carreira.",
    transcription: null,
    ...over,
  };
}

const consultants: CheckpointOption[] = [{ id: "con1", name: "Ana Lima" }];
const projects: CheckpointOption[] = [{ id: "p1", name: "Projeto Alfa" }];

const insights: CheckpointInsights = {
  opportunities: [
    {
      id: "op1",
      kind: "EXPANSION",
      title: "Ampliar squad no cliente X",
      description: "Cliente sinalizou interesse em mais um time.",
      priority: "HIGH",
      sourceQuote: "Eles querem dobrar o time no próximo trimestre.",
      aiGenerated: true,
      status: "PENDING",
    },
  ],
  cases: [
    {
      id: "ca1",
      title: "Migração concluída sem downtime",
      summary: "Entrega de alto impacto.",
      outcome: "Zero incidentes.",
      sourceQuote: "Migramos tudo num fim de semana.",
      aiGenerated: true,
      status: "PENDING",
    },
  ],
};

function renderView(
  over: Partial<React.ComponentProps<typeof CheckpointsView>> = {},
) {
  return render(
    <CheckpointsView
      items={[checkpoint()]}
      insightsById={{ cp1: insights }}
      canRegister
      isManager
      consultants={consultants}
      projects={projects}
      flags={flagsAi}
      {...over}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CheckpointsView render", () => {
  it("renders the checkpoint with header, notes and visibility badge", () => {
    renderView({ flags: flagsOff });
    const card = screen.getByTestId("checkpoint-card");
    expect(within(card).getByText("Acompanhamento semanal")).toBeInTheDocument();
    expect(within(card).getByText("Ana Lima")).toBeInTheDocument();
    expect(
      within(card).getByText("Conversamos sobre carreira."),
    ).toBeInTheDocument();
    expect(within(card).getByText("Privado")).toBeInTheDocument();
  });

  it("renders the empty state when there are no checkpoints", () => {
    renderView({ items: [], insightsById: {} });
    expect(screen.getByText("Nenhum checkpoint no filtro")).toBeInTheDocument();
  });

  it("does not render raw notes for a viewer who cannot see the raw payload", () => {
    renderView({
      items: [checkpoint({ canViewRaw: false, notes: null })],
      insightsById: {},
      flags: flagsOff,
    });
    expect(
      screen.queryByText("Conversamos sobre carreira."),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Resumo compartilhado/)).toBeInTheDocument();
  });
});

describe("Composer gating", () => {
  it("shows the register action only when canRegister", () => {
    renderView({ canRegister: true, flags: flagsOff });
    expect(
      screen.getByRole("button", { name: /Novo checkpoint/ }),
    ).toBeInTheDocument();
  });

  it("hides the register action when !canRegister", () => {
    renderView({ canRegister: false, flags: flagsOff });
    expect(
      screen.queryByRole("button", { name: /Novo checkpoint/ }),
    ).not.toBeInTheDocument();
  });
});

describe("Visibility toggle", () => {
  it("flips PRIVATE -> SHARED and reflects the new badge in the card", async () => {
    setVisibility.mockResolvedValue({
      ok: true,
      data: { visibility: "SHARED" },
    });
    renderView({ flags: flagsOff });
    const card = screen.getByTestId("checkpoint-card");

    fireEvent.click(within(card).getByRole("button", { name: /Compartilhar/ }));

    await waitFor(() =>
      expect(within(card).getByText("Compartilhado")).toBeInTheDocument(),
    );
    expect(setVisibility).toHaveBeenCalledWith({
      id: "cp1",
      visibility: "SHARED",
    });
  });
});

describe("Insights panel (AI flag)", () => {
  it("renders Opportunity and Case with Accept/Dismiss when AI is on", () => {
    renderView({ flags: flagsAi });
    const panel = screen.getByTestId("checkpoint-insights");
    expect(within(panel).getByText("Ampliar squad no cliente X")).toBeInTheDocument();
    expect(
      within(panel).getByText("Migração concluída sem downtime"),
    ).toBeInTheDocument();
    expect(
      within(panel).getAllByRole("button", { name: /Aceitar/ }).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      within(panel).getAllByRole("button", { name: /Descartar/ }).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("links Skills to the existing curation instead of duplicating it", () => {
    renderView({ flags: flagsAi });
    const link = screen.getByRole("link", { name: /curadoria de Skills/ });
    expect(link).toHaveAttribute("href", "/app/skills");
  });

  it("accepts an opportunity and reflects the decided status in the panel", async () => {
    decideOpportunity.mockResolvedValue({
      ok: true,
      data: { id: "op1", status: "ACCEPTED" },
    });
    renderView({ flags: flagsAi });
    const panel = screen.getByTestId("checkpoint-insights");
    const opp = within(panel)
      .getByText("Ampliar squad no cliente X")
      .closest("li") as HTMLElement;

    fireEvent.click(within(opp).getByRole("button", { name: /Aceitar/ }));

    await waitFor(() =>
      expect(within(opp).getByText("Aceito")).toBeInTheDocument(),
    );
    expect(decideOpportunity).toHaveBeenCalledWith({
      id: "op1",
      decision: "ACCEPTED",
    });
  });

  it("hides the insights panel entirely when the AI flag is off", () => {
    renderView({ flags: flagsOff });
    expect(screen.queryByTestId("checkpoint-insights")).not.toBeInTheDocument();
  });

  it("does not render the insights panel for a viewer who cannot see the raw", () => {
    renderView({
      items: [checkpoint({ canViewRaw: false, notes: null })],
      insightsById: {},
      flags: flagsAi,
    });
    expect(screen.queryByTestId("checkpoint-insights")).not.toBeInTheDocument();
  });
});

describe("Voice (flag)", () => {
  it("shows the voice section in the composer only when the voice flag is on", () => {
    renderView({ flags: flagsVoice });
    fireEvent.click(screen.getByRole("button", { name: /Novo checkpoint/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Registro por voz")).toBeInTheDocument();
  });

  it("hides the voice section when the voice flag is off", () => {
    renderView({ flags: flagsOff });
    fireEvent.click(screen.getByRole("button", { name: /Novo checkpoint/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText("Registro por voz")).not.toBeInTheDocument();
  });
});
