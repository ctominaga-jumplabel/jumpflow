/**
 * As DUAS tabelas fixas do consumidor.
 *
 * 1. `buildVariables()` — tokens do pack → variáveis CSS que o JumpFlow já usa
 *    (`--canvas`, `--surface`, `--strong`, `--brand`, `--ink`, `--radius-md`…).
 *    O `globals.css` do JumpFlow foi escrito para isso: a paleta é declarada em
 *    variáveis simples e o `@theme inline` mapeia cada token do Tailwind para
 *    `var(--…)`, então trocar as variáveis re-skina o app inteiro sem mexer em
 *    UM componente. Esta é a camada de maior alcance e a de menor risco.
 *
 * 2. `buildRules()` — efeitos e receitas → um conjunto FECHADO de regras CSS.
 *    Cada entrada declara o seletor (constante deste arquivo) e as propriedades
 *    (constantes deste arquivo). Do pack vem apenas VALOR, e só depois de passar
 *    por `validate.ts`.
 *
 * Invariantes (ARCHITECTURE.md → Security):
 * - nome de propriedade CSS nunca vem do pack;
 * - seletor nunca vem do pack (o único trecho dinâmico é o slug, saneado);
 * - nada de `eval`, `new Function`, `innerHTML` ou JS do pack;
 * - box-model (padding/height/width/gap) das receitas NÃO é aplicado: mudaria
 *   densidade de tabela e altura de linha, ou seja, comportamento de layout do
 *   JumpFlow. Skin sim, caixa não. Está registrado como gap deliberado em
 *   `docs/experience-registry/P6_CONSUMER_VALIDATION.md` (lado Jump Value).
 */

import {
  effectGroup,
  firstOf,
  leafNames,
  recipeOf,
  resolve,
  tokenGroup,
  tokenValue,
} from "./pack";
import type { ExperiencePack, GradientValue, ShadowValue } from "./types";
import * as v from "./validate";

export interface BuildResult {
  variables: Record<string, string>;
  dropped: string[];
}

const MIN_TEXT_CONTRAST = 4.5;
const MIN_FILL_CONTRAST = 3;

function asColor(pack: ExperiencePack, value: unknown): string | null {
  return v.color(resolve(pack, value));
}

// ── 1. Tokens → variáveis do JumpFlow ─────────────────────────────────────

