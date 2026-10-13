import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Selecao de provider de IA e a chamada real do Gemini (leitura de PDF).
 *
 * Cobre o contrato que o resto do sistema depende:
 *  - sem AI_PROVIDER / sem credencial → noop (a feature de IA nem aparece);
 *  - "gemini" + GOOGLE_API_KEY (ou o alias) → provider real;
 *  - o PDF vai como inline_data e a chave vai em HEADER, nunca na URL;
 *  - ids Claude em `opts.model` sao IGNORADOS pelo Gemini (mandar um daria 404);
 *  - qualquer falha (404, 5xx, timeout, candidato vazio) devolve null em vez de
 *    lancar — quem chama degrada honestamente.
 */

import {
  getAiTextProvider,
  getConfiguredAiModel,
  isAiProviderConfigured,
  AI_MODELS,
} from "./provider";

const PDF_B64 = "JVBERi0xLjQK";

function mockFetchOk(text: string) {
  const spy = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("GEMINI_AI_MODEL", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("selecao de provider", () => {
  it("fica desligado sem AI_PROVIDER", async () => {
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("GOOGLE_API_KEY", "chave");
    expect(isAiProviderConfigured()).toBe(false);
    expect(getConfiguredAiModel()).toBe("none");
    // Noop: nao chama rede e devolve null.
    const spy = mockFetchOk("{}");
    expect(await getAiTextProvider().complete("oi")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("fica desligado com AI_PROVIDER=gemini mas sem chave", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GOOGLE_API_KEY", "");
    expect(isAiProviderConfigured()).toBe(false);
    const spy = mockFetchOk("{}");
    expect(await getAiTextProvider().complete("oi")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("liga com gemini + GOOGLE_API_KEY", () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GOOGLE_API_KEY", "chave");
    expect(isAiProviderConfigured()).toBe(true);
    expect(getConfiguredAiModel()).toBe("gemini-3.8-flash");
  });

  it("aceita GEMINI_API_KEY como alias", () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GOOGLE_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "chave-alias");
    expect(isAiProviderConfigured()).toBe(true);
  });

  it("ignora provider desconhecido", () => {
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv("GOOGLE_API_KEY", "chave");
    expect(isAiProviderConfigured()).toBe(false);
  });
});

describe("GeminiAiTextProvider — leitura de PDF", () => {
  beforeEach(() => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GOOGLE_API_KEY", "chave-secreta");
  });

  it("envia o PDF como inline_data, com a chave em header e fora da URL", async () => {
    const spy = mockFetchOk('{"headline":"Dev"}');
    const out = await getAiTextProvider().completeWithDocument(
      "Leia o curriculo",
      { mediaType: "application/pdf", dataBase64: PDF_B64 },
      { system: "Voce extrai dados.", json: true, model: AI_MODELS.SONNET },
    );
    expect(out).toBe('{"headline":"Dev"}');

    const [url, init] = spy.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    // Chave NUNCA na query string (cai em log de request).
    expect(url).not.toContain("chave-secreta");
    expect(init.headers["x-goog-api-key"]).toBe("chave-secreta");

    const body = JSON.parse(init.body);
    const parts = body.contents[0].parts;
    expect(parts[0].inline_data).toEqual({
      mime_type: "application/pdf",
      data: PDF_B64,
    });
    expect(parts[1].text).toBe("Leia o curriculo");
    expect(body.systemInstruction.parts[0].text).toBe("Voce extrai dados.");
    // json: true pede saida JSON nativa.
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("IGNORA o id de modelo Claude e usa o modelo do Gemini", async () => {
    const spy = mockFetchOk("{}");
    await getAiTextProvider().completeWithDocument(
      "x",
      { mediaType: "application/pdf", dataBase64: PDF_B64 },
      { model: AI_MODELS.SONNET },
    );
    const [url] = spy.mock.calls[0] as unknown as [string];
    // Mandar "claude-sonnet-5" ao Gemini daria 404.
    expect(url).not.toContain("claude");
    expect(url).toContain("gemini-3.8-flash");
  });

  it("respeita GEMINI_AI_MODEL", async () => {
    vi.stubEnv("GEMINI_AI_MODEL", "gemini-outro-modelo");
    expect(getConfiguredAiModel()).toBe("gemini-outro-modelo");
    const spy = mockFetchOk("{}");
    await getAiTextProvider().complete("x");
    const [url] = spy.mock.calls[0] as unknown as [string];
    expect(url).toContain("gemini-outro-modelo");
  });

  it("omite responseMimeType quando json nao foi pedido", async () => {
    const spy = mockFetchOk("texto");
    await getAiTextProvider().complete("x");
    const [, init] = spy.mock.calls[0] as unknown as [string, { body: string }];
    expect(
      JSON.parse(init.body).generationConfig.responseMimeType,
    ).toBeUndefined();
  });

  it("devolve null em HTTP 404 (modelo descontinuado) sem lancar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    );
    expect(await getAiTextProvider().complete("x")).toBeNull();
  });

  it("devolve null em erro de rede sem lancar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    expect(await getAiTextProvider().complete("x")).toBeNull();
  });

  it("devolve null quando o candidato vem vazio", async () => {
    mockFetchOk("   ");
    expect(await getAiTextProvider().complete("x")).toBeNull();
  });
});
