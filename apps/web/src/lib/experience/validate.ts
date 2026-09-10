/**
 * Validação de tipo do lado do CONSUMIDOR — defesa em profundidade.
 *
 * O Jump Value já valida o pack ao gravá-lo (`pack_schema.py`). Validar de novo
 * aqui não é redundância: é a regra do contrato de consumo
 * (`ARCHITECTURE.md` → Consumer Architecture) — "nunca aplica valor sem passar
 * pelo próprio validador de tipo". O JumpFlow não sabe (e não deveria precisar
 * saber) se o pack veio de um registro atualizado, de um cache antigo em
 * `localStorage` ou de um proxy mal configurado.
 *
 * Regras:
 * - o que não casa o tipo é DESCARTADO (nunca escapado, nunca "corrigido");
 * - nada aqui aceita string de CSS livre;
 * - sombra e gradiente são objetos estruturados, remontados campo a campo.
 */

import type {
  BorderValue,
  GradientValue,
  ShadowValue,
  TokenRef,
} from "./types";

const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const COLOR_FN =
  /^(rgb|rgba|hsl|hsla)\(\s*(-?\d{1,3}(?:\.\d+)?%?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?%?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?%?)\s*(?:[,/]\s*(0|1|0?\.\d{1,4}|\d{1,3}%)\s*)?\)$/;
const DIMENSION = /^-?(?:\d{1,5}(?:\.\d{1,4})?|\.\d{1,4})(px|rem|em|%|vh|vw|vmin|vmax|ch|pt)?$/;
const DURATION = /^(?:\d{1,5}(?:\.\d{1,3})?|\.\d{1,3})(ms|s)$/;
const FONT_ITEM = /^[A-Za-z][A-Za-z0-9 _+-]{0,39}$/;
const REF_PATH = /^[A-Za-z][A-Za-z0-9]{0,39}(\.[A-Za-z][A-Za-z0-9]{0,39}){0,4}$/;

const NAMED_COLORS = new Set([
  "transparent",
  "currentcolor",
  "black",
  "white",
  "red",
  "green",
  "blue",
  "orange",
  "purple",
  "gray",
  "grey",
  "yellow",
  "teal",
  "cyan",
  "pink",
  "navy",
  "indigo",
  "violet",
]);

const GENERIC_FAMILIES = new Set([
  "sans-serif",
  "serif",
  "monospace",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded",
  "cursive",
  "fantasy",
  "-apple-system",
  "blinkmacsystemfont",
  "emoji",
  "math",
]);

/**
 * Palavras-chave CSS que NÃO são família de fonte. Sem esta lista, um
 * `font-family: inherit` do repositório de origem viraria a fonte do produto
 * consumidor — e foi exatamente o que o primeiro pack real trouxe.
 */
const NOT_A_FONT = new Set([
  "inherit",
  "initial",
  "unset",
  "revert",
  "none",
  "auto",
  "normal",
  "inhe",
]);

const BORDER_STYLES = new Set([
  "none",
  "solid",
  "dashed",
  "dotted",
  "double",
  "groove",
  "ridge",
  "inset",
  "outset",
]);

const NAMED_EASINGS = new Set([
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "step-start",
  "step-end",
]);

export function isRef(value: unknown): value is TokenRef {
  if (typeof value !== "object" || value === null) return false;
  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.length !== 1 || keys[0] !== "token") return false;
  const target = (value as TokenRef).token;
  return typeof target === "string" && REF_PATH.test(target.trim());
}

export function color(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (raw.length > 60) return null;
  if (HEX.test(raw)) return raw;
  if (NAMED_COLORS.has(raw.toLowerCase())) return raw.toLowerCase();
  const match = COLOR_FN.exec(raw.replace(/\s*,\s*/g, ","));
  if (!match) return null;
  // Remontado a partir dos grupos: o que sai nunca é a string de entrada.
  let fn = match[1].toLowerCase();
  const alpha = match[5];
  if (alpha !== undefined && (fn === "rgb" || fn === "hsl")) fn += "a";
  const parts = [match[2], match[3], match[4]];
  return alpha === undefined
    ? `${fn}(${parts.join(",")})`
    : `${fn}(${parts.join(",")},${alpha})`;
}

