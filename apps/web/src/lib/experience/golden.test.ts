/**
 * GOLDEN EXPERIENCE — medição contra o pack REAL, extraído de um repositório
 * Jump de verdade pelo analyzer do Jump Value.
 *
 * Fixtures:
 *   `fixtures/pack-1-v2.json` — **v2, a versão corrente** (analyzer corrigido no P6.1)
 *   `fixtures/pack-1-v1.json` — v1 arquivada (analyzer original), guardada de
 *                               propósito: é ela que dá a medida do que a
 *                               correção recuperou
 *
 *   MigrateMind — Dark Tech Glass
 *   github.com/ctominaga-jump/MigrateMind @ c03fd18c (branch feat/migrate-mcp-f4)
 *   Experience #1 · slug migratemind-dark-tech-glass · published
 *
 * As duas versões saem do MESMO commit: o que mudou entre elas é só a
 * capacidade de leitura do analyzer. Ver
 * docs/experience-registry/P6_CONSUMER_VALIDATION.md (repositório do Jump Value).
 */

import { beforeEach, describe, expect, it } from "vitest";
import goldenV2 from "./fixtures/pack-1-v2.json";
import goldenV1 from "./fixtures/pack-1-v1.json";
import compassFixture from "./fixtures/pack-2-v1.json";
import { STYLE_ELEMENT_ID, applyExperience, inspectExperience, revertExperience } from "./engine";
import { readabilityReport } from "./map";
import type { ExperiencePack } from "./types";

const golden = (goldenV2 as { pack: ExperiencePack }).pack;
const anterior = (goldenV1 as { pack: ExperiencePack }).pack;
const compass = (compassFixture as { pack: ExperiencePack }).pack;

/** Verdade da origem, lida de frontend/assets/brand.css no commit c03fd18c. */
const ORIGEM = {
  background: "#090B15",
  surface: "#161823",
  surfaceAlt: "#1B1E2B",
  border: "rgba(255,255,255,0.07)",
  primary: "#25E19F",
  text: "#F4F6FA",
  textMuted: "#AEB6C5",
  danger: "#FB6E6E",
  info: "#5C9DF5",
  sidebarWidth: "256px",
} as const;

beforeEach(() => {
  revertExperience();
  document.documentElement.removeAttribute("style");
});

