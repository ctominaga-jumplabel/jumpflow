/**
 * Validação de tipo do consumidor.
 *
 * O pack descreve o visual de OUTRA aplicação e chega por API/cache. Cada caso
 * hostil aqui é um caminho pelo qual, sem validação, um valor de repositório de
 * terceiro entraria numa folha de estilo do JumpFlow.
 */

import { describe, expect, it } from "vitest";
import * as v from "./validate";

describe("cor", () => {
  it("aceita as formas válidas e devolve remontado", () => {
    expect(v.color("#25E19F")).toBe("#25E19F");
    expect(v.color("rgba(37, 225, 159, 0.25)")).toBe("rgba(37,225,159,0.25)");
    expect(v.color("transparent")).toBe("transparent");
  });

  it.each([
    "red; } body { display: none }",
    "url(javascript:alert(1))",
    "expression(alert(1))",
    "var(--x)",
    "#zzzzzz",
    "</style><script>alert(1)</script>",
    "rgb(1,2,3) !important",
  ])("descarta valor hostil: %s", (hostile) => {
    expect(v.color(hostile)).toBeNull();
  });
});

describe("dimensão e duração", () => {
  it("aceita medida com unidade e zero", () => {
    expect(v.dimension("14px")).toBe("14px");
    expect(v.dimension(".5rem")).toBe(".5rem");
    expect(v.dimension(0)).toBe("0");
  });

  it("recusa número sem unidade, calc e negativo por padrão", () => {
    expect(v.dimension("14")).toBeNull();
    expect(v.dimension("calc(100% - 4px)")).toBeNull();
    expect(v.dimension("-4px")).toBeNull();
    expect(v.dimension("-4px", true)).toBe("-4px");
  });

  it("valida duração em ms/s", () => {
    expect(v.duration("150ms")).toBe("150ms");
    expect(v.duration(".4s")).toBe(".4s");
    expect(v.duration("150")).toBeNull();
    expect(v.duration("150ms; color:red")).toBeNull();
  });
});

describe("família de fonte", () => {
  it("remonta a lista com aspas nossas", () => {
    expect(v.fontFamily("Inter Tight, 'DM Sans', system-ui, sans-serif")).toBe(
      '"Inter Tight", "DM Sans", system-ui, sans-serif',
    );
  });

  it("recusa palavra-chave CSS que não é fonte", () => {
    // O primeiro pack real trouxe `fontFamilyBase: "inhe"` — resto de um
    // `font-family: inherit` do repositório de origem. Aplicar isso trocaria a
    // fonte do JumpFlow por uma família inexistente.
    expect(v.fontFamily("inhe")).toBeNull();
    expect(v.fontFamily("inherit")).toBeNull();
    expect(v.fontFamily("initial, sans-serif")).toBe("sans-serif");
  });

  it("descarta item hostil e mantém o resto", () => {
    expect(v.fontFamily("Inter, }body{display:none}, serif")).toBe("Inter, serif");
  });
});

describe("sombra e gradiente", () => {
  it("exige objeto estruturado, não string de CSS", () => {
    expect(v.shadow("0 2px 4px rgba(0,0,0,.2)")).toBeNull();
    expect(
      v.shadow({ offsetY: "2px", blur: "4px", color: "rgba(0,0,0,0.2)" }),
    ).toEqual({
      offsetX: "0",
      offsetY: "2px",
      blur: "4px",
      spread: "0",
      color: "rgba(0,0,0,0.2)",
      inset: false,
    });
  });

  it("descarta sombra sem cor válida", () => {
    expect(v.shadow({ offsetY: "2px", color: "red; }" })).toBeNull();
  });

  it("gradiente exige duas paradas", () => {
    expect(
      v.gradient({ kind: "linear", angle: 135, stops: [{ color: "#fff" }] }),
    ).toBeNull();
    const ok = v.gradient({
      kind: "linear",
      angle: 999,
      stops: [{ color: "#fff", position: 0 }, { color: "#000" }],
    });
    expect(ok?.angle).toBe(180);
    expect(ok?.stops).toHaveLength(2);
  });
});

describe("referência a token", () => {
  it("reconhece só a forma exata", () => {
    expect(v.isRef({ token: "color.primary" })).toBe(true);
    expect(v.isRef({ token: "color.primary'); }" })).toBe(false);
    expect(v.isRef({ token: "color.primary", extra: 1 })).toBe(false);
    expect(v.isRef("color.primary")).toBe(false);
  });
});

describe("contraste e derivação", () => {
  it("mede contraste WCAG", () => {
    expect(v.contrastBetween("#000000", "#ffffff")).toBeCloseTo(21, 0);
    const ratio = v.contrastBetween("rgba(255,255,255,0.95)", "#2c3145");
    expect(ratio).not.toBeNull();
    expect(ratio as number).toBeGreaterThan(4.5);
  });

  it("escurece preenchimento claro até o texto branco ficar legível", () => {
    const fill = v.readableFill("#7DF7C6", 3);
    expect(fill).not.toBeNull();
    expect(v.contrastBetween(fill as string, "#ffffff") as number).toBeGreaterThanOrEqual(3);
  });

  it("mantém preenchimento que já passa", () => {
    expect(v.readableFill("#1237b8", 3)).toBe("#1237b8");
  });

  it("aplica alfa preservando o canal", () => {
    expect(v.withAlpha("#25E19F", 0.18)).toBe("rgba(37,225,159,0.18)");
  });
});
