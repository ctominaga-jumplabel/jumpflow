"use client";

import { useEffect, useRef, useState } from "react";
import { Nathalia2DApp } from "./Nathalia2DApp";
import { useNathalia } from "./NathaliaProvider";
import { advanceNathaliaTour, setNathaliaState, stopNathaliaTour } from "./nathaliaStore";
import {
  audioForSpeechPoint,
  speechPointsForContext,
  textToVoice,
  type NathaliaSpeechPoint,
} from "./nathaliaSpeechCatalog";
import { voiceNathaliaCachedWithCallbacks } from "./nathaliaSpeech";
import type { NathaliaContextKey, NathaliaStateKey } from "./nathaliaTypes";

/**
 * Rendered avatar size during the guided tour. Kept equal to the minimized
 * widget's avatar (`NathaliaWidget`, size 430) so Nathal.IA has the **same
 * height** in the tour as in her idle/"aguardando" state.
 */
const TOUR_AVATAR_SIZE = 430;

export interface NathaliaTourStep {
  /** Element id to highlight. Missing anchors degrade to a floating callout. */
  targetId?: string;
  title: string;
  message: string;
  state: NathaliaStateKey;
}

export interface NathaliaTourDefinition {
  id: string;
  label: string;
  steps: NathaliaTourStep[];
}

function tourStepsFromSpeech(points: NathaliaSpeechPoint[]): NathaliaTourStep[] {
  return points.map((point) => ({
    targetId: point.targetId,
    title: point.title,
    message: point.message,
    state: point.state,
  }));
}

export const nathaliaTours: Record<string, NathaliaTourDefinition> = {
  hours: {
    id: "hours",
    label: "Tour de Horas",
    steps: tourStepsFromSpeech(speechPointsForContext("hours")),
  },
  approvals: {
    id: "approvals",
    label: "Tour de Aprovações",
    steps: tourStepsFromSpeech(speechPointsForContext("approvals")),
  },
};

