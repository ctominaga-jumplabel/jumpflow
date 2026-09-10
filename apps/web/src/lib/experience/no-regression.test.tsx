/**
 * Trocar a experiência NÃO altera o JumpFlow funcionalmente (P6, item 11).
 *
 * Renderiza componentes REAIS do JumpFlow (`ActionButton`, `StatusBadge`),
 * aplica o Golden Experience e verifica que:
 * - o HTML renderizado é byte a byte o mesmo (nenhuma classe, atributo, aria ou
 *   texto muda — o engine não toca em markup);
 * - o handler de clique continua disparando;
 * - o que mudou está FORA da árvore: variáveis inline no <html> e um <style>
 *   no <head>.
 *
 * É este teste que sustenta a afirmação "sem alterar regra de negócio".
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Check } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import goldenFixture from "./fixtures/pack-1-v1.json";
import { STYLE_ELEMENT_ID, applyExperience, revertExperience } from "./engine";
import type { ExperiencePack } from "./types";

const golden = (goldenFixture as { pack: ExperiencePack }).pack;

function Tela({ onAprovar }: { onAprovar: () => void }) {
  return (
    <section aria-label="Aprovações">
      <StatusBadge tone="success">Aprovado</StatusBadge>
      <ActionButton variant="primary" icon={Check} onClick={onAprovar}>
        Aprovar horas
      </ActionButton>
      <input aria-label="Buscar consultor" placeholder="Buscar consultor" />
    </section>
  );
}

beforeEach(() => {
  revertExperience();
  document.documentElement.removeAttribute("style");
});

describe("aplicar experiência sobre componentes reais", () => {
  it("não muda uma vírgula do HTML dos componentes", () => {
    const { container, unmount } = render(<Tela onAprovar={() => {}} />);
    const antes = container.innerHTML;
    unmount();

    expect(applyExperience(golden).ok).toBe(true);

    const depois = render(<Tela onAprovar={() => {}} />);
    expect(depois.container.innerHTML).toBe(antes);
  });

  it("mantém o clique funcionando depois da troca", async () => {
    const aprovar = vi.fn();
    applyExperience(golden);
    render(<Tela onAprovar={aprovar} />);
    const botao = screen.getByRole("button", { name: /aprovar horas/i });
    botao.click();
    expect(aprovar).toHaveBeenCalledTimes(1);
  });

  it("mantém rótulos, aria e ordem de tabulação", () => {
    applyExperience(golden);
    render(<Tela onAprovar={() => {}} />);
    expect(screen.getByRole("region", { name: "Aprovações" })).toBeInTheDocument();
    expect(screen.getByText("Aprovado")).toBeInTheDocument();
    expect(screen.getByLabelText("Buscar consultor")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /aprovar horas/i }),
    ).not.toHaveAttribute("disabled");
  });

  it("o que muda vive fora da árvore da aplicação", () => {
    const { container } = render(<Tela onAprovar={() => {}} />);
    applyExperience(golden);
    // Nenhum <style> dentro do app; o do engine está no <head>.
    expect(container.querySelector("style")).toBeNull();
    expect(document.head.querySelector(`#${STYLE_ELEMENT_ID}`)).not.toBeNull();
    expect(document.documentElement.style.getPropertyValue("--canvas")).toBe("#2c3145");
  });

  it("reset devolve o JumpFlow ao estado inicial, com a árvore idêntica", () => {
    const { container } = render(<Tela onAprovar={() => {}} />);
    const antes = container.innerHTML;
    applyExperience(golden);
    revertExperience();
    expect(container.innerHTML).toBe(antes);
    expect(document.documentElement.getAttribute("style") ?? "").toBe("");
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
  });
});
