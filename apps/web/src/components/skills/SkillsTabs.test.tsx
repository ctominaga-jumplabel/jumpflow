import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/skills/MyCurriculumTab", () => ({
  MyCurriculumTab: () => null,
}));

import { SkillsTabs } from "./SkillsTabs";

describe("SkillsTabs — subtelas liberadas pelo servidor", () => {
  it("mostra as três abas quando todas são liberadas", () => {
    render(
      <SkillsTabs
        skillsContent={<p>matriz</p>}
        catalogContent={<p>catalogo</p>}
        showCurriculum
      />,
    );
    expect(screen.getByRole("button", { name: "Skills" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Meu Currículo" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Catálogo" })).toBeInTheDocument();
  });

  it("esconde Meu Currículo e Catálogo quando negados", () => {
    render(
      <SkillsTabs skillsContent={<p>matriz</p>} showCurriculum={false} />,
    );
    expect(screen.getByRole("button", { name: "Skills" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Meu Currículo" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Catálogo" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("matriz")).toBeInTheDocument();
  });
});
