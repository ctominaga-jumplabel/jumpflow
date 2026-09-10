/**
 * Acesso de SERVIDOR ao Jump Experience Registry (usado pelas rotas do BFF).
 *
 * Precedência de fonte, nesta ordem:
 * 1. registro vivo — `JUMPVALUE_API_URL` + `JUMPVALUE_API_TOKEN`;
 * 2. snapshot local — `JUMPVALUE_EXPERIENCE_SNAPSHOT` (um diretório com
 *    `experiences.json` e `pack-<id>-v<n>.json`), para desenvolvimento e demo
 *    sem credencial;
 * 3. nada — a rota responde 503 e o cliente cai no cache ou no tema original.
 *
 * O token vive só aqui (servidor). Nunca vai para o navegador, nunca é logado.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_SNAPSHOT = "src/lib/experience/fixtures";

export interface RegistrySource {
  kind: "api" | "snapshot" | "none";
  detail: string;
}

export function registrySource(): RegistrySource {
  if (process.env.JUMPVALUE_API_URL) {
    return { kind: "api", detail: "registro vivo do Jump Value" };
  }
  if (process.env.JUMPVALUE_EXPERIENCE_SNAPSHOT || process.env.NODE_ENV !== "production") {
    return { kind: "snapshot", detail: "snapshot local de experiências" };
  }
  return { kind: "none", detail: "registro não configurado" };
}

function snapshotDir(): string {
  const configured = process.env.JUMPVALUE_EXPERIENCE_SNAPSHOT;
  return configured
    ? path.resolve(configured)
    : path.resolve(process.cwd(), DEFAULT_SNAPSHOT);
}

async function readSnapshot<T>(file: string): Promise<T | null> {
  // `file` é montado por nós a partir de inteiros validados; ainda assim o
  // caminho final é conferido contra a raiz do snapshot (anti-traversal).
  const base = snapshotDir();
  const target = path.resolve(base, file);
  if (!target.startsWith(base)) return null;
  try {
    return JSON.parse(await readFile(target, "utf8")) as T;
  } catch {
    return null;
  }
}

async function apiGet<T>(pathname: string): Promise<T | null> {
  const base = process.env.JUMPVALUE_API_URL;
  const token = process.env.JUMPVALUE_API_TOKEN;
  if (!base) return null;
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}${pathname}`, {
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      // O pack é imutável por versão; a lista muda pouco.
      next: { revalidate: 60 },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function listPublished(): Promise<{ experiencias: unknown[] } | null> {
  const source = registrySource();
  if (source.kind === "api") {
    const live = await apiGet<{ experiencias: unknown[] }>(
      "/api/experiences?status=published",
    );
    if (live) return live;
  }
  if (source.kind !== "none") {
    const snapshot = await readSnapshot<{ experiencias: unknown[] }>(
      "experiences.json",
    );
    if (snapshot) return snapshot;
  }
  return null;
}

export async function getPack(
  id: number,
  version: number,
): Promise<{ pack: unknown; meta?: unknown } | null> {
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(version) || version <= 0) {
    return null;
  }
  const source = registrySource();
  if (source.kind === "api") {
    const live = await apiGet<{ pack: unknown }>(
      `/api/experiences/${id}/pack?version=${version}`,
    );
    if (live) return live;
  }
  if (source.kind !== "none") {
    const snapshot = await readSnapshot<{ pack: unknown }>(
      `pack-${id}-v${version}.json`,
    );
    if (snapshot) return snapshot;
  }
  return null;
}
