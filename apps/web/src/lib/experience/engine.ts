/**
 * Theme Engine do JumpFlow — aplica e REVERTE uma experiência.
 *
 * Como aplica:
 * - **variáveis inline no `<html>`** (`style.setProperty`). Inline vence
 *   qualquer folha de estilo sem precisar de `!important`, então a experiência
 *   passa por cima do `:root` e do `[data-theme="dark"]` do JumpFlow sem
 *   duplicar paleta e sem tocar em componente;
 * - **um único `<style id="jf-experience">`** com as regras de efeito/receita
 *   geradas por `map.ts` (tabela fechada de seletor+propriedade).
 *
 * Como reverte: remove exatamente as variáveis que escreveu e o `<style>`. O
 * tema ORIGINAL do JumpFlow (light/dark por cookie) volta intacto porque nunca
 * foi alterado — só foi sobreposto.
 *
 * O que o engine NUNCA faz: `eval`, `new Function`, `innerHTML` com conteúdo do
 * pack, injetar JS, ou escrever propriedade CSS cujo nome venha do pack.
 */

import {
  buildRules,
  buildVariables,
  readabilityReport,
  rulesAreSafe,
  variablesAreSafe,
} from "./map";
import { manifestName, manifestSlug, schemaIsSupported } from "./pack";
import type { AppliedExperience, ExperiencePack } from "./types";

export const STYLE_ELEMENT_ID = "jf-experience";
export const SCOPE_ATTRIBUTE = "data-jf-experience";
const APPLIED_VARS_ATTRIBUTE = "data-jf-experience-vars";

export interface ApplyOptions {
  /** Documento alvo (testes passam o do jsdom). */
  doc?: Document;
  /** `false` = só tokens, sem a camada de efeitos/receitas. */
  effects?: boolean;
  /** Respeitar `prefers-reduced-motion` (default: sim). */
  respectReducedMotion?: boolean;
}

export type ApplyResult =
  | { ok: true; applied: AppliedExperience }
  | { ok: false; reason: ApplyFailure; detail: string };

export type ApplyFailure =
  | "no-document"
  | "unsupported-schema"
  | "unusable-pack"
  | "unreadable-pack"
  | "unsafe-output";

function root(doc: Document): HTMLElement {
  return doc.documentElement;
}

export function prefersReducedMotion(doc?: Document): boolean {
  const view = doc?.defaultView ?? (typeof window === "undefined" ? null : window);
  if (!view || typeof view.matchMedia !== "function") return false;
  try {
    return view.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Aplica a experiência. Nunca lança: devolve `ok: false` com motivo, e o
 * chamador decide (o provider volta ao tema original).
 */
export function applyExperience(
  pack: unknown,
  options: ApplyOptions = {},
): ApplyResult {
  const doc = options.doc ?? (typeof document === "undefined" ? null : document);
  if (!doc) {
    return { ok: false, reason: "no-document", detail: "sem DOM disponível" };
  }
  if (!schemaIsSupported(pack)) {
    const version =
      typeof pack === "object" && pack !== null
        ? String((pack as ExperiencePack).schemaVersion)
        : "ausente";
    return {
      ok: false,
      reason: "unsupported-schema",
      detail: `schemaVersion incompatível: ${version}`,
    };
  }
  const typed = pack as ExperiencePack;

  const legibilidade = readabilityReport(typed);
  const { variables, dropped } = buildVariables(typed);
  if (!variables["--canvas"] || !variables["--strong"]) {
    return {
      ok: false,
      reason: "unusable-pack",
      detail: "pack sem fundo/texto aplicáveis",
    };
  }
  if (!legibilidade.ok) {
    // Aplicar deixaria o produto ilegível: é falha, não estética.
    return {
      ok: false,
      reason: "unreadable-pack",
      detail: legibilidade.detail,
    };
  }

  const scope = manifestSlug(typed);
  const rules = options.effects === false ? "" : buildRules(typed, scope);
  if (!variablesAreSafe(variables) || !rulesAreSafe(rules)) {
    return {
      ok: false,
      reason: "unsafe-output",
      detail: "saída gerada contém construção proibida",
    };
  }

  const reduced =
    (options.respectReducedMotion ?? true) && prefersReducedMotion(doc);
  const finalVariables = { ...variables };
  if (reduced) {
    // Duração/easing da experiência ficam fora quando a pessoa pediu menos
    // movimento — o `globals.css` do JumpFlow já zera animação, e reintroduzir
    // duração aqui contrariaria a preferência do sistema.
    delete finalVariables["--default-transition-duration"];
    delete finalVariables["--default-transition-timing-function"];
  }

  // Remove o que uma experiência anterior tenha escrito antes de escrever a nova.
  revertExperience({ doc });

  const html = root(doc);
  for (const [name, value] of Object.entries(finalVariables)) {
    html.style.setProperty(name, value);
  }
  html.setAttribute(SCOPE_ATTRIBUTE, scope);
  html.setAttribute(APPLIED_VARS_ATTRIBUTE, Object.keys(finalVariables).join(" "));

  if (rules) {
    let style = doc.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
    if (!style) {
      style = doc.createElement("style");
      style.id = STYLE_ELEMENT_ID;
      doc.head.appendChild(style);
    }
    // `textContent` (nunca `innerHTML`): entra como texto de folha de estilo.
    style.textContent = rules;
  }

  const manifest = typed.manifest ?? {};
  return {
    ok: true,
    applied: {
      experienceId: Number.parseInt(String(manifest.id ?? "0"), 10) || 0,
      version: typeof manifest.version === "number" ? manifest.version : 0,
      slug: scope,
      name: manifestName(typed),
      variables: finalVariables,
      rules,
      dropped,
    },
  };
}

/** Volta ao tema original do JumpFlow. Idempotente. */
export function revertExperience(options: { doc?: Document } = {}): void {
  const doc = options.doc ?? (typeof document === "undefined" ? null : document);
  if (!doc) return;
  const html = root(doc);
  const applied = html.getAttribute(APPLIED_VARS_ATTRIBUTE);
  if (applied) {
    for (const name of applied.split(" ").filter(Boolean)) {
      html.style.removeProperty(name);
    }
  }
  html.removeAttribute(APPLIED_VARS_ATTRIBUTE);
  html.removeAttribute(SCOPE_ATTRIBUTE);
  const style = doc.getElementById(STYLE_ELEMENT_ID);
  if (style?.parentNode) style.parentNode.removeChild(style);
}

/** Diagnóstico para o switcher e para a análise de fidelidade. */
export function inspectExperience(pack: unknown): {
  supported: boolean;
  readability: ReturnType<typeof readabilityReport> | null;
  variableCount: number;
  ruleCount: number;
  dropped: string[];
} {
  if (!schemaIsSupported(pack)) {
    return {
      supported: false,
      readability: null,
      variableCount: 0,
      ruleCount: 0,
      dropped: [],
    };
  }
  const typed = pack as ExperiencePack;
  const { variables, dropped } = buildVariables(typed);
  const rules = buildRules(typed, manifestSlug(typed));
  return {
    supported: true,
    readability: readabilityReport(typed),
    variableCount: Object.keys(variables).length,
    ruleCount: rules ? rules.split("}").filter((part) => part.trim()).length : 0,
    dropped,
  };
}
