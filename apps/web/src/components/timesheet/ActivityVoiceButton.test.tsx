import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Cobertura da transcrição por voz (Melhoria #3):
 *  - o botão de mic só aparece no form quando isTranscriptionEnabled() é true;
 *  - com MediaRecorder/getUserMedia mockados (jsdom não os tem) e a action
 *    mockada, a transcrição preenche a Descrição.
 *
 * Gotcha do AnimatePresence no jsdom: o Modal fechado pode ficar montado; os
 * testes escopam asserções enquanto o modal está aberto.
 */

const h = vi.hoisted(() => ({
  enabled: vi.fn<() => boolean>(),
  transcribe: vi.fn(),
}));

vi.mock("@/lib/transcription/flags", () => ({
  isTranscriptionEnabled: h.enabled,
}));
vi.mock("@/app/app/horas/actions", () => ({
  transcribeActivityAudio: h.transcribe,
}));

import { TimeEntryForm, type TimeEntryFormProject } from "./TimeEntryForm";
import type { WeekDay } from "@/lib/timesheet/types";

const days: WeekDay[] = [
  { label: "Seg", date: "2026-06-08", weekend: false },
  { label: "Ter", date: "2026-06-09", weekend: false },
];
const projects: TimeEntryFormProject[] = [
  { id: "p1", name: "Atlas", clientId: "c1", clientName: "Vix" },
];

function renderForm() {
  return render(
    <TimeEntryForm
      open
      onClose={() => {}}
      projects={projects}
      days={days}
      onSubmit={vi.fn()}
    />,
  );
}

// --- MediaRecorder / getUserMedia mocks (jsdom has neither) -----------------

type RecorderInstance = {
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  start: () => void;
  stop: () => void;
  mimeType: string;
};

let lastRecorder: RecorderInstance | null = null;

function createMockRecorder(): RecorderInstance {
  const recorder: RecorderInstance = {
    ondataavailable: null,
    onstop: null,
    mimeType: "audio/webm",
    start() {},
    stop() {
      // Emite um chunk e dispara o onstop, como o navegador faria.
      recorder.ondataavailable?.({
        data: new Blob(["audio"], { type: "audio/webm" }),
      });
      recorder.onstop?.();
    },
  };
  lastRecorder = recorder;
  return recorder;
}

const MockMediaRecorder = Object.assign(
  function MediaRecorderCtor() {
    return createMockRecorder();
  } as unknown as typeof MediaRecorder,
  { isTypeSupported: () => true },
);

describe("TimeEntryForm — mic de transcrição (Melhoria #3)", () => {
  let trackStop: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    h.enabled.mockReset();
    h.transcribe.mockReset();
    lastRecorder = null;
    trackStop = vi.fn();

    vi.stubGlobal("MediaRecorder", MockMediaRecorder);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: trackStop }],
        }),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("não mostra o botão de gravar quando a flag está desligada", () => {
    h.enabled.mockReturnValue(false);
    renderForm();
    expect(
      screen.queryByRole("button", { name: /gravar descrição por voz/i }),
    ).toBeNull();
  });

  it("mostra o botão de gravar quando a flag está ligada", () => {
    h.enabled.mockReturnValue(true);
    renderForm();
    expect(
      screen.getByRole("button", { name: /gravar descrição por voz/i }),
    ).not.toBeNull();
  });

  it("transcreve e preenche a Descrição", async () => {
    h.enabled.mockReturnValue(true);
    h.transcribe.mockResolvedValue({ ok: true, text: "reunião de alinhamento" });
    renderForm();

    // idle -> recording
    fireEvent.click(screen.getByRole("button", { name: /gravar descrição por voz/i }));
    await waitFor(() => expect(lastRecorder).not.toBeNull());

    // recording -> stop (dispara o onstop -> action)
    fireEvent.click(screen.getByRole("button", { name: /parar gravação/i }));

    await waitFor(() => expect(h.transcribe).toHaveBeenCalledTimes(1));

    const textarea = screen.getByLabelText("Descrição") as HTMLTextAreaElement;
    await waitFor(() =>
      expect(textarea.value).toBe("reunião de alinhamento"),
    );
  });

  it("mostra mensagem honesta quando a transcrição está indisponível", async () => {
    h.enabled.mockReturnValue(true);
    h.transcribe.mockResolvedValue({
      ok: false,
      reason: "DISABLED",
      message: "Transcrição de áudio está desativada.",
    });
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: /gravar descrição por voz/i }));
    await waitFor(() => expect(lastRecorder).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /parar gravação/i }));

    await waitFor(() => expect(h.transcribe).toHaveBeenCalled());
    expect(
      await screen.findByText(/desativada/i),
    ).not.toBeNull();
    // A descrição continua vazia — o fluxo manual segue intacto.
    const textarea = screen.getByLabelText("Descrição") as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
  });

  it("libera o microfone ao desmontar durante a gravação (cleanup)", async () => {
    h.enabled.mockReturnValue(true);
    const { unmount } = renderForm();

    fireEvent.click(screen.getByRole("button", { name: /gravar descrição por voz/i }));
    await waitFor(() => expect(lastRecorder).not.toBeNull());
    // Gravando: o stream está aberto. Desmontar deve parar os tracks do mic.
    expect(trackStop).not.toHaveBeenCalled();

    unmount();
    expect(trackStop).toHaveBeenCalled();
  });
});
