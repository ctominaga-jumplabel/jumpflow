import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CoeCompositionBundle } from "@/lib/coe/types";

vi.mock("@/components/coe/CoeOverviewPanel", () => ({
  CoeOverviewPanel: ({ onCompose }: { onCompose?: () => void }) => (
    <div data-testid="overview">{onCompose ? "compose-on" : "compose-off"}</div>
  ),
}));
vi.mock("@/components/coe/CoeCompositionPanel", () => ({
  CoeCompositionPanel: () => <div data-testid="composition" />,
}));
vi.mock("@/components/coe/CoeNucleusPanel", () => ({
  CoeNucleusPanel: () => <div data-testid="nucleus" />,
}));
vi.mock("@/components/coe/CoeSquadsPanel", () => ({
  CoeSquadsPanel: () => <div data-testid="squads" />,
}));

import { CoeView, type CoeAllowedTabs } from "./CoeView";

const bundle = {
  composition: { assignments: [] },
} as unknown as CoeCompositionBundle;

function renderView(
  allowedTabs?: CoeAllowedTabs,
  withBundle: CoeCompositionBundle | null = bundle,
) {
  return render(
    <CoeView
      members={[]}
      candidateOptions={[]}
      projects={[]}
      skillOptions={[]}
      squads={[]}
      bundle={withBundle}
      query={{} as never}
      canCurate
      canPropose
      allowedTabs={allowedTabs}
    />,
  );
}

describe("CoeView — subtelas pela matriz", () => {
  it("padrão: as quatro abas aparecem", () => {
    renderView();
    for (const label of [
      "Visão geral",
      "Composição de time",
      "Propostas salvas",
      "Curadoria",
    ]) {
      expect(
        screen.getByRole("button", { name: new RegExp(label) }),
      ).toBeInTheDocument();
    }
    expect(screen.getByTestId("overview")).toHaveTextContent("compose-on");
    fireEvent.click(screen.getByRole("button", { name: /Curadoria/ }));
    expect(screen.getByTestId("nucleus")).toBeInTheDocument();
  });

  it("negadas: abas somem e a visão geral perde o atalho de composição", () => {
    renderView(
      { composition: false, proposals: false, curation: false },
      null,
    );
    expect(
      screen.getByRole("button", { name: /Visão geral/ }),
    ).toBeInTheDocument();
    for (const label of ["Composição de time", "Propostas salvas", "Curadoria"]) {
      expect(
        screen.queryByRole("button", { name: new RegExp(label) }),
      ).not.toBeInTheDocument();
    }
    expect(screen.getByTestId("overview")).toHaveTextContent("compose-off");
  });

  it("negar uma aba não afeta as demais", () => {
    renderView({ composition: true, proposals: false, curation: true });
    expect(
      screen.queryByRole("button", { name: /Propostas salvas/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Composição de time/ }));
    expect(screen.getByTestId("composition")).toBeInTheDocument();
  });
});
