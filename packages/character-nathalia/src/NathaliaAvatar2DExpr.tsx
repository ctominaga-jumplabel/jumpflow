"use client";

/**
 * NathaliaAvatar2DExpr — expressive 2D avatar driven by the hand-illustrated
 * expression busts (Fase 9). Unlike the dependency-free SVG fallback
 * (`NathaliaAvatar2D`), this renders the official artwork and **crossfades
 * between real expressions** as the assistant's state and the current screen
 * change, with a gentle idle motion (breathe + sway). Still SSR-safe and
 * reduced-motion aware; no WebGL.
 *
 * Expression resolution lives in `nathaliaExpressions.ts` (state → context →
 * default). The colored disc + ring follow the emotional intent, echoing the
 * "Sempre com você" badges in the reference.
 */
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { getNathaliaState, intentAccent } from "./nathaliaStates";
import { nextBlinkDelaySec } from "./nathaliaIdle";
import { nathaliaCopy } from "./nathaliaCopy";
import type { NathaliaViewMode } from "./nathaliaFraming";
import type { NathaliaContextKey, NathaliaStateKey } from "./nathaliaTypes";
import {
  expressionFor,
  expressionImageUrl,
  objectForContext,
  objectImageUrl,
  reachableExpressions,
  visemeImageUrl,
  type NathaliaExpressionKey,
  type NathaliaVisemeKey,
} from "./nathaliaExpressions";

/** A short, natural-ish mouth sequence cycled while "speaking" (lip-sync). */
const VISEME_SEQUENCE: NathaliaVisemeKey[] = [
  "rest", "a", "e", "o", "m", "i", "u", "s", "a", "o", "e", "rest", "tdn", "a", "rest",
];
const VISEME_FRAME_MS = 135;

export interface NathaliaAvatar2DExprProps {
  state?: NathaliaStateKey;
  /** Current screen — drives the resting expression. */
  context?: NathaliaContextKey;
  /** Hard override of the expression (wins over state/context). */
  expression?: NathaliaExpressionKey;
  size?: number;
  withRing?: boolean;
  viewMode?: NathaliaViewMode;
  /** When true, animate the mouth for a talking (lip-sync) effect. */
  speaking?: boolean;
  /**
   * Audio-driven mouth shape (viseme key) from the speech engine. When provided
   * while speaking, it overrides the cyclic fallback for precise lip-sync.
   */
  viseme?: string | null;
  /** Base URL where the expression PNGs are served. */
  baseUrl?: string;
  className?: string;
}

/** Assets are face-centered squares, so a near-centered position works for all. */
const OBJECT_POSITION: Record<NathaliaViewMode, string> = {
  bubble: "50% 44%",
  panel: "50% 46%",
  lab: "50% 50%",
};

