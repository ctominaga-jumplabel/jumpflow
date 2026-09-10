/**
 * Cliente: cache, fallback e persistência da seleção.
 *
 * O consumidor não pode depender de o registro estar de pé. Estes testes fixam
 * o comportamento em cada falha: rede fora com cache, rede fora sem cache,
 * pack inválido na resposta e storage indisponível.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cachedPack,
  clearExperienceCache,
  fetchExperiences,
  fetchPack,
  readSelection,
  writeSelection,
} from "./client";
import type { ExperiencePack } from "./types";

const PACK: ExperiencePack = {
  schemaVersion: "1.0",
  manifest: { id: "1", slug: "exp", name: "Exp", version: 2 },
  tokens: {
    color: { $type: "color", background: "#0b0b12", text: "#e8e8f0", primary: "#7c3aed" },
  },
};

function respostaOk(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

function respostaErro(status: number) {
  return {
    ok: false,
    status,
    json: async () => ({}),
  } as unknown as Response;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("busca de pack", () => {
  it("busca na rede e guarda em cache por (experiência, versão)", async () => {
    const fetcher = vi.fn().mockResolvedValue(respostaOk({ pack: PACK }));
    const primeiro = await fetchPack(1, 2, fetcher as unknown as typeof fetch);
    expect(primeiro.source).toBe("network");
    expect(primeiro.pack?.manifest?.slug).toBe("exp");
    expect(cachedPack(1, 2)).not.toBeNull();

    const segundo = await fetchPack(1, 2, fetcher as unknown as typeof fetch);
    expect(segundo.source).toBe("cache");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("pede a versão explícita na URL", async () => {
    const fetcher = vi.fn().mockResolvedValue(respostaOk({ pack: PACK }));
    await fetchPack(7, 3, fetcher as unknown as typeof fetch);
    expect(fetcher.mock.calls[0][0]).toBe("/api/experience/7?version=3");
  });

  it("API indisponível com cache: serve o cache VELHO e avisa", async () => {
    await fetchPack(1, 2, vi.fn().mockResolvedValue(respostaOk({ pack: PACK })) as unknown as typeof fetch);
    // Envelhece o cache além da janela de frescor.
    const chave = "jf-experience-pack:1:2";
    const entrada = JSON.parse(window.localStorage.getItem(chave) as string);
    entrada.fetchedAt = Date.now() - 48 * 60 * 60 * 1000;
    window.localStorage.setItem(chave, JSON.stringify(entrada));

    const resultado = await fetchPack(
      1,
      2,
      vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch,
    );
    expect(resultado.source).toBe("stale-cache");
    expect(resultado.pack?.manifest?.slug).toBe("exp");
    expect(resultado.detail).toContain("offline");
  });

  it("API indisponível sem cache: devolve nada (chamador cai no tema original)", async () => {
    const resultado = await fetchPack(
      99,
      1,
      vi.fn().mockResolvedValue(respostaErro(503)) as unknown as typeof fetch,
    );
    expect(resultado.pack).toBeNull();
    expect(resultado.source).toBe("none");
  });

  it("resposta com pack de schema incompatível não vira cache", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(respostaOk({ pack: { schemaVersion: "9.0" } }));
    const resultado = await fetchPack(1, 1, fetcher as unknown as typeof fetch);
    expect(resultado.pack).toBeNull();
    expect(cachedPack(1, 1)).toBeNull();
  });

  it("cache corrompido é ignorado", async () => {
    window.localStorage.setItem("jf-experience-pack:1:1", "{não é json");
    expect(cachedPack(1, 1)).toBeNull();
  });
});

describe("lista de experiências", () => {
  it("cai para a lista em cache quando a API falha", async () => {
    const lista = { experiencias: [{ id: 1, slug: "exp", nome: "Exp", status: "published", current_version: 2, classification: [] }] };
    await fetchExperiences(vi.fn().mockResolvedValue(respostaOk(lista)) as unknown as typeof fetch);
    const offline = await fetchExperiences(
      vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch,
    );
    expect(offline).toHaveLength(1);
    expect(offline[0].slug).toBe("exp");
  });

  it("lista vazia quando não há nem API nem cache", async () => {
    const offline = await fetchExperiences(
      vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch,
    );
    expect(offline).toEqual([]);
  });

  it("descarta item sem forma de experiência", async () => {
    const lista = { experiencias: [{ id: 1, slug: "ok", nome: "Ok", status: "published", current_version: 1, classification: [] }, "lixo", null] };
    const saida = await fetchExperiences(
      vi.fn().mockResolvedValue(respostaOk(lista)) as unknown as typeof fetch,
    );
    expect(saida).toHaveLength(1);
  });
});

describe("seleção persistida", () => {
  it("grava, lê e limpa", () => {
    expect(readSelection()).toBeNull();
    writeSelection({ id: 4, version: 2 });
    expect(readSelection()).toEqual({ id: 4, version: 2 });
    writeSelection(null);
    expect(readSelection()).toBeNull();
  });

  it("ignora seleção malformada", () => {
    window.localStorage.setItem("jf-experience-selection", '{"id":"x"}');
    expect(readSelection()).toBeNull();
  });

  it("limpar cache não apaga a seleção", () => {
    writeSelection({ id: 1, version: 1 });
    window.localStorage.setItem("jf-experience-pack:1:1", "{}");
    clearExperienceCache();
    expect(window.localStorage.getItem("jf-experience-pack:1:1")).toBeNull();
    expect(readSelection()).toEqual({ id: 1, version: 1 });
  });
});