export function buildVariables(pack: ExperiencePack): BuildResult {
  const variables: Record<string, string> = {};
  const dropped: string[] = [];
  const set = (name: string, value: string | null | undefined, origem: string) => {
    if (value) variables[name] = value;
    else dropped.push(origem);
  };

  const background = asColor(pack, tokenValue(pack, "color", "background"));
  const text = asColor(pack, tokenValue(pack, "color", "text"));
  const surface =
    asColor(pack, tokenValue(pack, "color", "surface")) ?? background;
  const surfaceAlt =
    asColor(pack, tokenValue(pack, "color", "surfaceAlt")) ??
    (surface && text ? v.mix(surface, text, 0.06) : null);
  const muted =
    asColor(pack, tokenValue(pack, "color", "textMuted")) ??
    (text && background ? v.mix(text, background, 0.35) : null);
  const border =
    asColor(pack, tokenValue(pack, "color", "border")) ??
    (text && background ? v.mix(text, background, 0.75) : null);
  const primary = asColor(pack, tokenValue(pack, "color", "primary"));
  const primaryContrast = asColor(
    pack,
    tokenValue(pack, "color", "primaryContrast"),
  );

  // Superfícies e texto — o núcleo da identidade.
  set("--canvas", background, "tokens.color.background");
  set("--background", background, "tokens.color.background");
  set("--surface", surface, "tokens.color.surface");
  set("--surface-muted", surfaceAlt, "tokens.color.surfaceAlt");
  set("--strong", text, "tokens.color.text");
  set("--foreground", text, "tokens.color.text");
  set("--medium", muted, "tokens.color.textMuted");
  set(
    "--soft",
    muted && background ? v.mix(muted, background, 0.28) : muted,
    "tokens.color.textMuted (derivado --soft)",
  );
  set("--border", border, "tokens.color.border");

  /*
   * `--ink` no JumpFlow governa a borda 2px E a sombra dura "brutalista" (usada
   * inline em ~45 componentes). Mapear a borda da experiência aqui é o que faz
   * o Neo Brutalism ceder o lugar à linguagem da experiência — sem tocar em
   * nenhum componente. É o mapeamento de maior impacto visual do consumidor.
   */
  set("--ink", border ?? text, "tokens.color.border (--ink)");

  // Ação / marca. O JumpFlow escreve texto branco fixo em CTA, então o
  // preenchimento precisa passar contraste — ver `readableFill`.
  if (primary) {
    const fill = v.readableFill(primary, MIN_FILL_CONTRAST);
    const onSurface =
      surface && v.contrastBetween(primary, surface) !== null &&
      (v.contrastBetween(primary, surface) as number) < 2.2
        ? (v.isLight(surface) ? v.darken(primary, 0.3) : v.lighten(primary, 0.35))
        : primary;
    set("--brand", onSurface ?? primary, "tokens.color.primary");
    set("--brand-fill", fill, "tokens.color.primary (--brand-fill)");
    set(
      "--brand-fill-hover",
      fill ? v.darken(fill, 0.12) : null,
      "tokens.color.primary (--brand-fill-hover)",
    );
    set(
      "--brand-dark",
      surface && v.isLight(surface)
        ? v.darken(primary, 0.25)
        : v.lighten(primary, 0.3),
      "tokens.color.primary (--brand-dark)",
    );
    set(
      "--brand-soft",
      v.withAlpha(primary, 0.18),
      "tokens.color.primary (--brand-soft)",
    );
  } else {
    dropped.push("tokens.color.primary");
  }
  if (primaryContrast) variables["--on-accent"] = primaryContrast;

  // Estados semânticos: o pack pode não ter todos; o que falta mantém o do
  // JumpFlow (não escrever a variável = herdar a original).
  for (const [role, cssVar] of [
    ["success", "--success"],
    ["warning", "--warning"],
    ["danger", "--danger"],
  ] as const) {
    const tone = asColor(pack, tokenValue(pack, "color", role));
    if (!tone) {
      dropped.push(`tokens.color.${role}`);
      continue;
    }
    variables[cssVar] = tone;
    const soft = v.withAlpha(tone, 0.16);
    if (soft) variables[`${cssVar}-soft`] = soft;
  }

  // Acentos "Playful Ops": alimentados pela paleta extra da experiência.
  const palette = tokenGroup(pack, "color").palette;
  const extras =
    typeof palette === "object" && palette !== null
      ? leafNames(palette as Record<string, unknown>)
          .map((name) => v.color((palette as Record<string, unknown>)[name]))
          .filter((tone): tone is string => tone !== null)
      : [];
  const accents = ["--flow", "--marker", "--cyan", "--accent"];
  extras.slice(0, accents.length).forEach((tone, index) => {
    variables[accents[index]] = tone;
  });

  // Tipografia. `--font-geist-sans`/`-mono` são as variáveis que o
  // `@theme inline` do JumpFlow aponta como fonte padrão do app.
  const family = v.fontFamily(tokenValue(pack, "typography", "fontFamilyBase"));
  const mono = v.fontFamily(tokenValue(pack, "typography", "fontFamilyMono"));
  if (family) {
    variables["--font-geist-sans"] = family;
    variables["--font-sans"] = family;
  } else {
    dropped.push("tokens.typography.fontFamilyBase");
  }
  if (mono) {
    variables["--font-geist-mono"] = mono;
    variables["--font-mono"] = mono;
  }

  /*
   * Raio. Duas situações no JumpFlow, e a diferença importa:
   * - `rounded-md/lg/xl` compilam para `var(--radius-*)` → basta trocar a variável;
   * - `--radius-panel` é consumido como `rounded-[var(--radius-panel)]` → também
   *   é variável em runtime, então entra aqui (direção Operational Minimal);
   * - `--radius-card` é `@theme inline` e foi INLINADO na utility em build, sem
   *   variável em runtime → só a camada de regras alcança (ver `buildRules`).
   */
  const radius = tokenGroup(pack, "radius");
  for (const [from, to] of [
    ["sm", "--radius-sm"],
    ["md", "--radius-md"],
    ["lg", "--radius-lg"],
    ["xl", "--radius-xl"],
  ] as const) {
    const value = v.dimension(resolve(pack, radius[from]));
    if (value) variables[to] = value;
  }
  const panelRadius = v.dimension(
    resolve(pack, firstOf(radius, ["lg", "md", "xl"])),
  );
  if (panelRadius) variables["--radius-panel"] = panelRadius;

  // Motion: as utilities de transição do Tailwind caem nestes dois defaults.
  const durations = pack.motion?.duration ?? {};
  const duration = v.duration(
    resolve(pack, firstOf(durations, ["fast", "normal", "slow"])) ??
      resolve(pack, firstOf(durations, leafNames(durations))),
  );
  if (duration) variables["--default-transition-duration"] = duration;
  const easing = v.easing(
    resolve(pack, (pack.motion?.easing ?? {})["standard"]) ??
      resolve(pack, firstOf(pack.motion?.easing ?? {}, leafNames(pack.motion?.easing ?? {}))),
  );
  if (easing) variables["--default-transition-timing-function"] = easing;

  return { variables, dropped };
}

