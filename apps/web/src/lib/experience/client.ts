/**
 * Cliente do Experience Registry — busca, cache e fallback.
 *
 * O navegador NÃO fala com o Jump Value direto: fala com o BFF do próprio
 * JumpFlow (`/api/experience`). Dois motivos, os dois de contrato:
 * - a API do Jump Value exige sessão e só libera CORS para a própria origem;
 * - o token de leitura é de servidor, e servidor é onde ele fica.
 *
 * Cache: `localStorage`, por (experiência, versão) — pack é imutável por versão,
 * então cache não invalida por conteúdo, só por idade. Em falha de rede o cache
 * VELHO é servido de propósito (melhor a experiência de ontem do que nenhuma);
 * se não houver cache, o chamador cai no tema original.
 */

import { schemaIsSupported } from "./pack";
import type { ExperiencePack, ExperienceSummary } from "./types";

const CACHE_PREFIX = "jf-experience-pack:";
const SELECTION_KEY = "jf-experience-selection";
const LIST_CACHE_KEY = "jf-experience-list";
const FRESH_MS = 24 * 60 * 60 * 1000;

export interface Selection {
  id: number;
  version: number;
}

export interface PackResult {
  pack: ExperiencePack | null;
  source: "network" | "cache" | "stale-cache" | "none";
  detail?: string;
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    // Modo privado / cookies bloqueados: cache simplesmente não existe.
    return null;
  }
}

function readJson<T>(key: string): T | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // Cota estourada: seguir sem cache é degradação aceitável.
  }
}

export function readSelection(): Selection | null {
  const raw = readJson<Selection>(SELECTION_KEY);
  if (!raw || typeof raw.id !== "number" || typeof raw.version !== "number") {
    return null;
  }
  return { id: raw.id, version: raw.version };
}

export function writeSelection(selection: Selection | null): void {
  const store = storage();
  if (!store) return;
  try {
    if (selection) store.setItem(SELECTION_KEY, JSON.stringify(selection));
    else store.removeItem(SELECTION_KEY);
  } catch {
    /* sem persistência: a troca vale só para esta aba */
  }
}

interface CacheEntry {
  pack: ExperiencePack;
  fetchedAt: number;
}

export function cachedPack(id: number, version: number): CacheEntry | null {
  const entry = readJson<CacheEntry>(`${CACHE_PREFIX}${id}:${version}`);
  if (!entry || !schemaIsSupported(entry.pack)) return null;
  return entry;
}

export async function fetchExperiences(
  fetcher: typeof fetch = fetch,
): Promise<ExperienceSummary[]> {
  try {
    const response = await fetcher("/api/experience", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { experiencias?: unknown };
    const list = Array.isArray(data.experiencias) ? data.experiencias : [];
    const parsed = list.filter(
      (item): item is ExperienceSummary =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as ExperienceSummary).id === "number",
    );
    writeJson(LIST_CACHE_KEY, parsed);
    return parsed;
  } catch {
    return readJson<ExperienceSummary[]>(LIST_CACHE_KEY) ?? [];
  }
}

/**
 * Pack de uma versão EXPLÍCITA. Versão fixa é requisito de consumo em produção
 * (`ARCHITECTURE.md` → Consumer Architecture): sem ela, um republish no Jump
 * Value mudaria a cara do JumpFlow sem ninguém decidir.
 */
export async function fetchPack(
  id: number,
  version: number,
  fetcher: typeof fetch = fetch,
): Promise<PackResult> {
  const cached = cachedPack(id, version);
  if (cached && Date.now() - cached.fetchedAt < FRESH_MS) {
    return { pack: cached.pack, source: "cache" };
  }
  try {
    const response = await fetcher(
      `/api/experience/${encodeURIComponent(String(id))}?version=${encodeURIComponent(String(version))}`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { pack?: unknown };
    if (!schemaIsSupported(data.pack)) {
      throw new Error("pack sem schemaVersion suportado");
    }
    const pack = data.pack as ExperiencePack;
    writeJson(`${CACHE_PREFIX}${id}:${version}`, {
      pack,
      fetchedAt: Date.now(),
    });
    return { pack, source: "network" };
  } catch (error) {
    if (cached) {
      return {
        pack: cached.pack,
        source: "stale-cache",
        detail: error instanceof Error ? error.message : "falha de rede",
      };
    }
    return {
      pack: null,
      source: "none",
      detail: error instanceof Error ? error.message : "falha de rede",
    };
  }
}

export function clearExperienceCache(): void {
  const store = storage();
  if (!store) return;
  try {
    const keys: string[] = [];
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (key && key.startsWith(CACHE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => store.removeItem(key));
    store.removeItem(LIST_CACHE_KEY);
  } catch {
    /* nada a limpar */
  }
}
