import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApprovalQueue } from "./ApprovalQueue";
import { decideHours, setEntryBillable } from "@/app/app/horas/actions";
import type { ApprovalItem } from "@/lib/mock-data/approvals";

// Default items are all mock-sourced, so decisions stay local; mocking the
// actions modules keeps server-only imports out of the jsdom test tree.
vi.mock("@/app/app/horas/actions", () => ({
  decideHours: vi.fn(),
  setEntryBillable: vi.fn(),
  attachBillableJustificationFile: vi.fn(),
}));
vi.mock("@/app/app/despesas/actions", () => ({
  decideAsManager: vi.fn(),
  decideAsFinance: vi.fn(),
}));

// The queue defaults its period to the CURRENT month (QW-1) when no deep-link
// is given, which would hide the June/May mock items. Passing an (empty)
// deep-link seed keeps the full demo set visible without a real date filter,
// exercising the same code path the closing deep-link uses.
const renderQueue = (props = {}) =>
  render(<ApprovalQueue initialFilters={{}} {...props} />);

/** Local ISO (yyyy-mm-dd) of a date — mirrors the component's toLocalISODate. */
const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

/** First/last day of the CURRENT month, computed here to assert QW-1 defaults. */
const currentMonthRange = () => {
  const now = new Date();
  return {
    start: isoLocal(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: isoLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
};

/** Build a minimal ApprovalItem, overridable per test. */
const makeItem = (overrides: Partial<ApprovalItem> = {}): ApprovalItem => ({
  id: "it-1",
  type: "HOURS",
  source: "mock",
  consultantName: "Consultor Teste",
  projectName: "Projeto Teste",
  clientName: "Cliente Teste",
  period: "Semana 1",
  hours: 8,
  activitySummary: "Desenvolvimento",
  submittedAt: "2026-06-10T12:00:00Z",
  status: "PENDING",
  isAutomatic: false,
  ...overrides,
});

describe("ApprovalQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the pending queue with inline decisions", () => {
    renderQueue();
    expect(screen.getByText("Fila de aprovação")).toBeInTheDocument();
    // Decisions are inline per row now (no lateral panel): each pending row
    // exposes its own Aprovar/Reprovar.
    expect(
      screen.getAllByRole("button", { name: /^Aprovar$/ }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Em breve")).not.toBeInTheDocument();
  });

  it("switches to the history tab", () => {
    renderQueue();
    fireEvent.click(screen.getByRole("button", { name: /Histórico/ }));
    expect(screen.getByText("Decisões recentes")).toBeInTheDocument();
  });

  it("filters the queue by kind (horas vs despesas)", () => {
    renderQueue();
    // Default: all pending items (hours + expenses).
    expect(screen.getByText("5 pendentes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Despesas" }));
    expect(screen.getByText("2 pendentes")).toBeInTheDocument();
  });

  it("approves a pending item inline with local feedback", () => {
    renderQueue();
    expect(screen.getByText("5 pendentes")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /^Aprovar$/ })[0]);
    expect(screen.getByText(/aprovado \(local\)/)).toBeInTheDocument();
    expect(screen.getByText("4 pendentes")).toBeInTheDocument();
  });

  it("rejects inline only with a justification and reports it", () => {
    renderQueue();
    // Open the inline reject field on the first pending row.
    fireEvent.click(screen.getAllByRole("button", { name: /^Reprovar$/ })[0]);
    fireEvent.change(screen.getByLabelText(/Justificativa da reprovação/), {
      target: { value: "Reenviar com a nota fiscal." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Confirmar reprovação/ }),
    );
    expect(screen.getByText(/reprovado com justificativa/)).toBeInTheDocument();
  });

  it("keeps the Reprovar button enabled but blocks rejecting without a justification", () => {
    renderQueue();
    const reject = screen.getAllByRole("button", { name: /^Reprovar$/ })[0];
    // The button is clickable (not disabled) so the user gets feedback.
    expect(reject).not.toBeDisabled();
    // Open the inline field and try to confirm with no justification.
    fireEvent.click(reject);
    fireEvent.click(
      screen.getByRole("button", { name: /Confirmar reprovação/ }),
    );
    // No decision was applied: the inline validation message shows instead.
    expect(
      screen.getByText(/Informe uma justificativa para reprovar/),
    ).toBeInTheDocument();
    expect(screen.getByText("5 pendentes")).toBeInTheDocument();
  });

  it("filters approvals by project", () => {
    renderQueue();
    fireEvent.change(screen.getByLabelText("Projeto"), {
      target: { value: "Atlas" },
    });
    expect(screen.getByText("3 pendentes")).toBeInTheDocument();
  });

  it("decides visible pending items in bulk with a justification", async () => {
    renderQueue();
    fireEvent.click(screen.getByRole("button", { name: /Selecionar visíveis/ }));
    expect(await screen.findByText(/5 selecionado/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Justificativa de massa"), {
      target: { value: "Revisao em lote." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Reprovar seleção/ }));
    expect(
      await screen.findByText(/5 item\(ns\) reprovado\(s\)/),
    ).toBeInTheDocument();
    expect(await screen.findByText("0 pendentes")).toBeInTheDocument();
  });

  it("offers a 'Reabrir seleção' action only on the history tab", () => {
    renderQueue();
    // Pending tab: no reopen action.
    expect(
      screen.queryByRole("button", { name: /Reabrir seleção/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Histórico/ }));
    expect(
      screen.getByRole("button", { name: /Reabrir seleção/ }),
    ).toBeInTheDocument();
  });

  it("reopens decided history items back to the pending queue in bulk", async () => {
    renderQueue();
    expect(screen.getByText("5 pendentes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Histórico/ }));
    // Select every decided item, then reopen the selection.
    fireEvent.click(screen.getByRole("button", { name: /Selecionar visíveis/ }));
    fireEvent.click(screen.getByRole("button", { name: /Reabrir seleção/ }));
    expect(
      await screen.findByText(/item\(ns\) reaberto\(s\) para a fila pendente/),
    ).toBeInTheDocument();
    // All 5 decided mock items (auto-approved/approved/rejected, hours and
    // despesas) return to PENDING, joining the 5 already pending -> 10.
    expect(await screen.findByText("10 pendentes")).toBeInTheDocument();
  });

  it("seeds the filters from initialFilters (deep-link from closing)", () => {
    render(
      <ApprovalQueue
        initialFilters={{
          kind: "HOURS",
          status: "PENDING",
          project: "Atlas",
          consultant: "Carlos Nunes",
        }}
      />,
    );
    // kind=HOURS narrows Carlos Nunes' two pending Atlas items (hours + expense)
    // to just the hours one — exactly what the closing deep-link wants.
    expect(screen.getByText("1 pendentes")).toBeInTheDocument();
    // The Projeto/Consultor selects reflect the seeded values.
    expect((screen.getByLabelText("Projeto") as HTMLSelectElement).value).toBe(
      "Atlas",
    );
    expect(
      (screen.getByLabelText("Consultor") as HTMLSelectElement).value,
    ).toBe("Carlos Nunes");
    // The matching item is decidable inline: its Aprovar button is enabled.
    expect(
      screen.getByRole("button", { name: /^Aprovar$/ }),
    ).not.toBeDisabled();
  });

  it("seeds the kind tab and ignores an unknown kind (falls back to ALL)", () => {
    const { unmount } = render(
      <ApprovalQueue initialFilters={{ kind: "HOURS" }} />,
    );
    // HOURS tab active: only the 3 pending hours items remain.
    expect(screen.getByText("3 pendentes")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Horas" }),
    ).toHaveAttribute("aria-pressed", "true");
    unmount();

    // Unknown kind falls back to ALL (every pending item, hours + expenses).
    render(<ApprovalQueue initialFilters={{ kind: "BOGUS" as never }} />);
    expect(screen.getByText("5 pendentes")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Todos" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("ignores an unknown status in initialFilters (falls back to ALL)", () => {
    render(
      <ApprovalQueue
        initialFilters={{ status: "BOGUS" as never, project: "Atlas" }}
      />,
    );
    // Status falls back to ALL: every Atlas item (pending + decided) is in scope.
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe(
      "ALL",
    );
    expect((screen.getByLabelText("Projeto") as HTMLSelectElement).value).toBe(
      "Atlas",
    );
  });

  it("clears the selection when switching tabs", () => {
    renderQueue();
    fireEvent.click(screen.getByRole("button", { name: /Selecionar visíveis/ }));
    expect(screen.getByText(/5 selecionado/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Histórico/ }));
    expect(screen.getByText(/0 selecionado/)).toBeInTheDocument();
  });

  // --- QW-1: default period seeds the current month when no deep-link ---
  it("seeds the period to the current month when no initialFilters are given (QW-1)", () => {
    // Render WITHOUT initialFilters: resolveInitialFilters must pre-fill the
    // date inputs with the first/last day of the current month (local time).
    render(<ApprovalQueue />);
    const { start, end } = currentMonthRange();
    expect((screen.getByLabelText("Início") as HTMLInputElement).value).toBe(
      start,
    );
    expect((screen.getByLabelText("Fim") as HTMLInputElement).value).toBe(end);
    // Sanity: the values are not empty.
    expect(start).not.toBe("");
    expect(end).not.toBe("");
  });

  it("leaves the period empty when a deep-link seed is passed (QW-1 respects the seed)", () => {
    // An (empty) deep-link seed must NOT be overwritten by the current-month
    // default — the closing sends {} to show the target regardless of month.
    render(<ApprovalQueue initialFilters={{}} />);
    expect((screen.getByLabelText("Início") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Fim") as HTMLInputElement).value).toBe("");
  });

  // --- QW-1 guardrail: pending submitted outside the default month is warned ---
  it("warns about pending items hidden by the month default and reveals them on demand", () => {
    // A pending item submitted long before the current month is hidden by the
    // QW-1 default; the queue must never hide pending work silently.
    const hidden = makeItem({
      id: "old-pending",
      consultantName: "Zeca Antigo",
      submittedAt: "2020-03-10T10:00:00Z",
    });
    // No initialFilters -> current-month default is active and hides it.
    render(<ApprovalQueue items={[hidden]} />);

    // (a) The pending item is NOT in the list (its row/expand button is absent;
    // the name still appears as a Consultor filter option, which we ignore).
    expect(
      screen.queryByRole("button", { name: /Zeca Antigo/ }),
    ).not.toBeInTheDocument();
    // (b) The guardrail warning is shown.
    expect(
      screen.getByText(/fora do período filtrado/),
    ).toBeInTheDocument();

    // (c) "Ver todas as pendências" clears only the period and reveals it.
    fireEvent.click(
      screen.getByRole("button", { name: /Ver todas as pendências/ }),
    );
    expect(
      screen.getByRole("button", { name: /Zeca Antigo/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/fora do período filtrado/),
    ).not.toBeInTheDocument();
  });

  // --- Inline rejection requires a justification (db-backed item) ---
  it("blocks inline rejection without a justification and sends it once provided", async () => {
    vi.mocked(decideHours).mockResolvedValue({
      ok: true,
      data: { decided: 2, alreadyDecided: 0 },
    } as Awaited<ReturnType<typeof decideHours>>);
    const dbHours = makeItem({
      id: "db-hours",
      source: "db",
      entryIds: ["e1", "e2"],
      consultantName: "Bea Banco",
    });
    render(<ApprovalQueue items={[dbHours]} initialFilters={{}} />);

    // Open the inline reject field and confirm with no text -> validation + no call.
    fireEvent.click(screen.getByRole("button", { name: /^Reprovar$/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /Confirmar reprovação/ }),
    );
    expect(
      screen.getByText(/Informe uma justificativa para reprovar/),
    ).toBeInTheDocument();
    expect(decideHours).not.toHaveBeenCalled();

    // Provide a justification -> decideHours is called with it exactly once.
    fireEvent.change(screen.getByLabelText(/Justificativa da reprovação/), {
      target: { value: "Refazer o apontamento." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Confirmar reprovação/ }),
    );
    await waitFor(() =>
      expect(decideHours).toHaveBeenCalledWith({
        entryIds: ["e1", "e2"],
        decision: "REJECTED",
        comment: "Refazer o apontamento.",
      }),
    );
    expect(decideHours).toHaveBeenCalledTimes(1);
  });

  // --- Inline reject state is local per row ---
  it("keeps the inline rejection field local to the row it was opened on", () => {
    renderQueue();
    // Several pending rows exist; open reject on the first one only.
    fireEvent.click(screen.getAllByRole("button", { name: /^Reprovar$/ })[0]);
    // Exactly one rejection field is open (not mirrored onto the other rows).
    expect(
      screen.getAllByLabelText(/Justificativa da reprovação/),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole("button", { name: /Confirmar reprovação/ }),
    ).toHaveLength(1);
  });

  // --- Inline billable editor (per day) requires a reason ---
  it("requires a reason to mark a day non-billable and calls onSetBillable", async () => {
    vi.mocked(setEntryBillable).mockResolvedValue({
      ok: true,
    } as Awaited<ReturnType<typeof setEntryBillable>>);
    const dbWithEntries = makeItem({
      id: "db-billable",
      source: "db",
      entryIds: ["te1"],
      entries: [
        {
          id: "te1",
          date: "2026-06-02",
          hours: 8,
          activityLabel: "Desenvolvimento",
          billable: true,
        },
      ],
      consultantName: "Caio Faturavel",
    });
    render(
      <ApprovalQueue
        items={[dbWithEntries]}
        initialFilters={{}}
        canEditBillable
      />,
    );

    // Expand the row to reveal the per-day billable editor.
    fireEvent.click(screen.getByRole("button", { name: /Caio Faturavel/ }));
    // Untick "Faturável" -> the non-billable reason modal opens.
    fireEvent.click(screen.getByRole("checkbox", { name: "Faturável" }));

    // Confirm with no reason -> validation error, no server call.
    fireEvent.click(
      screen.getByRole("button", { name: /Confirmar não faturável/ }),
    );
    expect(screen.getByText(/O motivo é obrigatório/)).toBeInTheDocument();
    expect(setEntryBillable).not.toHaveBeenCalled();

    // Provide a reason -> onSetBillable calls setEntryBillable with billable=false.
    fireEvent.change(screen.getByLabelText(/Motivo/), {
      target: { value: "Retrabalho não cobrável." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Confirmar não faturável/ }),
    );
    await waitFor(() =>
      expect(setEntryBillable).toHaveBeenCalledWith({
        entryId: "te1",
        billable: false,
        nonBillableReason: "Retrabalho não cobrável.",
      }),
    );
  });

  it("keeps the reason mandatory even when an attachment is provided", () => {
    vi.mocked(setEntryBillable).mockResolvedValue({
      ok: true,
    } as Awaited<ReturnType<typeof setEntryBillable>>);
    const dbWithEntries = makeItem({
      id: "db-billable-att",
      source: "db",
      entryIds: ["te9"],
      entries: [
        {
          id: "te9",
          date: "2026-06-03",
          hours: 8,
          activityLabel: "Desenvolvimento",
          billable: true,
        },
      ],
      consultantName: "Dora Anexo",
    });
    render(
      <ApprovalQueue
        items={[dbWithEntries]}
        initialFilters={{}}
        canEditBillable
        billableAttachmentsAvailable
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Dora Anexo/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Faturável" }));

    // Attach a valid file (upload itself is not exercised in jsdom).
    const file = new File(["x"], "comprovante.pdf", { type: "application/pdf" });
    const input = document.getElementById(
      "non-billable-attachment-db-billable-att",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText("comprovante.pdf")).toBeInTheDocument();

    // Confirm with the file but NO reason -> still blocked, no server call.
    fireEvent.click(
      screen.getByRole("button", { name: /Confirmar não faturável/ }),
    );
    expect(screen.getByText(/O motivo é obrigatório/)).toBeInTheDocument();
    expect(setEntryBillable).not.toHaveBeenCalled();
  });
});
