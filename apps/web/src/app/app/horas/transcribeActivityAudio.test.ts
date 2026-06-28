import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the voice-transcription server action (Melhoria #3). The action does
 * NOT persist anything, so we only need to mock the auth guard, the transcription
 * seam and the heavy module-level deps that `actions.ts` imports at load time
 * (prisma, next/cache, storage).
 */

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  transcribeAudio: vi.fn(),
}));

// `actions.ts` imports prisma at module top; provide a no-op stub so the module
// loads without a real database.
vi.mock("@jumpflow/database", () => ({
  prisma: {},
  Prisma: {},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/storage/provider", () => ({
  getStorageProvider: vi.fn(),
  isStorageConfigured: vi.fn(() => false),
  ONCALL_APPROVALS_BUCKET: "oncall-approvals",
}));
vi.mock("@/lib/auth/guards", () => ({
  requireUser: h.requireUser,
  requireRole: vi.fn(),
}));

// Mock the seam so we control DISABLED vs success vs invalid without env juggling.
vi.mock("@/lib/transcription/transcribe", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/transcription/transcribe")>();
  return { ...actual, transcribeAudio: h.transcribeAudio };
});

import { ACTIVITY_AUDIO_MAX_BYTES, transcribeActivityAudio } from "./actions";

function audioFormData(blob: Blob): FormData {
  const form = new FormData();
  form.set("audio", blob);
  return form;
}

const aUser = { id: "u1", email: "ana@jumplabel.com.br", roles: ["CONSULTANT"] };

describe("transcribeActivityAudio (Melhoria #3)", () => {
  beforeEach(() => {
    h.requireUser.mockReset().mockResolvedValue(aUser);
    h.transcribeAudio.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("requires an authenticated user (the guard's redirect propagates)", async () => {
    // The real requireUser redirects unauthenticated users; that throws a
    // framework control-flow error carrying a NEXT_REDIRECT digest, which the
    // action must re-throw (not swallow into an ActionResult).
    h.requireUser.mockRejectedValue(
      Object.assign(new Error("redirect"), { digest: "NEXT_REDIRECT;..." }),
    );
    await expect(
      transcribeActivityAudio(audioFormData(new Blob(["x"], { type: "audio/webm" }))),
    ).rejects.toThrow();
    expect(h.transcribeAudio).not.toHaveBeenCalled();
  });

  it("returns INVALID_SIZE when no audio blob is present", async () => {
    const out = await transcribeActivityAudio(new FormData());
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("INVALID_SIZE");
    expect(h.transcribeAudio).not.toHaveBeenCalled();
  });

  it("returns INVALID_SIZE for an empty blob", async () => {
    const out = await transcribeActivityAudio(
      audioFormData(new Blob([], { type: "audio/webm" })),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("INVALID_SIZE");
    expect(h.transcribeAudio).not.toHaveBeenCalled();
  });

  it("rejects audio above the feature cap with AUDIO_TOO_LONG (cuts before encoding)", async () => {
    // A Blob-like whose reported size exceeds ACTIVITY_AUDIO_MAX_BYTES, without
    // materializing 10+ MB of data — the action only reads `.size`/`.type` and
    // checks `instanceof Blob` before calling `.arrayBuffer()` (never reached).
    const big = Object.create(Blob.prototype, {
      size: { value: ACTIVITY_AUDIO_MAX_BYTES + 1 },
      type: { value: "audio/webm" },
    }) as Blob;
    // FormData.set would coerce a non-real Blob, so feed the action a FormData
    // whose `get("audio")` returns our oversized Blob-like directly.
    const form = new FormData();
    // The action gates on `instanceof Blob` (File extends Blob); cast through
    // the FormData entry type, which is narrower (File | string).
    vi.spyOn(form, "get").mockReturnValue(big as unknown as File);
    const out = await transcribeActivityAudio(form);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("AUDIO_TOO_LONG");
      expect(out.message).toMatch(/muito longo/i);
    }
    // Cut before touching the seam (no encode/transcribe attempted).
    expect(h.transcribeAudio).not.toHaveBeenCalled();
  });

  it("is honest when the seam is DISABLED (flag off / no provider)", async () => {
    h.transcribeAudio.mockResolvedValue({
      ok: false,
      reason: "DISABLED",
      message: "Transcrição de áudio está desativada.",
    });
    const out = await transcribeActivityAudio(
      audioFormData(new Blob(["audio"], { type: "audio/webm" })),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("DISABLED");
  });

  it("returns the transcribed text on success and strips codec from mimeType", async () => {
    h.transcribeAudio.mockResolvedValue({ ok: true, text: "reunião de alinhamento" });
    const out = await transcribeActivityAudio(
      audioFormData(new Blob(["audio"], { type: "audio/webm;codecs=opus" })),
    );
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.text).toBe("reunião de alinhamento");
    expect(h.transcribeAudio).toHaveBeenCalledTimes(1);
    expect(h.transcribeAudio).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "audio/webm", languageHint: "pt-BR" }),
    );
  });

  it("propagates NO_RESULT honestly (provider null)", async () => {
    h.transcribeAudio.mockResolvedValue({
      ok: false,
      reason: "NO_RESULT",
      message: "Nenhuma transcrição disponível.",
    });
    const out = await transcribeActivityAudio(
      audioFormData(new Blob(["audio"], { type: "audio/webm" })),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("NO_RESULT");
  });

  it("returns UNEXPECTED (never throws) on an unexpected seam error", async () => {
    h.transcribeAudio.mockRejectedValue(new Error("boom"));
    const out = await transcribeActivityAudio(
      audioFormData(new Blob(["audio"], { type: "audio/webm" })),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("UNEXPECTED");
  });
});