export function dimension(value: unknown, allowNegative = false): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (!allowNegative && value < 0) return null;
    return value === 0 ? "0" : `${value}px`;
  }
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (!DIMENSION.test(raw)) return null;
  if (!allowNegative && raw.startsWith("-")) return null;
  if (raw === "0" || raw === "-0") return "0";
  // Número puro diferente de zero exige unidade.
  if (/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)) return null;
  return raw;
}

export function duration(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >= 0 && value <= 60000 ? `${Math.round(value)}ms` : null;
  }
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  return DURATION.test(raw) ? raw : null;
}

export function number(
  value: unknown,
  min = -10000,
  max = 10000,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

export function fontFamily(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 240) return null;
  const items: string[] = [];
  for (const raw of value.split(",")) {
    const item = raw.trim().replace(/^['"]|['"]$/g, "").trim();
    if (!item || !FONT_ITEM.test(item)) continue;
    if (NOT_A_FONT.has(item.toLowerCase())) continue;
    if (GENERIC_FAMILIES.has(item.toLowerCase())) items.push(item.toLowerCase());
    else if (/[ +]/.test(item)) items.push(`"${item.replace(/\+/g, " ").trim()}"`);
    else items.push(item);
    if (items.length >= 8) break;
  }
  const unique = [...new Set(items)];
  return unique.length ? unique.join(", ") : null;
}

export function shadow(value: unknown): ShadowValue | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const tone = color(raw.color);
  if (!tone) return null;
  return {
    offsetX: dimension(raw.offsetX ?? "0", true) ?? "0",
    offsetY: dimension(raw.offsetY ?? "0", true) ?? "0",
    blur: dimension(raw.blur ?? "0") ?? "0",
    spread: dimension(raw.spread ?? "0", true) ?? "0",
    color: tone,
    inset: Boolean(raw.inset),
  };
}

export function shadowList(value: unknown): ShadowValue[] {
  const source = Array.isArray(value) ? value : [value];
  return source
    .slice(0, 4)
    .map((layer) => shadow(layer))
    .filter((layer): layer is ShadowValue => layer !== null);
}

export function gradient(value: unknown): GradientValue | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const kind = String(raw.kind ?? "linear").toLowerCase();
  if (kind !== "linear" && kind !== "radial") return null;
  const angle = number(raw.angle, 0, 360) ?? 180;
  const stops = Array.isArray(raw.stops) ? raw.stops : [];
  const parsed = stops
    .slice(0, 8)
    .map((stop) => {
      if (typeof stop !== "object" || stop === null) return null;
      const item = stop as Record<string, unknown>;
      const tone = color(item.color);
      if (!tone) return null;
      const position = number(item.position, 0, 100);
      return { color: tone, position: position ?? null };
    })
    .filter((stop): stop is { color: string; position: number | null } => stop !== null);
  if (parsed.length < 2) return null;
  return { kind, angle, stops: parsed };
}

export function border(value: unknown): BorderValue | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const tone = isRef(raw.color) ? raw.color : color(raw.color);
  if (!tone) return null;
  const style = String(raw.style ?? "solid").toLowerCase();
  return {
    width: dimension(raw.width ?? "1px") ?? "1px",
    style: BORDER_STYLES.has(style) ? style : "solid",
    color: tone,
  };
}

export function easing(value: unknown): string | null {
  if (typeof value === "string") {
    const raw = value.trim().toLowerCase();
    return NAMED_EASINGS.has(raw) ? raw : null;
  }
  if (!Array.isArray(value) || value.length !== 4) return null;
  const parts = value.map((part) => number(part, -2, 2));
  if (parts.some((part) => part === null)) return null;
  return `cubic-bezier(${parts.join(", ")})`;
}

