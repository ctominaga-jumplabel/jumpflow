import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DisabledTranscriptionProvider,
  GeminiTranscriptionProvider,
  OpenAiTranscriptionProvider,
  getTranscriptionProvider,
  isTranscriptionConfigured,
  type TranscriptionProvider,
} from "./provider";

const ENV_KEYS = ["TRANSCRIPTION_PROVIDER", "OPENAI_API_KEY", "GOOGLE_API_KEY"] as const;

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
    it("OpenAI stub throws not-implemented (real call not wired yet)", async () => {
      await expect(
        new OpenAiTranscriptionProvider().transcribe({
          audio: Buffer.from("x"),
          mimeType: "audio/webm",
        }),
      ).rejects.toThrow(/not implemented/i);
    });

    it("Gemini stub throws not-implemented (real call not wired yet)", async () => {
      await expect(
        new GeminiTranscriptionProvider().transcribe({
          audio: Buffer.from("x"),
          mimeType: "audio/webm",
        }),
      ).rejects.toThrow(/not implemented/i);
    });
  });
});
