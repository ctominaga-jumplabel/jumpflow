/**
 * Leitura segura do Experience Pack: resolução de referência e getters.
 *
 * `{ token: "color.primary" }` é resolvido contra `tokens`/`effects`/`motion` do
 * próprio pack, com teto de profundidade (referência cíclica devolve `null` em
 * vez de travar). Nada aqui aplica estilo — só lê.
 */

import { SUPPORTED_SCHEMA_MAJOR } from "./types";
import type { ExperiencePack, TokenGroup } from "./types";
import { isRef } from "./validate";

const MAX_DEPTH = 6;

export function schemaIsSupported(pack: unknown): boolean {
  if (typeof pack !== "object" || pack === null) return false;
  const version = (pack as ExperiencePack).schemaVersion;
  if (typeof version !== "string") return false;
  const major = Number.parseInt(version.split(".")[0] ?? "", 10);
  return Number.isInteger(major) && major === SUPPORTED_SCHEMA_MAJOR;
}

/** Resolve um caminho (`color.primary`, `motion.duration.fast`) numa folha. */
export function resolvePath(
  pack: ExperiencePack,
  path: string,
  depth = 0,
): unknown {
  if (depth > MAX_DEPTH || !path) return null;
  const parts = path.split(".");
  const roots: string[][] =
    parts[0] === "tokens" || parts[0] === "effects" || parts[0] === "motion"
      ? [[]]
      : [["tokens"], ["effects"], ["motion"]];
  for (const root of roots) {
    let node: unknown = pack;
    let found = true;
    for (const key of [...root, ...parts]) {
      if (typeof node !== "object" || node === null || !(key in node)) {
        found = false;
        break;
      }
      node = (node as Record<string, unknown>)[key];
    }
    if (!found || node === null || node === undefined) continue;
    if (isRef(node)) return resolvePath(pack, node.token, depth + 1);
    // Aponta para um grupo, não para uma folha.
    if (typeof node === "object" && node !== null && "$type" in node) return null;
    return node;
  }
  return null;
}

/** Referência → valor; literal → ele mesmo. */
export function resolve(pack: ExperiencePack, value: unknown): unknown {
  return isRef(value) ? resolvePath(pack, value.token) : value;
}

export function tokenGroup(
  pack: ExperiencePack,
  group: keyof NonNullable<ExperiencePack["tokens"]>,
): TokenGroup {
  const tokens = pack.tokens ?? {};
  const node = tokens[group];
  return typeof node === "object" && node !== null ? (node as TokenGroup) : {};
}

/** Folha de um grupo de token (`color`, `text`) já com referência resolvida. */
export function tokenValue(
  pack: ExperiencePack,
  group: keyof NonNullable<ExperiencePack["tokens"]>,
  name: string,
): unknown {
  const value = tokenGroup(pack, group)[name];
  return value === undefined ? null : resolve(pack, value);
}

export function effectGroup(pack: ExperiencePack, group: string): TokenGroup {
  const effects = (pack.effects ?? {}) as Record<string, unknown>;
  const node = effects[group];
  return typeof node === "object" && node !== null ? (node as TokenGroup) : {};
}

/** Primeira folha de um grupo (ordem de preferência de nomes). */
export function firstOf(group: TokenGroup, names: string[]): unknown {
  for (const name of names) {
    const value = group[name];
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

/** Nomes de folha de um grupo, sem os metadados (`$type`). */
export function leafNames(group: TokenGroup): string[] {
  return Object.keys(group).filter((key) => key !== "$type");
}

export function recipeOf(
  pack: ExperiencePack,
  component: string,
  variant?: string,
) {
  const definition = pack.components?.[component];
  if (!definition || typeof definition.variants !== "object") return null;
  const name = variant ?? definition.default;
  const recipe =
    definition.variants[name] ??
    definition.variants[Object.keys(definition.variants)[0] ?? ""];
  return recipe ?? null;
}

export function manifestName(pack: ExperiencePack): string {
  const name = pack.manifest?.name;
  return typeof name === "string" && name.trim() ? name.trim() : "Experiência";
}

export function manifestSlug(pack: ExperiencePack): string {
  const slug = pack.manifest?.slug;
  return typeof slug === "string" && /^[a-z0-9-]{1,140}$/.test(slug)
    ? slug
    : "experiencia";
}