// ── Cor: leitura numérica, contraste e derivações ──────────────────────────
// O consumidor precisa disto porque o JumpFlow tem pares de token que o pack
// não tem (`-soft`, `-fill-hover`, `--soft`) e porque CTA do JumpFlow usa texto
// branco fixo: sem checar contraste, uma experiência de acento claro deixaria o
// rótulo do botão ilegível. Derivar aqui é derivar DA experiência, nunca inventar
// cor de fora dela.

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function toRgba(value: string): Rgba | null {
  const tone = color(value);
  if (!tone) return null;
  if (tone.startsWith("#")) {
    let hex = tone.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = hex
        .split("")
        .map((char) => char + char)
        .join("");
    }
    if (hex.length !== 6 && hex.length !== 8) return null;
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
    if ([r, g, b].some((channel) => Number.isNaN(channel))) return null;
    return { r, g, b, a };
  }
  const match = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(tone);
  if (!match) return null;
  const parts = match[2].split(",").map((part) => part.trim());
  if (parts.length < 3) return null;
  if (match[1].startsWith("hsl")) {
    const h = ((Number.parseFloat(parts[0]) % 360) + 360) % 360;
    const s = Number.parseFloat(parts[1]) / 100;
    const l = Number.parseFloat(parts[2]) / 100;
    const a = parts[3] ? parseAlpha(parts[3]) : 1;
    if ([h, s, l].some((value) => Number.isNaN(value))) return null;
    return { ...hslToRgb(h, s, l), a };
  }
  const channels = parts.slice(0, 3).map((part) =>
    part.endsWith("%")
      ? Math.round((Number.parseFloat(part) * 255) / 100)
      : Number.parseFloat(part),
  );
  if (channels.some((channel) => Number.isNaN(channel))) return null;
  const a = parts[3] ? parseAlpha(parts[3]) : 1;
  return { r: channels[0], g: channels[1], b: channels[2], a };
}

function parseAlpha(raw: string): number {
  const value = raw.endsWith("%")
    ? Number.parseFloat(raw) / 100
    : Number.parseFloat(raw);
  if (Number.isNaN(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

function hslToRgb(h: number, s: number, l: number): Omit<Rgba, "a"> {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

export function rgbaString({ r, g, b, a }: Rgba): string {
  const round = (value: number) => Math.min(255, Math.max(0, Math.round(value)));
  return a >= 0.999
    ? `rgb(${round(r)},${round(g)},${round(b)})`
    : `rgba(${round(r)},${round(g)},${round(b)},${Math.round(a * 1000) / 1000})`;
}

export function withAlpha(value: string, alpha: number): string | null {
  const rgba = toRgba(value);
  if (!rgba) return null;
  return rgbaString({ ...rgba, a: Math.min(1, Math.max(0, alpha)) });
}

export function luminance({ r, g, b }: Rgba): number {
  const channel = (raw: number) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: Rgba, b: Rgba): number {
  const la = luminance(a);
  const lb = luminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

export function contrastBetween(a: string, b: string): number | null {
  const first = toRgba(a);
  const second = toRgba(b);
  if (!first || !second) return null;
  return contrast(first, second);
}

/** Mistura duas cores (peso 0..1 do segundo termo). Usada só para derivar. */
export function mix(base: string, other: string, weight: number): string | null {
  const a = toRgba(base);
  const b = toRgba(other);
  if (!a || !b) return null;
  const w = Math.min(1, Math.max(0, weight));
  return rgbaString({
    r: a.r + (b.r - a.r) * w,
    g: a.g + (b.g - a.g) * w,
    b: a.b + (b.b - a.b) * w,
    a: a.a + (b.a - a.a) * w,
  });
}

export function darken(value: string, amount: number): string | null {
  return mix(value, "#000000", amount);
}

export function lighten(value: string, amount: number): string | null {
  return mix(value, "#ffffff", amount);
}

export function isLight(value: string): boolean {
  const rgba = toRgba(value);
  return rgba ? luminance(rgba) > 0.5 : false;
}

/**
 * Ajusta uma cor de PREENCHIMENTO até o texto branco atingir o contraste
 * mínimo. O JumpFlow escreve `text-white` fixo em CTA (`ActionButton`,
 * `Topbar`), então um acento claro precisa escurecer — senão o rótulo desaparece.
 * Devolve a cor original quando já passa.
 */
export function readableFill(value: string, minimum = 3): string | null {
  let current = color(value);
  if (!current) return null;
  for (let step = 0; step < 12; step += 1) {
    const ratio = contrastBetween(current, "#ffffff");
    if (ratio === null) return null;
    if (ratio >= minimum) return current;
    const darker = darken(current, 0.12);
    if (!darker) return current;
    current = darker;
  }
  return current;
}
