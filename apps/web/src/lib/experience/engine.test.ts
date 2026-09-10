/**
 * Theme Engine: aplicar, reverter e recusar.
 *
 * O invariante central: o tema ORIGINAL do JumpFlow tem de voltar inteiro. O
 * engine sobrepõe (variáveis inline no <html> + um <style> próprio) e sabe
 * remover exatamente o que escreveu.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SCOPE_ATTRIBUTE,
  STYLE_ELEMENT_ID,
  applyExperience,
  inspectExperience,
  revertExperience,
} from "./engine";
import type { ExperiencePack } from "./types";

function pack(overrides: Partial<ExperiencePack> = {}): ExperiencePack {
  return {
    schemaVersion: "1.0",
    manifest: { id: "7", slug: "exp-teste", name: "Experiência de Teste", version: 3 },
    tokens: {
      color: {
        $type: "color",
        background: "#0b0b12",
        surface: "rgba(255,255,255,0.06)",
        text: "#e8e8f0",
        textMuted: "#9aa0b4",
        border: "rgba(255,255,255,0.12)",
        primary: "#7c3aed",
        primaryContrast: "#ffffff",
        danger: "#fb6e6e",
        palette: { $type: "color", verde: "#25e19f", ambar: "#f08a21" },
      },
      radius: { $type: "dimension", sm: "6px", md: "14px", lg: "20px" },
      typography: {
        $type: "fontFamily",
        fontFamilyBase: "Inter, system-ui, sans-serif",
        fontFamilyMono: '"JetBrains Mono", monospace',
      },
      shadow: {
        $type: "shadow",
        md: { offsetX: "0", offsetY: "18px", blur: "48px", spread: "0", color: "rgba(0,0,0,0.45)" },
      },
    },
    effects: {
      glass: {
        backdropBlur: "12px",
        background: "rgba(22,24,35,0.72)",
        borderColor: "rgba(37,225,159,0.25)",
        saturate: 1.4,
      },
      glow: {
        $type: "shadow",
        primary: { offsetX: "0", offsetY: "24px", blur: "60px", spread: "-28px", color: "rgba(37,225,159,0.45)" },
      },
      gradient: {
        $type: "gradient",
        body: {
          kind: "linear",
          angle: 160,
          stops: [{ color: "rgba(255,255,255,0.04)", position: 0 }, { color: "transparent", position: 100 }],
        },
      },
    },
    components: {
      button: {
        default: "solid",
        variants: {
          solid: {
            background: { token: "color.primary" },
            text: { token: "color.primaryContrast" },
            radius: { token: "radius.md" },
            border: { width: "1px", style: "solid", color: { token: "color.border" } },
          },
        },
      },
      card: {
        default: "glass",
        variants: {
          glass: {
            effects: ["glass"],
            radius: { token: "radius.lg" },
            shadow: { token: "shadow.md" },
          },
        },
      },
      input: {
        default: "default",
        variants: {
          default: {
            background: "rgba(255,255,255,0.04)",
            radius: { token: "radius.sm" },
            border: { width: "1px", style: "solid", color: { token: "color.border" } },
          },
        },
      },
    },
    motion: {
      duration: { $type: "duration", fast: "150ms", normal: "250ms" },
      easing: { $type: "cubicBezier", standard: [0.4, 0, 0.2, 1] },
      prefersReducedMotion: true,
    },
    ...overrides,
  };
}

beforeEach(() => {
  revertExperience();
  document.documentElement.removeAttribute("style");
});

describe("aplicação de tokens", () => {
  it("escreve as variáveis do JumpFlow a partir do pack", () => {
    const result = applyExperience(pack());
    expect(result.ok).toBe(true);
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--canvas")).toBe("#0b0b12");
    expect(style.getPropertyValue("--surface")).toBe("rgba(255,255,255,0.06)");
    expect(style.getPropertyValue("--strong")).toBe("#e8e8f0");
    expect(style.getPropertyValue("--medium")).toBe("#9aa0b4");
    expect(style.getPropertyValue("--border")).toBe("rgba(255,255,255,0.12)");
    expect(style.getPropertyValue("--brand")).toBe("#7c3aed");
    expect(style.getPropertyValue("--radius-md")).toBe("14px");
    expect(style.getPropertyValue("--font-geist-sans")).toBe(
      "Inter, system-ui, sans-serif",
    );
  });

  it("cobre os dois tipos de raio temável do JumpFlow", () => {
    applyExperience(pack());
    const style = document.documentElement.style;
    // `rounded-md` → var(--radius-md); `rounded-[var(--radius-panel)]` → var(--radius-panel).
    expect(style.getPropertyValue("--radius-md")).toBe("14px");
    expect(style.getPropertyValue("--radius-panel")).toBe("20px");
    // `rounded-card` é inlinado em build: só a camada de regras alcança.
    const css = document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";
    expect(css).toContain(".rounded-card");
  });

  it("mapeia a borda da experiência para --ink (a tinta do Neo Brutalism cede)", () => {
    applyExperience(pack());
    expect(document.documentElement.style.getPropertyValue("--ink")).toBe(
      "rgba(255,255,255,0.12)",
    );
  });

  it("deriva os pares que o JumpFlow tem e o pack não", () => {
    applyExperience(pack());
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--brand-soft")).toBe("rgba(124,58,237,0.18)");
    expect(style.getPropertyValue("--brand-fill-hover")).not.toBe("");
    expect(style.getPropertyValue("--danger-soft")).toBe("rgba(251,110,110,0.16)");
    expect(style.getPropertyValue("--surface-muted")).not.toBe("");
  });

  it("garante texto branco legível no CTA preenchido", () => {
    // Acento claro: o JumpFlow escreve `text-white` fixo no CTA, então o
    // preenchimento tem de escurecer — senão o rótulo do botão desaparece.
    const claro = pack();
    claro.tokens!.color!.primary = "#7DF7C6";
    applyExperience(claro);
    const fill = document.documentElement.style.getPropertyValue("--brand-fill");
    expect(fill).not.toBe("#7DF7C6");
    expect(fill).not.toBe("");
  });

  it("alimenta os acentos Playful Ops com a paleta extra", () => {
    applyExperience(pack());
    expect(document.documentElement.style.getPropertyValue("--flow")).toBe("#25e19f");
    expect(document.documentElement.style.getPropertyValue("--marker")).toBe("#f08a21");
  });
});

describe("camada de efeitos e receitas", () => {
  it("gera regras com seletores do design system do JumpFlow", () => {
    applyExperience(pack());
    const css = document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";
    expect(css).toContain('html[data-jf-experience="exp-teste"] .bg-surface');
    expect(css).toContain("backdrop-filter: blur(12px) saturate(140%)");
    expect(css).toContain("-webkit-backdrop-filter");
    expect(css).toContain(".rounded-card");
    expect(css).toContain("background-image: linear-gradient(160deg,");
    expect(css).toContain(".bg-brand-fill");
    expect(css).toContain("box-shadow: 0 24px 60px -28px rgba(37,225,159,0.45)");
  });

  it("marca o escopo no <html>", () => {
    applyExperience(pack());
    expect(document.documentElement.getAttribute(SCOPE_ATTRIBUTE)).toBe("exp-teste");
  });

  it("permite aplicar só tokens, sem efeitos", () => {
    const result = applyExperience(pack(), { effects: false });
    expect(result.ok).toBe(true);
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
    expect(document.documentElement.style.getPropertyValue("--canvas")).toBe("#0b0b12");
  });

  it("não aplica box-model das receitas (não mexe em densidade/layout)", () => {
    const comBox = pack();
    comBox.components!.button.variants.solid.paddingX = "40px";
    comBox.components!.button.variants.solid.height = "80px";
    comBox.components!.button.variants.solid.width = "100%";
    applyExperience(comBox);
    const css = document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";
    // Propriedade de caixa, com fronteira: `border-width` é skin (faz parte da
    // borda) e pode aparecer; `width`/`height`/`padding`/`gap` não.
    expect(css).not.toMatch(/(^|[\s;{])(padding|padding-[a-z]+|width|height|min-height|max-width|gap)\s*:/);
  });

  it("nunca emite construção proibida", () => {
    applyExperience(pack());
    const css = document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";
    expect(css).not.toMatch(/url\(|@import|javascript:|expression\(|</);
  });
});

describe("recusas", () => {
  it("recusa schemaVersion de major desconhecido", () => {
    const result = applyExperience(pack({ schemaVersion: "2.0" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unsupported-schema");
    expect(document.documentElement.style.getPropertyValue("--canvas")).toBe("");
  });

  it("aceita MINOR novo do mesmo major (compatibilidade para frente)", () => {
    expect(applyExperience(pack({ schemaVersion: "1.7" })).ok).toBe(true);
  });

  it.each([null, undefined, 42, "pack", {}, { schemaVersion: "1.0" }])(
    "recusa entrada degenerada sem lançar: %s",
    (entrada) => {
      const result = applyExperience(entrada);
      expect(result.ok).toBe(false);
    },
  );

  it("recusa pack sem fundo/texto aplicáveis", () => {
    const semCor = pack();
    semCor.tokens = { radius: { $type: "dimension", md: "8px" } };
    const result = applyExperience(semCor);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unusable-pack");
  });

  it("recusa pack ILEGÍVEL em vez de deixar o produto sem contraste", () => {
    // Caso real: o pack do Governance Compass saiu com fundo #fff e texto
    // #F3F0FF (mistura de tema claro e escuro). Aplicar deixaria o app branco
    // no branco — é falha de dado, não escolha estética.
    const ilegivel = pack();
    ilegivel.tokens!.color!.background = "#ffffff";
    ilegivel.tokens!.color!.text = "#F3F0FF";
    const result = applyExperience(ilegivel);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unreadable-pack");
      expect(result.detail).toContain("contraste");
    }
    expect(document.documentElement.style.getPropertyValue("--canvas")).toBe("");
  });

  it("descarta token inválido e aplica o resto", () => {
    const sujo = pack();
    sujo.tokens!.color!.textMuted = "red; } body { display:none }";
    sujo.tokens!.radius!.md = "calc(100% - 2px)";
    const result = applyExperience(sujo);
    expect(result.ok).toBe(true);
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--canvas")).toBe("#0b0b12");
    expect(style.getPropertyValue("--radius-md")).toBe("");
    // `--medium` cai para a derivação a partir de texto/fundo, nunca para o lixo.
    expect(style.getPropertyValue("--medium")).not.toContain("display");
  });
});

describe("prefers-reduced-motion", () => {
  it("não escreve duração/easing quando a pessoa pede menos movimento", () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    const result = applyExperience(pack());
    expect(result.ok).toBe(true);
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--default-transition-duration")).toBe("");
    expect(style.getPropertyValue("--canvas")).toBe("#0b0b12");
    window.matchMedia = original;
  });

  it("escreve motion quando não há preferência por menos movimento", () => {
    applyExperience(pack());
    expect(
      document.documentElement.style.getPropertyValue("--default-transition-duration"),
    ).toBe("150ms");
    expect(
      document.documentElement.style.getPropertyValue(
        "--default-transition-timing-function",
      ),
    ).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
  });
});

describe("reversão e troca", () => {
  it("reset devolve o tema original: nenhuma variável, nenhum <style>, nenhum atributo", () => {
    applyExperience(pack());
    revertExperience();
    expect(document.documentElement.getAttribute("style") ?? "").toBe("");
    expect(document.documentElement.hasAttribute(SCOPE_ATTRIBUTE)).toBe(false);
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
  });

  it("reset é idempotente", () => {
    revertExperience();
    revertExperience();
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
  });

  it("trocar de experiência não deixa resíduo da anterior", () => {
    applyExperience(pack());
    const outra = pack({
      manifest: { id: "9", slug: "outra-exp", name: "Outra", version: 1 },
    });
    outra.tokens!.color = {
      $type: "color",
      background: "#ffffff",
      surface: "#f7f5ea",
      text: "#111814",
      primary: "#2457ff",
    };
    delete outra.effects;
    applyExperience(outra);
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--canvas")).toBe("#ffffff");
    // A paleta extra da experiência anterior não pode sobreviver.
    expect(style.getPropertyValue("--flow")).toBe("");
    expect(document.documentElement.getAttribute(SCOPE_ATTRIBUTE)).toBe("outra-exp");
  });

  it("aplicar duas vezes a mesma experiência é estável", () => {
    const primeiro = applyExperience(pack());
    const segundo = applyExperience(pack());
    expect(primeiro.ok && segundo.ok).toBe(true);
    if (primeiro.ok && segundo.ok) {
      expect(segundo.applied.variables).toEqual(primeiro.applied.variables);
      expect(segundo.applied.rules).toBe(primeiro.applied.rules);
    }
    expect(document.querySelectorAll(`#${STYLE_ELEMENT_ID}`)).toHaveLength(1);
  });
});

describe("diagnóstico", () => {
  it("inspect mede sem aplicar", () => {
    const report = inspectExperience(pack());
    expect(report.supported).toBe(true);
    expect(report.variableCount).toBeGreaterThan(15);
    expect(report.ruleCount).toBeGreaterThan(2);
    expect(report.readability?.ok).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--canvas")).toBe("");
  });
});
