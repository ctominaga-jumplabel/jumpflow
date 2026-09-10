/**
 * Provider + switcher: seleção, troca, reset e reidratação.
 *
 * Aqui o fluxo do critério de sucesso do P6 roda inteiro em jsdom:
 * abrir → escolher Experience A → escolher Experience B → voltar ao original.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { ExperienceProvider, useExperience } from "./ExperienceProvider";
import goldenFixture from "./fixtures/pack-1-v1.json";
import { STYLE_ELEMENT_ID, revertExperience } from "./engine";
import { readSelection } from "./client";

const golden = goldenFixture as { pack: unknown };

const LISTA = {
  total: 1,
  experiencias: [
    {
      id: 1,
      slug: "migratemind-dark-tech-glass",
      nome: "MigrateMind — Dark Tech Glass",
      status: "published",
      current_version: 1,
      classification: ["Dark Tech", "Glassmorphism"],
      preview: { swatches: [{ nome: "background", valor: "#2c3145" }] },
    },
  ],
};

function Painel() {
  const { applied, experiences, problem, apply, reset, loadExperiences } =
    useExperience();
  return (
    <div>
      <span data-testid="ativa">{applied ? `${applied.name} v${applied.version}` : "original"}</span>
      <span data-testid="problema">{problem ?? ""}</span>
      <span data-testid="quantas">{experiences.length}</span>
      <button type="button" onClick={() => void loadExperiences()}>
        carregar
      </button>
      <button type="button" onClick={() => void apply(1, 1)}>
        aplicar
      </button>
      <button type="button" onClick={reset}>
        resetar
      </button>
    </div>
  );
}

function PainelDuplo() {
  const { applied, problem, apply } = useExperience();
  return (
    <div>
      <span data-testid="ativa">
        {applied ? `${applied.name} v${applied.version}` : "original"}
      </span>
      <span data-testid="problema">{problem ?? ""}</span>
      <button type="button" onClick={() => void apply(1, 1)}>
        aplicar 1
      </button>
      <button type="button" onClick={() => void apply(2, 1)}>
        aplicar 2
      </button>
    </div>
  );
}

function servidorFalso(handler?: (url: string) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (handler) {
      const custom = await handler(url);
      if (custom) return custom;
    }
    if (url === "/api/experience") {
      return { ok: true, status: 200, json: async () => LISTA } as Response;
    }
    if (url.startsWith("/api/experience/1")) {
      return { ok: true, status: 200, json: async () => golden } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });
}

beforeEach(() => {
  window.localStorage.clear();
  revertExperience();
  document.documentElement.removeAttribute("style");
});

describe("fluxo do switcher", () => {
  it("carrega a lista publicada, aplica e reseta", async () => {
    global.fetch = servidorFalso() as unknown as typeof fetch;
    render(
      <ExperienceProvider>
        <Painel />
      </ExperienceProvider>,
    );

    expect(screen.getByTestId("ativa").textContent).toBe("original");

    await act(async () => {
      screen.getByText("carregar").click();
    });
    await waitFor(() => expect(screen.getByTestId("quantas").textContent).toBe("1"));

    await act(async () => {
      screen.getByText("aplicar").click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("ativa").textContent).toContain("MigrateMind"),
    );
    expect(document.documentElement.style.getPropertyValue("--canvas")).toBe("#2c3145");
    expect(document.getElementById(STYLE_ELEMENT_ID)).not.toBeNull();
    expect(readSelection()).toEqual({ id: 1, version: 1 });

    await act(async () => {
      screen.getByText("resetar").click();
    });
    expect(screen.getByTestId("ativa").textContent).toBe("original");
    expect(document.documentElement.getAttribute("style") ?? "").toBe("");
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
    expect(readSelection()).toBeNull();
  });

  it("reidrata a experiência salva ao montar de novo", async () => {
    global.fetch = servidorFalso() as unknown as typeof fetch;
    window.localStorage.setItem(
      "jf-experience-selection",
      JSON.stringify({ id: 1, version: 1 }),
    );
    render(
      <ExperienceProvider>
        <Painel />
      </ExperienceProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("ativa").textContent).toContain("MigrateMind"),
    );
    expect(document.documentElement.style.getPropertyValue("--canvas")).toBe("#2c3145");
  });

  it("API fora e sem cache: fica no tema original e diz o motivo", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    render(
      <ExperienceProvider>
        <Painel />
      </ExperienceProvider>,
    );
    await act(async () => {
      screen.getByText("aplicar").click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("problema").textContent).toContain(
        "não foi possível carregar",
      ),
    );
    expect(screen.getByTestId("ativa").textContent).toBe("original");
    expect(document.documentElement.getAttribute("style") ?? "").toBe("");
  });

  it("falha ao trocar NÃO derruba a experiência que já estava aplicada", async () => {
    global.fetch = servidorFalso((url) =>
      url.startsWith("/api/experience/2")
        ? ({ ok: false, status: 500, json: async () => ({}) } as Response)
        : (undefined as unknown as Response),
    ) as unknown as typeof fetch;
    render(
      <ExperienceProvider>
        <PainelDuplo />
      </ExperienceProvider>,
    );
    await act(async () => {
      screen.getByText("aplicar 1").click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("ativa").textContent).toContain("MigrateMind"),
    );
    await act(async () => {
      screen.getByText("aplicar 2").click();
    });
    await waitFor(() => expect(screen.getByTestId("problema").textContent).not.toBe(""));
    // A experiência boa continua aplicada.
    expect(screen.getByTestId("ativa").textContent).toContain("MigrateMind");
    expect(document.documentElement.style.getPropertyValue("--canvas")).toBe("#2c3145");
  });

  it("pack incompatível: recusa, avisa e mantém o original", async () => {
    global.fetch = servidorFalso((url) =>
      url.startsWith("/api/experience/1")
        ? ({
            ok: true,
            status: 200,
            json: async () => ({ pack: { schemaVersion: "9.0" } }),
          } as Response)
        : (undefined as unknown as Response),
    ) as unknown as typeof fetch;
    render(
      <ExperienceProvider>
        <Painel />
      </ExperienceProvider>,
    );
    await act(async () => {
      screen.getByText("aplicar").click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("problema").textContent).not.toBe(""),
    );
    expect(screen.getByTestId("ativa").textContent).toBe("original");
  });
});