describe("procedência do golden", () => {
  it("é o pack publicado do repositório real, com commit", () => {
    expect(golden.schemaVersion).toBe("1.0");
    expect(golden.manifest?.slug).toBe("migratemind-dark-tech-glass");
    expect(golden.manifest?.version).toBe(2);
    expect(golden.manifest?.source?.provider).toBe("github");
    expect(golden.manifest?.source?.repository).toContain("MigrateMind");
    expect(golden.manifest?.source?.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(golden.manifest?.classification).toEqual([
      "Dark Tech",
      "Glassmorphism",
      "Skeuomorphic",
    ]);
  });

  it("v1 e v2 saem do MESMO commit — o que mudou foi o analyzer", () => {
    expect(golden.manifest?.source?.commit).toBe(anterior.manifest?.source?.commit);
    expect(golden.manifest?.version).toBe(2);
    expect(anterior.manifest?.version).toBe(1);
  });

  it("declara a extração 100% determinística (sem IA)", () => {
    const generator = (golden.manifest as unknown as Record<string, unknown>)
      .generator as { mode?: string; ai?: { status?: string } } | undefined;
    expect(generator?.mode).toBe("static");
    expect(generator?.ai?.status).toBe("disabled");
  });
});

describe("fidelidade dos tokens contra a origem", () => {
  it("os dez papéis de cor batem com brand.css", () => {
    const cores = golden.tokens?.color ?? {};
    expect(cores.background).toBe(ORIGEM.background);
    expect(cores.surface).toBe(ORIGEM.surface);
    expect(cores.surfaceAlt).toBe(ORIGEM.surfaceAlt);
    expect(cores.border).toBe(ORIGEM.border);
    expect(cores.primary).toBe(ORIGEM.primary);
    expect(cores.text).toBe(ORIGEM.text);
    expect(cores.textMuted).toBe(ORIGEM.textMuted);
    expect(cores.danger).toBe(ORIGEM.danger);
    expect(cores.info).toBe(ORIGEM.info);
  });

  it("a tipografia da origem chegou", () => {
    expect(golden.tokens?.typography?.fontFamilyBase).toBe(
      'Inter, "Segoe UI", system-ui, sans-serif',
    );
  });

  it("o vidro usa a superfície e a linha reais da origem", () => {
    expect(golden.effects?.glass?.backdropBlur).toBe("12px");
    expect(golden.effects?.glass?.background).toBe("rgba(22,24,35,0.72)");
    expect(golden.effects?.glass?.borderColor).toBe(ORIGEM.border);
  });

  it("o gradiente da marca foi capturado", () => {
    const gradientes = (golden.effects?.gradient ?? {}) as Record<string, unknown>;
    expect(Object.keys(gradientes)).toContain("gradGreen");
    // Origem: linear-gradient(135deg, #7DF7C6 0%, #25E19F 48%, #11B587 100%)
    const verde = gradientes.gradGreen as {
      angle?: number;
      stops?: { color: string; position?: number | null }[];
    };
    expect(verde.angle).toBe(135);
    expect(verde.stops?.map((stop) => stop.color)).toEqual([
      "#7DF7C6",
      ORIGEM.primary,
      "#11B587",
    ]);
  });

  it("a geometria do shell veio da variável do design system", () => {
    const shell = golden.layout?.shell as Record<string, Record<string, unknown>> | undefined;
    expect(shell?.sidebar?.width).toBe(ORIGEM.sidebarWidth);
    expect(shell?.sidebar?.position).toBe("left");
  });

  it("nenhuma medida de layout virou raio", () => {
    const radius = (golden.tokens?.radius ?? {}) as Record<string, unknown>;
    expect(Object.values(radius)).not.toContain(ORIGEM.sidebarWidth);
    expect(radius.pill).toBeUndefined();
  });
});

describe("o quanto a correção do analyzer recuperou (v1 → v2)", () => {
  const papeis = ["background", "surface", "border", "primary", "text", "textMuted"] as const;

  it("v1 não acertava NENHUM papel de cor; v2 acerta todos", () => {
    const acertos = (pack: ExperiencePack) =>
      papeis.filter(
        (papel) =>
          String((pack.tokens?.color ?? {})[papel] ?? "").toLowerCase() ===
          String(ORIGEM[papel]).toLowerCase(),
      ).length;
    expect(acertos(anterior)).toBe(0);
    expect(acertos(golden)).toBe(papeis.length);
  });

  it("v1 trocava o fundo do produto pela cor de uma barra de rolagem", () => {
    expect(anterior.tokens?.color?.background).toBe("#2c3145");
    expect(golden.tokens?.color?.background).toBe(ORIGEM.background);
  });

  it("v1 trazia a marca como um verde quase preto de texto", () => {
    expect(anterior.tokens?.color?.primary).toBe("#04130E");
    expect(golden.tokens?.color?.primary).toBe(ORIGEM.primary);
  });

  it("v1 perdia a tipografia num `font-family: inherit` truncado", () => {
    expect(anterior.tokens?.typography?.fontFamilyBase).toBe("inhe");
    expect(inspectExperience(anterior).dropped).toContain(
      "tokens.typography.fontFamilyBase",
    );
    expect(inspectExperience(golden).dropped).not.toContain(
      "tokens.typography.fontFamilyBase",
    );
  });

  it("v2 escreve mais variáveis no JumpFlow que v1", () => {
    expect(inspectExperience(golden).variableCount).toBeGreaterThan(
      inspectExperience(anterior).variableCount,
    );
  });
});

describe("o golden aplica no JumpFlow", () => {
  it("é aceito e legível", () => {
    const legibilidade = readabilityReport(golden);
    expect(legibilidade.ok).toBe(true);
    expect(legibilidade.ratio).toBeGreaterThan(9);
    expect(applyExperience(golden).ok).toBe(true);
  });

  it("troca o canvas claro do JumpFlow pelo escuro da origem", () => {
    applyExperience(golden);
    const style = document.documentElement.style;
    // JumpFlow original: --canvas #f7f5ea (bege quente). Golden: o fundo real.
    expect(style.getPropertyValue("--canvas")).toBe(ORIGEM.background);
    expect(style.getPropertyValue("--surface")).toBe(ORIGEM.surface);
    expect(style.getPropertyValue("--surface-muted")).toBe(ORIGEM.surfaceAlt);
    expect(style.getPropertyValue("--strong")).toBe(ORIGEM.text);
    expect(style.getPropertyValue("--medium")).toBe(ORIGEM.textMuted);
    expect(style.getPropertyValue("--border")).toBe(ORIGEM.border);
    // --ink deixa de ser tinta preta: a borda 2px e a sombra dura do Neo
    // Brutalism assumem a linha translúcida da origem.
    expect(style.getPropertyValue("--ink")).toBe(ORIGEM.border);
  });

  it("aplica a marca da origem no CTA, com o texto legível", () => {
    applyExperience(golden);
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--brand")).toBe(ORIGEM.primary);
    // O JumpFlow escreve `text-white` fixo no CTA: um verde claro precisa
    // escurecer para o rótulo continuar legível.
    const fill = style.getPropertyValue("--brand-fill");
    expect(fill).not.toBe("");
    expect(fill).not.toBe(ORIGEM.primary);
  });

  it("aplica a tipografia da origem", () => {
    applyExperience(golden);
    expect(document.documentElement.style.getPropertyValue("--font-geist-sans")).toBe(
      'Inter, "Segoe UI", system-ui, sans-serif',
    );
  });

  it("traz vidro, glow e gradiente reais da origem", () => {
    applyExperience(golden);
    const css = document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";
    expect(css).toContain("backdrop-filter: blur(12px)");
    expect(css).toContain("background-color: rgba(22,24,35,0.72)");
    expect(css).toContain("box-shadow: 0 24px 60px -28px rgba(37,225,159,0.45)");
    expect(css).toMatch(/background-image: (linear|radial)-gradient\(/);
  });

  it("traz a escala de raio e a duração de motion da origem", () => {
    applyExperience(golden);
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--radius-md")).toBe("10px");
    expect(style.getPropertyValue("--radius-panel")).not.toBe("");
    expect(style.getPropertyValue("--default-transition-duration")).toBe("150ms");
  });

  it("cobre um número relevante de tokens do JumpFlow", () => {
    const relatorio = inspectExperience(golden);
    expect(relatorio.variableCount).toBeGreaterThanOrEqual(24);
    expect(relatorio.ruleCount).toBeGreaterThanOrEqual(5);
  });
});

describe("gaps que seguem abertos (falham quando forem consertados)", () => {
  it("SCHEMA_GAP: um pack representa UM tema — não há light/dark", () => {
    expect(golden.tokens?.color).not.toHaveProperty("dark");
    expect(golden).not.toHaveProperty("themes");
  });

  it("SCHEMA_GAP: recipe de tema claro convive no mesmo pack", () => {
    // O repositório tem variantes `*-light.html`, e uma delas entrou como
    // variante de botão com fundo claro. Sem `themes`, não há como separar.
    const variantes = golden.components?.button?.variants ?? {};
    const claras = Object.values(variantes).filter(
      (recipe) => typeof recipe.background === "string" && /^#[EF]/i.test(recipe.background),
    );
    expect(claras.length).toBeGreaterThan(0);
  });

  it("CONSUMER_GAP: variantes do pack não são mapeadas nas do JumpFlow", () => {
    const variantes = Object.keys(golden.components?.button?.variants ?? {});
    expect(variantes).toContain("glass");
    applyExperience(golden);
    const css = document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";
    // O consumidor usa só a variante default do pack; `glass`/`outlined` não
    // viram variante de botão do JumpFlow.
    expect(css).not.toContain("exp-button--glass");
  });
});

describe("a segunda experiência real é RECUSADA (e isso é o certo)", () => {
  it("Governance Compass v1 sai ilegível: fundo #fff com texto quase branco", () => {
    // Mistura de tema claro e escuro no mesmo pack — a limitação "um tema por
    // pack" batendo num repositório que tem os dois. O consumidor recusa em vez
    // de deixar o JumpFlow branco no branco.
    expect(compass.tokens?.color?.background).toBe("#fff");
    expect(compass.tokens?.color?.text).toBe("#F3F0FF");
    const legibilidade = readabilityReport(compass);
    expect(legibilidade.ok).toBe(false);
    const resultado = applyExperience(compass);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.reason).toBe("unreadable-pack");
    expect(document.documentElement.getAttribute("style") ?? "").toBe("");
  });
});

describe("troca entre versões e volta ao original", () => {
  it("v1 → v2 → original, sem resíduo", () => {
    expect(applyExperience(anterior).ok).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--canvas")).toBe("#2c3145");
    expect(applyExperience(golden).ok).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--canvas")).toBe(ORIGEM.background);
    revertExperience();
    expect(document.documentElement.getAttribute("style") ?? "").toBe("");
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
  });
});