/**
 * Legibilidade mínima: se texto e fundo da experiência não se separam, aplicar
 * deixaria o produto ILEGÍVEL. O consumidor recusa — é o caminho de fallback
 * exigido pelo contrato, não um detalhe estético.
 */
export function readabilityReport(pack: ExperiencePack): {
  ok: boolean;
  ratio: number | null;
  detail: string;
} {
  const background = v.color(tokenValue(pack, "color", "background"));
  const text = v.color(tokenValue(pack, "color", "text"));
  if (!background || !text) {
    return { ok: false, ratio: null, detail: "pack sem cor de fundo ou de texto" };
  }
  const ratio = v.contrastBetween(text, background);
  if (ratio === null) {
    return { ok: false, ratio: null, detail: "cores ilegíveis para o validador" };
  }
  return {
    ok: ratio >= MIN_TEXT_CONTRAST,
    ratio: Math.round(ratio * 100) / 100,
    detail:
      ratio >= MIN_TEXT_CONTRAST
        ? `contraste texto/fundo ${ratio.toFixed(2)}:1`
        : `contraste texto/fundo ${ratio.toFixed(2)}:1 (mínimo ${MIN_TEXT_CONTRAST}:1)`,
  };
}

// ── 2. Efeitos e receitas → regras CSS ────────────────────────────────────
// Seletores: constantes daqui, escolhidos sobre as classes que o design system
// do JumpFlow realmente usa (`docs/design-system.md`, `src/lib/styles.ts`).

function shadowCss(layers: ShadowValue[]): string | null {
  if (!layers.length) return null;
  return layers
    .map(
      (layer) =>
        `${layer.inset ? "inset " : ""}${layer.offsetX} ${layer.offsetY} ${layer.blur} ${layer.spread} ${layer.color}`,
    )
    .join(", ");
}

function gradientCss(gradient: GradientValue): string {
  const stops = gradient.stops
    .map((stop) =>
      stop.position === null || stop.position === undefined
        ? stop.color
        : `${stop.color} ${stop.position}%`,
    )
    .join(", ");
  return gradient.kind === "radial"
    ? `radial-gradient(circle at 50% 0%, ${stops})`
    : `linear-gradient(${gradient.angle}deg, ${stops})`;
}

interface Rule {
  selector: string;
  declarations: string[];
}

