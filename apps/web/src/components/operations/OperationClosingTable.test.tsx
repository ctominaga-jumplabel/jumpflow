import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { OperationClosingTable } from "./OperationClosingTable";
import {
  summarizeOverview,
  summarizeReadiness,
  type ConsultantReadiness,
  type OperationClosingRow,
} from "@/lib/operations/closing";

// The table imports the closing server actions; mocking them keeps server-only
// modules (Prisma) out of the jsdom test tree.
vi.mock("@/app/app/operacao/fechamento/actions", () => ({
  closeOperation: vi.fn(),
  reopenOperation: vi.fn(),
  getOperationClosingApuracao: vi.fn(),
}));

// The "Apurar" flow opens attachments via the horas action; mock it so the
// server-only module (Prisma) never loads in jsdom.
vi.mock("@/app/app/horas/actions", () => ({
  getTimeEntryAttachmentUrl: vi.fn(),
}));

// Accented names exercise percent-encoding of the deep-link query.
const pendingConsultant: ConsultantReadiness = {
  consultantId: "c-pending",
  consultantName: "André Gonçalves",
  state: "PENDING_REVIEW",
  hours: 32,
};
const approvedConsultant: ConsultantReadiness = {
  consultantId: "c-approved",
  consultantName: "Bruno Lima",
  state: "APPROVED",
  hours: 40,
};

function buildRow(): OperationClosingRow {
  return {
    projectId: "proj-1",
    projectName: "Órion",
    clientName: "Banco Sul",
    closingId: null,
    status: "OPEN",
    closedAt: null,
    closedByName: null,
    notifiedAt: null,
    readiness: summarizeReadiness([pendingConsultant, approvedConsultant]),
    exceptionCount: 0,
  };
}

function renderTable() {
  const row = buildRow();
  const overview = summarizeOverview(6, 2026, [row]);
  render(
    <OperationClosingTable
      overview={overview}
      canManage={false}
      monthLabel="junho de 2026"
    />,
  );
  // Open the team modal (the "Equipe" cell button shows "ready/total").
  fireEvent.click(screen.getByRole("button", { name: /1\/2/ }));
}

describe("OperationClosingTable team modal deep-link", () => {
  it("links only the PENDING_REVIEW consultant to the approvals queue", () => {
    renderTable();

    const dialog = screen.getByRole("dialog");

    // The pending consultant is a link; the approved one is not.
    const pendingLink = within(dialog).getByRole("link", {
      name: /André Gonçalves/,
    });
    expect(pendingLink).toBeInTheDocument();

    expect(
      within(dialog).queryByRole("link", { name: /Bruno Lima/ }),
    ).not.toBeInTheDocument();
    // Bruno still appears as plain text (not actionable).
    expect(within(dialog).getByText("Bruno Lima")).toBeInTheDocument();
  });

  it("builds the deep-link with kind=HOURS, status=PENDING and encoded names", () => {
    renderTable();

    const dialog = screen.getByRole("dialog");
    const href = within(dialog)
      .getByRole("link", { name: /André Gonçalves/ })
      .getAttribute("href");
    expect(href).not.toBeNull();

    const url = new URL(href!, "https://example.test");
    expect(url.pathname).toBe("/app/aprovacoes");
    expect(url.searchParams.get("kind")).toBe("HOURS");
    expect(url.searchParams.get("status")).toBe("PENDING");
    expect(url.searchParams.get("client")).toBe("Banco Sul");
    expect(url.searchParams.get("project")).toBe("Órion");
    expect(url.searchParams.get("consultant")).toBe("André Gonçalves");

    // The raw query string keeps the accented values percent-encoded.
    const rawQuery = href!.slice(href!.indexOf("?") + 1);
    expect(rawQuery).toContain("consultant=Andr%C3%A9+Gon%C3%A7alves");
    expect(rawQuery).toContain("project=%C3%93rion");
  });
});
