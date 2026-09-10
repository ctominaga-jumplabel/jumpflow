/**
 * GOLDEN EXPERIENCE — medição contra o pack REAL, extraído de um repositório
 * Jump de verdade pelo analyzer do Jump Value (P6, item 1).
 *
 * Fixture: `fixtures/pack-1-v1.json`
 *   MigrateMind — Dark Tech Glass
 *   github.com/ctominaga-jump/MigrateMind @ c03fd18c (branch feat/migrate-mcp-f4)
 *   Experience #1 · slug migratemind-dark-tech-glass · versão 1 · published
 *
 * Estes testes NÃO são de fachada: metade deles registra o que a extração ainda
 * ERRA. Quando o analyzer/normalizer melhorar (P6.1), eles falham — e é assim
 * que a melhoria fica medida em vez de anunciada. Cada gap tem a classificação
 * usada em `docs/experience-registry/P6_CONSUMER_VALIDATION.md` (Jump Value).
 */

import { beforeEach, describe, expect, it } from "vitest";
import goldenFixture from "./fixtures/pack-1-v1.json";
import compassFixture from "./fixtures/pack-2-v1.json";
import { STYLE_ELEMENT_ID, applyExperience, inspectExperience, revertExperience } from "./engine";
import { readabilityReport } from "./map";
import type { ExperiencePack } from "./types";

const golden = (goldenFixture as { pack: ExperiencePack }).pack;
const compass = (compassFixture as { pack: ExperiencePack }).pack;

beforeEach(() => {
  revertExperience();
  document.documentElement.removeAttribute("style");
});

describe("procedência do golden", () => {
  it("é o pack publicado do repositório real, com commit", () => {
    expect(golden.schemaVersion).toBe("1.0");
    expect(golden.manifest?.slug).toBe("migratemind-dark-tech-glass");
    expect(golden.manifest?.version).toBe(1);
    expect(golden.manifest?.source?.provider).toBe("github");
    expect(golden.manifest?.source?.repository).toContain("MigrateMind");
    expect(golden.manifest?.source?.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(golden.manifest?.classification).toEqual([
      "Dark Tech",
      "Glassmorphism",
      "Skeuomorphic",
    ]);
  });

  it("declara a extração 100% determinística (sem IA)", () => {
    const generator = (golden.manifest as unknown as Record<string, unknown>)
      .generator as { mode?: string; ai?: { status?: string } } | undefined;
    expect(generator?.mode).toBe("static");
    expect(generator?.ai?.status).toBe("disabled");
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
    // JumpFlow original: --canvas #f7f5ea (bege quente). Golden: escuro.
    expect(style.getPropertyValue("--canvas")).toBe("#2c3145");
    expect(style.getPropertyValue("--strong")).toBe("rgba(255,255,255,0.95)");
    expect(style.getPropertyValue("--medium")).toBe("rgba(255,255,255,0.62)");
    expect(style.getPropertyValue("--border")).toBe("rgba(37,225,159,0.25)");
    // --ink deixa de ser tinta preta: a borda 2px e a sombra dura do Neo
    // Brutalism assumem o verde translúcido da origem.
    expect(style.getPropertyValue("--ink")).toBe("rgba(37,225,159,0.25)");
  });

  it("traz vidro, glow e gradiente reais da origem", () => {
    applyExperience(golden);
    const css = document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";
    expect(css).toContain("backdrop-filter: blur(12px)");
    expect(css).toContain("background-color: rgba(44,49,69,0.72)");
    expect(css).toContain("box-shadow: 0 24px 60px -28px rgba(37,225,159,0.45)");
    expect(css).toMatch(/background-image: (linear|radial)-gradient\(/);
  });

  it("traz a escala de raio e a duração de motion da origem", () => {
    applyExperience(golden);
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--radius-md")).toBe("8px");
    expect(style.getPropertyValue("--radius-lg")).toBe("10px");
    expect(style.getPropertyValue("--default-transition-duration")).toBe("150ms");
  });

  it("cobre um número relevante de tokens do JumpFlow", () => {
    const relatorio = inspectExperience(golden);
    expect(relatorio.variableCount).toBeGreaterThanOrEqual(18);
    expect(relatorio.ruleCount).toBeGreaterThanOrEqual(5);
  });
});

describe("gaps medidos no golden (falham quando P6.1 consertar)", () => {
  it("NORMALIZER_GAP: a cor de marca da origem (#25E19F) não virou primary", () => {
    // A origem declara `--green: #25E19F` como marca. O normalizer não casa
    // "green" com o papel `primary` e caiu no fallback por saturação, que
    // escolheu um verde quase preto usado como texto sobre o acento.
    expect(golden.tokens?.color?.primary).toBe("#04130E");
    expect(golden.tokens?.color?.primary).not.toBe("#25E19F");
  });

  it("NORMALIZER_GAP: surface e background saíram iguais (origem tem 4 níveis)", () => {
    // brand.css tem --bg-0 #090B15, --surface #161823, --surface-2, --surface-3.
    expect(golden.tokens?.color?.surface).toBe(golden.tokens?.color?.background);
  });

  it("ANALYZER_GAP: fontFamilyBase veio de um `font-family: inherit` truncado", () => {
    // "inhe" é resto de `inherit`; o consumidor DESCARTA e mantém a fonte do
    // JumpFlow — degradação correta, mas a tipografia da origem foi perdida.
    expect(golden.tokens?.typography?.fontFamilyBase).toBe("inhe");
    applyExperience(golden);
    expect(document.documentElement.style.getPropertyValue("--font-geist-sans")).toBe("");
    expect(inspectExperience(golden).dropped).toContain(
      "tokens.typography.fontFamilyBase",
    );
  });

  it("LAYOUT_GAP: a largura da sidebar da origem (256px) não chegou ao layout", () => {
    const shell = golden.layout?.shell as Record<string, Record<string, unknown>> | undefined;
    expect(golden.layout?.present).toBe(true);
    expect(shell?.sidebar?.position).toBe("left");
    expect(shell?.sidebar?.width).toBeUndefined();
  });

  it("SCHEMA_GAP: um pack representa UM tema — não há light/dark", () => {
    expect(golden.tokens?.color).not.toHaveProperty("dark");
    expect(golden).not.toHaveProperty("themes");
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
    // E o JumpFlow fica com o tema dele, intacto.
    expect(document.documentElement.getAttribute("style") ?? "").toBe("");
  });
});

describe("troca entre as duas e volta ao original", () => {
  it("golden → original → golden, sem resíduo", () => {
    expect(applyExperience(golden).ok).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--canvas")).toBe("#2c3145");
    revertExperience();
    expect(document.documentElement.getAttribute("style") ?? "").toBe("");
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
    expect(applyExperience(golden).ok).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--canvas")).toBe("#2c3145");
  });
});
