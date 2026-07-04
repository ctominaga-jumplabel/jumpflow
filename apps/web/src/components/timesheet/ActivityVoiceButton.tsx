"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { transcribeActivityAudio } from "@/app/app/horas/actions";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";

/**
 * Botão de transcrição por voz da Descrição (Melhoria #3).
 *
 * Só é renderizado pelo formulário quando `isTranscriptionEnabled()` (a flag de
 * cliente NEXT_PUBLIC_TRANSCRIPTION). Captura áudio com MediaRecorder
 * (getUserMedia), envia para a server action `transcribeActivityAudio` e
 * devolve o texto via `onTranscribed` para o formulário decidir como aplicar.
 *
 * Estados: idle -> recording (indicador + parar) -> transcribing (spinner) ->
 * idle. Falhas (permissão negada, sem provider, erro do servidor) NUNCA quebram
 * o form: mostram uma mensagem honesta e voltam para idle. O fluxo de digitar
 * manualmente continua intacto.
 */

type VoiceState = "idle" | "recording" | "transcribing";

export interface ActivityVoiceButtonProps {
  /** Recebe a transcrição (texto não vazio) para o form aplicar. */
  onTranscribed: (text: string) => void;
  /** Desabilita o controle (ex.: enquanto uma ação do form está em voo). */
  disabled?: boolean;
}

/** Pega o primeiro mimeType de áudio suportado pelo MediaRecorder do navegador. */
function pickAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return undefined;
}

export function ActivityVoiceButton({
  onTranscribed,
  disabled = false,
}: ActivityVoiceButtonProps) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  /** Libera o microfone (encerra todas as tracks). */
  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  // Cleanup no unmount: se o modal/form desmontar durante a gravação, libera os
  // tracks do microfone (senão o indicador de mic do navegador fica ligado).
  // Lê os refs no momento do unmount (sem deps), por isso a dependência vazia.
  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function startRecording() {
    setError(null);
    // Re-entrância: ignore um segundo start enquanto já gravando/transcrevendo,
    // senão um novo getUserMedia sobrescreveria streamRef/recorderRef e vazaria
    // o primeiro stream (mic preso ligado).
    if (state !== "idle") return;
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError("Gravação por voz indisponível neste navegador.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickAudioMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        void handleStopped(recorder.mimeType || mimeType || "audio/webm");
      };
      recorderRef.current = recorder;
      recorder.start();
      setState("recording");
    } catch {
      // Permissão negada ou nenhum dispositivo — mensagem honesta, volta ao idle.
      stopStream();
      setState("idle");
      setError("Não foi possível acessar o microfone. Verifique a permissão.");
    }
  }

  async function handleStopped(mimeType: string) {
    stopStream();
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];
    if (blob.size === 0) {
      setState("idle");
      setError("Nenhum áudio capturado.");
      return;
    }
    setState("transcribing");
    try {
      const form = new FormData();
      form.set("audio", blob, "descricao.webm");
      const result = await transcribeActivityAudio(form);
      if (result.ok) {
        onTranscribed(result.text);
        setError(null);
      } else {
        setError(result.message);
      }
    } catch {
      setError("Não foi possível transcrever o áudio.");
    } finally {
      setState("idle");
    }
  }

  function stopRecording() {
    // O onstop dispara o envio/transcrição.
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

  const recording = state === "recording";
  const transcribing = state === "transcribing";

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || transcribing}
          aria-pressed={recording}
          aria-label={recording ? "Parar gravação" : "Gravar descrição por voz"}
          onClick={recording ? stopRecording : startRecording}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold",
            focusRing,
            recording
              ? "border-danger bg-danger-soft text-danger"
              : "border-border bg-surface text-medium hover:text-strong",
            (disabled || transcribing) && "cursor-not-allowed opacity-60",
          )}
        >
          {transcribing ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : recording ? (
            <Square aria-hidden="true" className="size-3.5 fill-current" />
          ) : (
            <Mic aria-hidden="true" className="size-4" />
          )}
          {transcribing ? "Transcrevendo…" : recording ? "Parar" : "Gravar"}
        </button>
        {recording ? (
          <span
            className="inline-flex items-center gap-1.5 text-xs text-danger"
            role="status"
          >
            <span
              aria-hidden="true"
              className="size-2 rounded-full bg-danger motion-safe:animate-pulse"
            />
            Gravando…
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="mt-1 text-xs text-danger" role="status">
          {error}
        </p>
      ) : (
        <p className="mt-1 text-xs text-soft">
          Grave a fala para preencher a descrição automaticamente.
        </p>
      )}
    </div>
  );
}