export function NathaliaTour() {
  const { activeTour, tourStep } = useNathalia();
  const tour = activeTour ? nathaliaTours[activeTour] : undefined;
  const step = tour?.steps[tourStep];
  const isLast = tour && step ? tourStep >= tour.steps.length - 1 : false;
  const lastSpokenRef = useRef<string | null>(null);
  const [position, setPosition] = useState<
    | {
        mode: "anchored";
        avatarTop: number;
        avatarLeft: number;
        bubbleTop: number;
        bubbleLeft: number;
      }
    | { mode: "default" }
  >({ mode: "default" });
  const [avatarState, setAvatarState] = useState<NathaliaStateKey>("idle");

  const currentSpeechPoint = activeTour
    ? speechPointsForContext(activeTour as NathaliaContextKey)[tourStep]
    : undefined;

  const playCurrentStepVoice = () => {
    if (!step) return;
    setNathaliaState(step.state);
    setAvatarState(step.state);
    voiceNathaliaCachedWithCallbacks(
      currentSpeechPoint ? textToVoice(currentSpeechPoint) : step.message,
      currentSpeechPoint ? audioForSpeechPoint(currentSpeechPoint) : undefined,
      {
        fallbackToProvider: false,
        onEnd: () => {
          setAvatarState("listening");
          setNathaliaState("listening");
        },
      },
    );
  };

  useEffect(() => {
    if (!step) return;
    setNathaliaState(step.state);
    setAvatarState(step.state);
    const speechKey = `${activeTour ?? "tour"}:${tourStep}:${currentSpeechPoint?.id ?? step.title}`;
    if (lastSpokenRef.current !== speechKey) {
      lastSpokenRef.current = speechKey;
      playCurrentStepVoice();
    }
    if (isLast || !step.targetId || typeof document === "undefined") {
      setPosition({ mode: "default" });
      return;
    }

    let highlighted: HTMLElement | null = null;
    let prevOutline = "";
    let prevOffset = "";
    let prevScroll = "";
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clamp = (value: number, min: number, max: number) =>
      Math.min(Math.max(value, min), max);

    const updatePosition = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const avatarSize = TOUR_AVATAR_SIZE;
      const bubbleWidth = 300;
      const bubbleHeight = 104;
      const avatarLeft = clamp(rect.right + 18, 280, window.innerWidth - avatarSize - 16);
      const preferredBubbleLeft = rect.left + rect.width / 2 - bubbleWidth / 2;
      const bubbleLeftMaxBeforeAvatar = avatarLeft - bubbleWidth - 16;
      setPosition({
        mode: "anchored",
        avatarLeft,
        avatarTop: clamp(
          rect.top + rect.height / 2 - avatarSize / 2,
          88,
          window.innerHeight - avatarSize - 16,
        ),
        bubbleLeft: clamp(
          Math.min(preferredBubbleLeft, bubbleLeftMaxBeforeAvatar),
          280,
          window.innerWidth - bubbleWidth - 16,
        ),
        bubbleTop: clamp(
          rect.top - bubbleHeight - 12,
          88,
          window.innerHeight - bubbleHeight - 16,
        ),
      });
    };

    const tryHighlight = () => {
      const el = document.getElementById(step.targetId as string);
      if (el) {
        highlighted = el;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        prevOutline = el.style.outline;
        prevOffset = el.style.outlineOffset;
        prevScroll = el.style.scrollMarginBlock;
        el.style.outline = "3px solid var(--color-brand, #2457ff)";
        el.style.outlineOffset = "3px";
        el.style.scrollMarginBlock = "96px";
        updatePosition(el);
        timer = setTimeout(() => updatePosition(el), 300);
        return;
      }
      if (attempts++ < 12) timer = setTimeout(tryHighlight, 150);
    };
    tryHighlight();

    return () => {
      if (timer) clearTimeout(timer);
      if (highlighted) {
        highlighted.style.outline = prevOutline;
        highlighted.style.outlineOffset = prevOffset;
        highlighted.style.scrollMarginBlock = prevScroll;
      }
    };
  }, [isLast, step]);

  if (!tour || !step) return null;

  const bubble = (
    <div className="w-[19rem] max-w-[88vw] rounded-card border-2 border-ink bg-surface p-3 shadow-[4px_4px_0_0_var(--color-ink)]">
      <p className="text-xs font-semibold uppercase tracking-wide text-soft">
        {`${tour.label} - ${step.title}`}
      </p>
      <p className="text-sm leading-snug text-strong">{step.message}</p>
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={playCurrentStepVoice}
          className="rounded-md px-2 py-1 text-xs font-medium text-medium hover:text-strong"
        >
          Ouvir
        </button>
        {!isLast ? (
          <button
            type="button"
            onClick={() => stopNathaliaTour()}
            className="rounded-md px-2 py-1 text-xs font-medium text-medium hover:text-strong"
          >
            Pular
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => (isLast ? stopNathaliaTour() : advanceNathaliaTour())}
          className="rounded-md border-2 border-ink bg-brand px-2.5 py-1 text-xs font-semibold text-white shadow-[2px_2px_0_0_var(--color-ink)]"
        >
          {isLast ? "Concluir" : "Próximo"}
        </button>
      </div>
    </div>
  );

  if (position.mode === "anchored") {
    return (
      <>
        <div
          className="pointer-events-auto fixed z-[9999]"
          style={{
            top: `${position.bubbleTop}px`,
            left: `${position.bubbleLeft}px`,
          }}
        >
          {bubble}
        </div>
        <div
          className="pointer-events-none fixed z-[9999]"
          style={{
            top: `${position.avatarTop}px`,
            left: `${position.avatarLeft}px`,
          }}
        >
          <Nathalia2DApp
            state={avatarState}
            size={TOUR_AVATAR_SIZE}
            viewMode="lab"
            className="drop-shadow-[0_18px_24px_rgba(0,0,0,0.18)]"
          />
        </div>
      </>
    );
  }

  return (
    <div
      className="pointer-events-auto fixed z-[9999] flex items-end gap-3"
      style={{ bottom: "1rem", right: "1rem", flexDirection: "row-reverse" }}
    >
      <Nathalia2DApp
        state={avatarState}
        size={TOUR_AVATAR_SIZE}
        viewMode="lab"
        className="drop-shadow-[0_18px_24px_rgba(0,0,0,0.18)]"
      />
      {bubble}
    </div>
  );
}
