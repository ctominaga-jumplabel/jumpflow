import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TranscriptionProvider, TranscriptionResult } from "./provider";

// Controllable mock provider so we can simulate an enabled/successful backend
// without any real network call.
const transcribeMock = vi.fn<TranscriptionProvider["transcribe"]>();

vi.mock("./provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./provider")>();
  return {
    ...actual,
    getTranscriptionProvider: (): TranscriptionProvider => ({
      transcribe: transcribeMock,
    }),
  };
});

import { transcribeAudio } from "./transcribe";

const FLAG = "NEXT_PUBLIC_TRANSCRIPTION";
const validAudio = { audio: Buffer.from("fake-audio-bytes"), mimeType: "audio/webm" };

describe("transcribeAudio (Melhoria #3)", () => {
  let savedFlag: string | undefined;

  beforeEach(() => {
    savedFlag = process.env[FLAG];
    transcribeMock.mockReset();
  });

  afterEach(() => {
    if (savedFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = savedFlag;
  });

  it("returns an honest DISABLED result when the flag is off (not an error)", async () => {
    delete process.env[FLAG];
    const out = await transcribeAudio(validAudio);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("DISABLED");
    expect(transcribeMock).not.toHaveBeenCalled();
  });

  describe("with the flag enabled", () => {
    beforeEach(() => {
      process.env[FLAG] = "true";
    });

    it("rejects an unsupported mime type with INVALID_TYPE", async () => {
      const out = await transcribeAudio({
        audio: Buffer.from("x"),
        mimeType: "application/pdf",
      });
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.reason).toBe("INVALID_TYPE");
        expect(out.message).toMatch(/não suportado/i);
      }
      expect(transcribeMock).not.toHaveBeenCalled();
    });

    it("rejects empty audio with INVALID_SIZE", async () => {
      const out = await transcribeAudio({
        audio: Buffer.alloc(0),
        mimeType: "audio/webm",
      });
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.reason).toBe("INVALID_SIZE");
      expect(transcribeMock).not.toHaveBeenCalled();
    });

    it("rejects audio above the 25MB cap with INVALID_SIZE", async () => {
      const out = await transcribeAudio({
        audio: Buffer.alloc(25 * 1024 * 1024 + 1),
        mimeType: "audio/mpeg",
      });
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.reason).toBe("INVALID_SIZE");
        expect(out.message).toMatch(/limite/i);
      }
      expect(transcribeMock).not.toHaveBeenCalled();
    });

    it("returns NO_RESULT when the provider yields null (degrade gracefully)", async () => {
      transcribeMock.mockResolvedValue(null);
      const out = await transcribeAudio(validAudio);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.reason).toBe("NO_RESULT");
    });

    it("returns text when a mocked enabled provider transcribes successfully", async () => {
      const result: TranscriptionResult = {
        text: "olá, isto é um teste",
        language: "pt-BR",
        durationSec: 3.2,
        model: "whisper-1",
      };
      transcribeMock.mockResolvedValue(result);

      const out = await transcribeAudio({ ...validAudio, languageHint: "pt-BR" });

      expect(out.ok).toBe(true);
      if (out.ok) {
        expect(out.text).toBe("olá, isto é um teste");
        expect(out.language).toBe("pt-BR");
        expect(out.durationSec).toBe(3.2);
        expect(out.model).toBe("whisper-1");
      }
      expect(transcribeMock).toHaveBeenCalledTimes(1);
      // mimeType is normalized to lowercase before reaching the provider.
      expect(transcribeMock).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: "audio/webm", languageHint: "pt-BR" }),
      );
    });

    it("accepts a base64 string audio payload", async () => {
      transcribeMock.mockResolvedValue({ text: "ok" });
      const base64 = Buffer.from("some-audio-data-here").toString("base64");
      const out = await transcribeAudio({
        audio: base64,
        audioIsBase64: true,
        mimeType: "audio/ogg",
      });
      expect(out.ok).toBe(true);
      expect(transcribeMock).toHaveBeenCalledTimes(1);
    });
  });
});