export function NathaliaAvatar2DExpr({
  state = "idle",
  context = "general",
  expression,
  size = 56,
  withRing = true,
  viewMode = "bubble",
  speaking = false,
  viseme: audioViseme = null,
  baseUrl,
  className,
}: NathaliaAvatar2DExprProps) {
  const reduce = useReducedMotion();
  const def = getNathaliaState(state);
  const accent = intentAccent[def.intent];
  const key = expressionFor(state, context, expression ?? null);
  const src = expressionImageUrl(key, baseUrl);
  const objectPosition = OBJECT_POSITION[viewMode] ?? OBJECT_POSITION.bubble;

  // Lip-sync: prefer the engine's audio-driven viseme (precise, synced to the
  // real speech); fall back to a cyclic loop when no boundary data is available.
  const [visemeIdx, setVisemeIdx] = useState<number | null>(null);
  const lipSync = speaking && !reduce;
  const hasAudioViseme = lipSync && typeof audioViseme === "string" && audioViseme.length > 0;
  useEffect(() => {
    if (!lipSync || hasAudioViseme || typeof window === "undefined") {
      setVisemeIdx(null);
      return;
    }
    let i = 0;
    setVisemeIdx(0);
    const id = window.setInterval(() => {
      i = (i + 1) % VISEME_SEQUENCE.length;
      setVisemeIdx(i);
    }, VISEME_FRAME_MS);
    return () => window.clearInterval(id);
  }, [lipSync, hasAudioViseme]);

  const viseme = hasAudioViseme
    ? (audioViseme as string)
    : visemeIdx !== null
      ? VISEME_SEQUENCE[visemeIdx]
      : null;
  const displayKey = viseme ? `vis-${viseme}` : key;
  const displaySrc = viseme ? visemeImageUrl(viseme as NathaliaVisemeKey, baseUrl) : src;

  // ---------------------------------------------------------------------------
  // Idle micro-life (Nível 1 — "ícone vivo"). The assets are full-face busts
  // (no separate eyelid layer), so squashing the image to fake a blink read as
  // the *whole circle* blinking — wrong. Until a dedicated "closed-eyes" frame
  // exists, we keep the life subtle and natural: the breathe/sway loop (below)
  // plus an occasional, gentle side-glance (translateX) — never a squash. Timing
  // reuses the shared `nextBlinkDelaySec()`; inert while lip-syncing and under
  // reduced motion.
  // ---------------------------------------------------------------------------
  const glanceAllowed = !reduce && !lipSync;
  const [glanceX, setGlanceX] = useState(0);
  useEffect(() => {
    if (!glanceAllowed || typeof window === "undefined") {
      setGlanceX(0);
      return;
    }
    let glanceTimer: number | undefined;
    let backTimer: number | undefined;

    const scheduleNext = () => {
      const delayMs = nextBlinkDelaySec() * 1000;
      glanceTimer = window.setTimeout(() => {
        const dir = Math.random() < 0.5 ? -1 : 1;
        setGlanceX(dir * Math.max(1, size * 0.025));
        backTimer = window.setTimeout(() => {
          setGlanceX(0);
          scheduleNext();
        }, 520);
      }, delayMs);
    };
    scheduleNext();

    return () => {
      if (glanceTimer) window.clearTimeout(glanceTimer);
      if (backTimer) window.clearTimeout(backTimer);
    };
  }, [glanceAllowed, size]);
  // The screen's idealized object (clock on Hours, chart on Reports, …), shown
  // as a small badge. Hidden on tiny renders where it would be illegible.
  const objectKey = objectForContext(context);
  const showBadge = objectKey !== null && size >= 44;
  const badgeSize = Math.round(size * 0.4);

  // Preload the reachable expression set (and visemes) so swaps don't flash.
  useEffect(() => {
    if (typeof window === "undefined") return;
    reachableExpressions().forEach((k) => {
      const img = new window.Image();
      img.src = expressionImageUrl(k, baseUrl);
    });
    VISEME_SEQUENCE.forEach((v) => {
      const img = new window.Image();
      img.src = visemeImageUrl(v, baseUrl);
    });
  }, [baseUrl]);

  // Idle = slow breathe/sway. While speaking = a gentle, slightly livelier nod so
  // the lip-sync reads as "talking" without looking jittery/flickery (the mouth
  // frames already carry the motion). Amplitudes are deliberately small.
  const idleMotion = useMemo(() => {
    if (reduce) return {};
    if (lipSync) return { y: [0, -size * 0.014, 0], rotate: [-0.25, 0.25, -0.25] };
    return { y: [0, -size * 0.02, 0], rotate: [-1.1, 1.1, -1.1] };
  }, [reduce, size, lipSync]);
  const motionTransition = lipSync
    ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" as const }
    : { duration: 6, repeat: Infinity, ease: "easeInOut" as const };

  return (
    // Outer wrapper is NOT clipped, so the object badge can overhang the circle.
    <div
      data-nathalia-state={state}
      data-nathalia-variant="2d-expr"
      data-nathalia-expression={key}
      data-nathalia-object={objectKey ?? undefined}
      data-nathalia-speaking={lipSync ? "1" : "0"}
      data-nathalia-view={viewMode}
      className={["relative", className ?? ""].join(" ")}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${nathaliaCopy.name} — ${def.label}`}
    >
      <div
        className={[
          "absolute inset-0 grid place-items-center overflow-hidden rounded-full",
          accent.chip,
          withRing ? `ring-2 ring-offset-1 ${accent.ring}` : "",
        ].join(" ")}
      >
        <motion.div
          className="absolute inset-0"
          style={{ transformOrigin: "50% 80%" }}
          animate={idleMotion}
          transition={motionTransition}
        >
          {/* Side-glance layer: nudges `x` for the occasional glance (no squash —
              see the idle-life note above). Sits between the breathe/sway wrapper
              and the crossfading image so it never re-triggers the expression/viseme
              transition. Inert under reduced motion / lip-sync. */}
          <motion.div
            className="absolute inset-0"
            animate={{ x: glanceX }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          >
            <AnimatePresence initial={false}>
              <motion.img
                key={displayKey}
                src={displaySrc}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="absolute inset-0 h-full w-full select-none object-cover"
                style={{ objectPosition }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                // Short crossfade between mouth frames (lip-sync) to soften the pop;
                // slightly longer, soft crossfade between expressions.
                transition={{ duration: reduce ? 0 : viseme ? 0.09 : 0.3, ease: "easeOut" }}
              />
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </div>

      {showBadge ? (
        <motion.span
          key={objectKey}
          initial={reduce ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="grid place-items-center rounded-full border-2 border-ink bg-surface shadow-[2px_2px_0_0_var(--color-ink)]"
          // Inline insets: Tailwind `bottom-0/right-0` aren't reliably emitted for
          // this package's classes, so anchor explicitly (cf. the widget fix).
          style={{ position: "absolute", bottom: 0, right: 0, width: badgeSize, height: badgeSize }}
          aria-hidden="true"
        >
          <img
            src={objectImageUrl(objectKey, baseUrl)}
            alt=""
            draggable={false}
            className="h-[74%] w-[74%] object-contain"
          />
        </motion.span>
      ) : null}
    </div>
  );
}
