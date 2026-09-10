/**
 * Acesso de servidor ao registro: validação de entrada e snapshot local.
 *
 * O snapshot é a fonte de desenvolvimento/demonstração (sem credencial). A
 * validação de `id`/`version` importa porque eles entram na composição de um
 * NOME DE ARQUIVO — e caminho vindo de request nunca é confiável.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPack, listPublished, registrySource } from "./registry";

const ORIGINAL = { ...process.env };

beforeEach(() => {
  delete process.env.JUMPVALUE_API_URL;
  delete process.env.JUMPVALUE_API_TOKEN;
  process.env.JUMPVALUE_EXPERIENCE_SNAPSHOT =
    "src/lib/experience/fixtures";
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("fonte do registro", () => {
  it("prefere o registro vivo quando configurado", () => {
    process.env.JUMPVALUE_API_URL = "https://jumpvalue.example";
    expect(registrySource().kind).toBe("api");
  });

  it("cai para o snapshot local sem API configurada", () => {
    expect(registrySource().kind).toBe("snapshot");
  });
});

describe("snapshot local", () => {
  it("lista as experiências publicadas do snapshot", async () => {
    const data = await listPublished();
    expect(data?.experiencias?.length).toBeGreaterThan(0);
  });

  it("entrega o pack de uma versão", async () => {
    const data = await getPack(1, 1);
    expect((data?.pack as { schemaVersion?: string } | undefined)?.schemaVersion).toBe("1.0");
  });

  it("versão inexistente devolve nada (a rota traduz em 404)", async () => {
    expect(await getPack(1, 99)).toBeNull();
    expect(await getPack(4242, 1)).toBeNull();
  });

  it.each([
    [0, 1],
    [-1, 1],
    [1, 0],
    [Number.NaN, 1],
    [1.5, 1],
  ])("recusa id/versão fora de inteiro positivo: %s/%s", async (id, version) => {
    expect(await getPack(id, version)).toBeNull();
  });
});