export function buildRules(pack: ExperiencePack, scope: string): string {
  const root = `html[data-jf-experience="${scope}"]`;
  const rules: Rule[] = [];
  const add = (selector: string, declarations: (string | null)[]) => {
    const clean = declarations.filter((item): item is string => Boolean(item));
    if (clean.length) rules.push({ selector, declarations: clean });
  };

  const glass = pack.effects?.glass;
  const glassBlur = glass ? v.dimension(resolve(pack, glass.backdropBlur)) : null;
  const glassBackground = glass ? asColor(pack, glass.background) : null;
  const glassBorder = glass ? asColor(pack, glass.borderColor) : null;
  const saturate = glass ? v.number(glass.saturate, 0, 4) : null;

  // (a) Fundo da página: gradiente da experiência.
  const gradients = effectGroup(pack, "gradient");
  const bodyGradient = v.gradient(
    resolve(
      pack,
      firstOf(gradients, ["body", "bodyGrad", "background", "canvas", "page"]) ??
        firstOf(gradients, leafNames(gradients)),
    ),
  );
  if (bodyGradient) {
    add(`${root} body`, [`background-image: ${gradientCss(bodyGradient)}`]);
  }

  // (b) Superfícies de vidro. `.bg-surface` é a classe de superfície do
  // JumpFlow (cards, sidebar, topbar, dropdowns, modais).
  if (glassBlur || glassBackground) {
    const filter = glassBlur
      ? `blur(${glassBlur})${saturate ? ` saturate(${Math.round(saturate * 100)}%)` : ""}`
      : null;
    add(`${root} .bg-surface`, [
      glassBackground ? `background-color: ${glassBackground}` : null,
      filter ? `backdrop-filter: ${filter}` : null,
      filter ? `-webkit-backdrop-filter: ${filter}` : null,
    ]);
  }

  // (c) Raio dos cards. `rounded-card` é `@theme inline` no JumpFlow, ou seja,
  // o valor foi INLINADO na utility em tempo de build — a variável não existe em
  // runtime. Sem esta regra, o raio do card é o único que a troca de tokens não
  // alcança. Gap registrado como CONSUMER_GAP/COMPONENT_ARCHITECTURE_GAP.
  const cardRadius = v.dimension(
    resolve(pack, firstOf(tokenGroup(pack, "radius"), ["lg", "md", "xl"])),
  );
  if (cardRadius) add(`${root} .rounded-card`, [`border-radius: ${cardRadius}`]);

  // (d) Botões: raio e a borda da experiência (a 2px de tinta cede lugar).
  const buttonRecipe = recipeOf(pack, "button");
  const buttonRadius = buttonRecipe
    ? v.dimension(resolve(pack, buttonRecipe.radius))
    : null;
  if (buttonRadius) {
    add(`${root} button, ${root} .rounded-md`, [
      `border-radius: ${buttonRadius}`,
    ]);
  }
  const borderWidth = buttonRecipe?.border
    ? v.border(resolve(pack, buttonRecipe.border))?.width
    : null;
  if (borderWidth) {
    add(`${root} .border-2.border-ink`, [`border-width: ${borderWidth}`]);
  }

  // (e) Campos de formulário: fundo/borda/raio da receita de input.
  const inputRecipe = recipeOf(pack, "input");
  if (inputRecipe) {
    const inputBackground = asColor(pack, inputRecipe.background);
    const inputBorder = v.border(resolve(pack, inputRecipe.border));
    const inputRadius = v.dimension(resolve(pack, inputRecipe.radius));
    const inputBorderColor =
      asColor(pack, inputRecipe.borderColor) ??
      (inputBorder && typeof inputBorder.color === "string"
        ? v.color(inputBorder.color)
        : null);
    add(`${root} input, ${root} select, ${root} textarea`, [
      inputBackground ? `background-color: ${inputBackground}` : null,
      inputBorderColor ? `border-color: ${inputBorderColor}` : null,
      inputRadius ? `border-radius: ${inputRadius}` : null,
    ]);
  }

  // (f) Sombra de superfície: aplicada a cards/painéis, NÃO a botões — a sombra
  // dura do botão do JumpFlow é o feedback de "pressionado", que é affordance
  // funcional. Trocar cor dela já acontece via `--ink`.
  const cardRecipe = recipeOf(pack, "card") ?? recipeOf(pack, "panel");
  const cardShadow = cardRecipe
    ? shadowCss(v.shadowList(resolve(pack, cardRecipe.shadow)))
    : null;
  if (cardShadow) {
    add(`${root} .rounded-card`, [`box-shadow: ${cardShadow}`]);
  }

  // (g) Glow da marca sobre o CTA preenchido.
  const glow = effectGroup(pack, "glow");
  const glowShadow = shadowCss(
    v.shadowList(resolve(pack, firstOf(glow, leafNames(glow)))),
  );
  if (glowShadow) {
    add(`${root} .bg-brand-fill`, [`box-shadow: ${glowShadow}`]);
  }

  // (h) Borda de vidro nas superfícies com linha suave.
  if (glassBorder) {
    add(`${root} .border-border`, [`border-color: ${glassBorder}`]);
  }

  return rules
    .map(
      (rule) =>
        `${rule.selector} {\n  ${rule.declarations.join(";\n  ")};\n}`,
    )
    .join("\n");
}

/**
 * Última linha de defesa da saída: nada do que estas tabelas emitem pode conter
 * `<`, `@import`, `javascript:`, `expression(` ou `url(`. A presença de um
 * desses significa bug nosso — e a resposta certa é não aplicar nada.
 */
const FORBIDDEN = /(<|@import|javascript:|expression\s*\(|url\s*\()/i;

export function rulesAreSafe(css: string): boolean {
  return !FORBIDDEN.test(css);
}

export function variablesAreSafe(variables: Record<string, string>): boolean {
  return Object.entries(variables).every(
    ([name, value]) =>
      /^--[a-z0-9-]+$/.test(name) && !FORBIDDEN.test(value) && !value.includes(";"),
  );
}
