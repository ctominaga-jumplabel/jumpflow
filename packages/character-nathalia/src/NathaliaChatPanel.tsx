"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Send, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import {
  cancelNathaliaSpeech,
  isNathaliaMuted,
  isSpeechSupported,
  setNathaliaMuted,
} from "./nathaliaSpeech";
import { NathaliaAvatar } from "./NathaliaAvatar";
import { useNathalia } from "./NathaliaProvider";
import { closeNathalia } from "./nathaliaStore";
import { canAccessContext, canExecuteAction } from "./nathaliaPermissions";
import { getNathaliaState } from "./nathaliaStates";
import { nathaliaCopy } from "./nathaliaCopy";
import { useNathaliaPanelLayout } from "./useNathaliaPanelLayout";

export interface NathaliaChatPanelProps {
  className?: string;
}

/**
 * The expanded Nathal.IA panel: header, avatar + contextual message, quick
 * suggestions, a (mocked) conversation log and a prepared input. No LLM is
 * called — `sendMessage` returns a controlled mock.
 *
 * Sizing/placement is resolved from the viewport (`useNathaliaPanelLayout`) so
 * the panel can never open partially off-screen (Fase 8.1, Etapas 1–2).
 */
export function NathaliaChatPanel({ className }: NathaliaChatPanelProps) {
  const reduce = useReducedMotion();
  const layout = useNathaliaPanelLayout();
  const {
    state,
    message,
    messages,
    contextDef,
    user,
    followUps,
    speaking,
    viseme,
    runSuggestion,
    sendMessage,
  } = useNathalia();
  const [draft, setDraft] = useState("");
  const [muted, setMuted] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  useEffect(() => {
    setVoiceOn(isSpeechSupported());
    setMuted(isNathaliaMuted());
  }, []);
  const logRef = useRef<HTMLDivElement>(null);
  const stateDef = getNathaliaState(state);

  // Keep the conversation scrolled to the latest message.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages.length]);

  // Hide suggestions the current user's role cannot use: gate by the screen's
  // access, then drop any chip whose action RBAC would block (Etapa 5).
  const suggestions = canAccessContext(user, contextDef.key)
    ? contextDef.suggestions.filter(
        (s) => !s.action || canExecuteAction(user, s.action).allowed,
      )
    : [];

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    sendMessage(draft);
    setDraft("");
  }

  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      role="dialog"
      aria-label={`${nathaliaCopy.name} — ${nathaliaCopy.tagline}`}
      data-nathalia-placement={layout.placement}
      style={{ width: layout.width, height: layout.height }}
      className={[
        "flex flex-col overflow-hidden rounded-card border-2 border-ink bg-surface shadow-[6px_6px_0_0_var(--color-ink)]",
        className ?? "",
      ].join(" ")}
    >
      {/* Header */}
      <header className="flex items-center gap-3 border-b-2 border-ink bg-brand-soft px-4 py-3">
        <motion.div
          // Subtle entrance pop reinforcing the avatar's presence (Etapa 6).
          initial={reduce ? false : { scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <NathaliaAvatar
            state={state}
            context={contextDef.key}
            speaking={speaking}
            viseme={viseme}
            size={60}
            viewMode="bubble"
          />
        </motion.div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-sm font-bold text-strong">
            <Sparkles aria-hidden="true" className="size-3.5 text-brand" />
            {nathaliaCopy.name}
          </p>
          <p className="truncate text-xs text-medium">{nathaliaCopy.tagline}</p>
        </div>
        {voiceOn ? (
          <button
            type="button"
            onClick={() => {
              const next = !muted;
              setMuted(next);
              setNathaliaMuted(next);
              if (next) cancelNathaliaSpeech();
            }}
            aria-label={muted ? "Ativar voz da Nathal.IA" : "Silenciar voz da Nathal.IA"}
            aria-pressed={muted}
            title={muted ? "Ativar voz" : "Silenciar voz"}
            className="grid size-8 place-items-center rounded-md text-medium transition-colors hover:bg-surface hover:text-strong"
          >
            {muted ? (
              <VolumeX aria-hidden="true" className="size-4" />
            ) : (
              <Volume2 aria-hidden="true" className="size-4" />
            )}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => closeNathalia()}
          aria-label={nathaliaCopy.closeLabel}
          className="grid size-8 place-items-center rounded-md text-medium transition-colors hover:bg-surface hover:text-strong"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </header>

      {/* Contextual headline + conversation log */}
      <div ref={logRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {/* Keyed by context so a route change behind the panel briefly
            highlights the new screen's headline (Etapa 6). */}
        <motion.div
          key={contextDef.key}
          initial={reduce ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="rounded-card border border-border bg-canvas px-3 py-2"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-soft">
            {contextDef.label} · {stateDef.label}
          </p>
          <p className="mt-0.5 whitespace-pre-line text-sm leading-snug text-strong">
            {message}
          </p>
        </motion.div>

        {messages.map((m) => (
          <div
            key={m.id}
            className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <p
              className={[
                "max-w-[85%] whitespace-pre-line rounded-card px-3 py-2 text-sm leading-snug",
                m.role === "user"
                  ? "border-2 border-ink bg-brand text-white"
                  : "border border-border bg-canvas text-strong",
              ].join(" ")}
            >
              {m.text}
            </p>
          </div>
        ))}
      </div>

      {/* Dynamic follow-ups produced by the brain for the latest answer */}
      {followUps.length > 0 ? (
        <div className="border-t border-border px-4 py-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-soft">
            {nathaliaCopy.followUpsTitle}
          </p>
          <div className="flex flex-wrap gap-2">
            {followUps.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => sendMessage(q)}
                className="rounded-full border border-border bg-canvas px-3 py-1 text-xs font-medium text-strong transition-colors hover:border-brand hover:text-brand"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Quick suggestions */}
      {suggestions.length > 0 ? (
        <div className="border-t border-border px-4 py-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-soft">
            {nathaliaCopy.suggestionsTitle}
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => runSuggestion(s)}
                className="rounded-full border-2 border-ink bg-surface px-3 py-1 text-xs font-medium text-strong shadow-[2px_2px_0_0_var(--color-ink)] transition-transform hover:-translate-y-px"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Prepared input (mock reply only — no LLM in this phase) */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t-2 border-ink bg-canvas px-3 py-3"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={nathaliaCopy.inputPlaceholder}
          aria-label={nathaliaCopy.inputPlaceholder}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
        />
        <button
          type="submit"
          aria-label={nathaliaCopy.sendLabel}
          disabled={!draft.trim()}
          className="grid size-9 shrink-0 place-items-center rounded-md border-2 border-ink bg-brand text-white shadow-[2px_2px_0_0_var(--color-ink)] transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send aria-hidden="true" className="size-4" />
        </button>
      </form>
    </motion.section>
  );
}
