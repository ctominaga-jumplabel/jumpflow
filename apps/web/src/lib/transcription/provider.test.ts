import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DisabledTranscriptionProvider,
  GeminiTranscriptionProvider,
  OpenAiTranscriptionProvider,
  getTranscriptionProvider,
  isTranscriptionConfigured,
  type TranscriptionProvider,
} from "./provider";

const ENV_KEYS = [
  "TRANSCRIPTION_PROVIDER",
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",
  "GEMINI_API_KEY",
  "GEMINI_TRANSCRIPTION_MODEL",
] as const;

describe("transcription provider seam (Melhoria #3)", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  describe("DisabledTranscriptionProvider", () => {
    it("returns null (noop)", async () => {
      const provider: TranscriptionProvider = new DisabledTranscriptionProvider();
      const result = await provider.transcribe({
        audio: Buffer.from("x"),
        mimeType: "audio/webm",
      });
      expect(result).toBeNull();
    });
  });

  describe("getTranscriptionProvider", () => {
    it("falls back to the disabled noop when no env is set", async () => {
      const provider = getTranscriptionProvider();
      expect(provider).toBeInstanceOf(DisabledTranscriptionProvider);
      await expect(
        provider.transcribe({ audio: Buffer.from("x"), mimeType: "audio/webm" }),
      ).resolves.toBeNull();
    });

    it("stays disabled when provider is set but the credential is missing", () => {
      process.env.TRANSCRIPTION_PROVIDER = "openai";
      expect(getTranscriptionProvider()).toBeInstanceOf(DisabledTranscriptionProvider);
    });

    it("stays disabled for an unknown provider value", () => {
      process.env.TRANSCRIPTION_PROVIDER = "acme";
      process.env.OPENAI_API_KEY = "sk-test";
      expect(getTranscriptionProvider()).toBeInstanceOf(DisabledTranscriptionProvider);
    });

    it("selects OpenAI stub when configured with a key", () => {
      process.env.TRANSCRIPTION_PROVIDER = "openai";
      process.env.OPENAI_API_KEY = "sk-test";
      expect(getTranscriptionProvider()).toBeInstanceOf(OpenAiTranscriptionProvider);
    });

    it("selects Gemini stub when configured with a key", () => {
      process.env.TRANSCRIPTION_PROVIDER = "gemini";
      process.env.GOOGLE_API_KEY = "g-test";
      expect(getTranscriptionProvider()).toBeInstanceOf(GeminiTranscriptionProvider);
    });
  });

  describe("isTranscriptionConfigured", () => {
    it("is false with no env", () => {
      expect(isTranscriptionConfigured()).toBe(false);
    });

    it("is false when provider is set but credential is missing", () => {
      process.env.TRANSCRIPTION_PROVIDER = "gemini";
      expect(isTranscriptionConfigured()).toBe(false);
    });

    it("is true when provider + credential are present", () => {
      process.env.TRANSCRIPTION_PROVIDER = "openai";
      process.env.OPENAI_API_KEY = "sk-test";
      expect(isTranscriptionConfigured()).toBe(true);
    });
  });

  describe("concrete provider stubs", () => {
    it("OpenAI stub degrades to null (honors the no-throw contract)", async () => {
      // Contract: providers MUST NOT throw — even an unimplemented one returns
      // null so the caller degrades gracefully (no "not implemented" crash).
      await expect(
        new OpenAiTranscriptionProvider().transcribe({
          audio: Buffer.from("x"),
          mimeType: "audio/webm",
        }),
      ).resolves.toBeNull();
    });
  });

  describe("GeminiTranscriptionProvider (real fetch call)", () => {
    const validInput = {
      audio: Buffer.from("fake-audio-bytes"),
      mimeType: "audio/webm",
      languageHint: "pt-BR",
    } as const;

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("returns null without throwing when no API key is present", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const result = await new GeminiTranscriptionProvider().transcribe(validInput);
      expect(result).toBeNull();
      // No key -> no network call at all.
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("transcribes successfully and sends inline_data + a prompt", async () => {
      process.env.GOOGLE_API_KEY = "g-test";
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: "olá, isto é um teste" }] } },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

      const result = await new GeminiTranscriptionProvider().transcribe(validInput);
      expect(result).not.toBeNull();
      expect(result?.text).toBe("olá, isto é um teste");
      expect(result?.language).toBe("pt-BR");

      // Inspect the shape of the request the provider built.
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/:generateContent$/);
      expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
        "g-test",
      );
      const body = JSON.parse(init.body as string);
      const parts = body.contents[0].parts;
      expect(parts[0].text).toMatch(/transcreva/i);
      expect(parts[1].inline_data.mime_type).toBe("audio/webm");
      expect(parts[1].inline_data.data).toBe(
        Buffer.from("fake-audio-bytes").toString("base64"),
      );
    });

    it("accepts GEMINI_API_KEY as an alias for the credential", async () => {
      process.env.GEMINI_API_KEY = "g-alias";
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }),
          { status: 200 },
        ),
      );
      const result = await new GeminiTranscriptionProvider().transcribe(validInput);
      expect(result?.text).toBe("ok");
    });

    it("returns null on an HTTP error (degrade honestly)", async () => {
      process.env.GOOGLE_API_KEY = "g-test";
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("rate limited", { status: 429, statusText: "Too Many Requests" }),
      );
      const result = await new GeminiTranscriptionProvider().transcribe(validInput);
      expect(result).toBeNull();
    });

    it("returns null on a network/timeout failure", async () => {
      process.env.GOOGLE_API_KEY = "g-test";
      vi.spyOn(globalThis, "fetch").mockRejectedValue(
        Object.assign(new Error("aborted"), { name: "AbortError" }),
      );
      const result = await new GeminiTranscriptionProvider().transcribe(validInput);
      expect(result).toBeNull();
    });

    it("returns null when the response has no candidate text", async () => {
      process.env.GOOGLE_API_KEY = "g-test";
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ candidates: [] }), { status: 200 }),
      );
      const result = await new GeminiTranscriptionProvider().transcribe(validInput);
      expect(result).toBeNull();
    });

    it("uses GEMINI_TRANSCRIPTION_MODEL when set", async () => {
      process.env.GOOGLE_API_KEY = "g-test";
      process.env.GEMINI_TRANSCRIPTION_MODEL = "gemini-2.5-flash";
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }),
          { status: 200 },
        ),
      );
      await new GeminiTranscriptionProvider().transcribe(validInput);
      const [url] = fetchSpy.mock.calls[0] as [string];
      expect(url).toContain("gemini-2.5-flash");
    });
  });
});
