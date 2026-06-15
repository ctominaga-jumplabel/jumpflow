import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SkillSuggestionPanel, type SkillSuggestionItem } from "./SkillSuggestionPanel";
import {
  deleteSkillSuggestion,
  dismissSkillSuggestion,
  updateSkillSuggestion,
} from "@/app/app/skills/actions";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/app/app/skills/actions", () => ({
  acceptSkillSuggestion: vi.fn(async () => ({ ok: true, data: { suggestionId: "s1" } })),
  deleteSkillSuggestion: vi.fn(async () => ({ ok: true, data: { suggestionId: "s1" } })),
  dismissSkillSuggestion: vi.fn(async () => ({ ok: true, data: { suggestionId: "s1" } })),
  generateWeeklySkillSuggestions: vi.fn(async () => ({
    ok: true,
    data: { generated: 1 },
  })),
  updateSkillSuggestion: vi.fn(async () => ({ ok: true, data: { suggestionId: "s1" } })),
}));

const suggestions: SkillSuggestionItem[] = [
  {
    id: "s1",
    skillId: "sk-react",
    suggestedName: "React",
    suggestedCategory: "Frontend",
    suggestedLevel: "INTERMEDIATE",
    evidenceSummary: "Implementei componentes React no portal.",
    status: "PENDING",
  },
];

function renderPanel() {
  return render(
    <SkillSuggestionPanel
      weekStart="2026-06-08"
      suggestions={suggestions}
      databaseReady
    />,
  );
}

describe("SkillSuggestionPanel", () => {
  it("shows pending confirmation and evidence", () => {
    renderPanel();
    expect(screen.getByText("Aguardando confirmacao")).toBeInTheDocument();
    expect(
      screen.getByText("Implementei componentes React no portal."),
    ).toBeInTheDocument();
  });

  it("edits a pending suggestion", async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText("Nome sugerido de React"), {
      target: { value: "React Testing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar edicao" }));
    expect(updateSkillSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestionId: "s1",
        suggestedName: "React Testing",
      }),
    );
    expect(await screen.findByText("Sugestao atualizada.")).toBeInTheDocument();
  });

  it("rejects suggestions by explicit human action", async () => {
    renderPanel();
    const item = screen.getByText("Aguardando confirmacao").closest("li")!;
    fireEvent.click(within(item).getByRole("button", { name: "Rejeitar" }));
    await waitFor(() =>
      expect(dismissSkillSuggestion).toHaveBeenCalledWith({ suggestionId: "s1" }),
    );
  });

  it("deletes suggestions by explicit human action", async () => {
    renderPanel();
    const item = screen.getByText("Aguardando confirmacao").closest("li")!;
    fireEvent.click(within(item).getByRole("button", { name: "Apagar" }));
    await waitFor(() =>
      expect(deleteSkillSuggestion).toHaveBeenCalledWith({ suggestionId: "s1" }),
    );
  });
});
