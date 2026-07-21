"use client";

/**
 * NathaliaAnimationController — composes the avatar's layers for one animation
 * state and breathes life into them.
 *
 * Responsibilities:
 *   • resolve the layer stack from the catalog (body → face → eyes/mouth → object),
 *     skipping layers with no art (today: no body, so the face bust is the base);
 *   • play the state's motion profile (breathe / sway / tilt) from the registry;
 *   • run involuntary micro-life (blink/occasional side-glance) when the state allows;
 *   • lip-sync by preferring separated mouth overlays when available, otherwise
 *     swapping the face frame to the matching viseme while speaking,
 *     preferring the engine's audio-driven viseme over a cyclic fallback.
 *
 * The fallback viseme/glance logic mirrors the proven `NathaliaAvatar2DExpr`.
 * Older assets are full-face busts, so the face frame swaps only when separated
 * mouth art is not present. SSR-safe, reduced-motion aware, no WebGL.
 */
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { NathaliaLayer } from "./NathaliaLayer";
import { getNathaliaState, intentAccent } from "./nathaliaStates";
import { nextBlinkDelaySec } from "./nathaliaIdle";
import { nathaliaCopy } from "./nathaliaCopy";
import {
  getAnimationDef,
  motionKeyframes,
  type NathaliaAnimationState,
} from "./nathaliaAnimationRegistry";
import { hasLayer, spriteFor, spriteUrl } from "./nathaliaSpriteCatalog";
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
import type { NathaliaViewMode } from "./nathaliaFraming";
import type { NathaliaContextKey } from "./nathaliaTypes";

/** A short, natural-ish mouth sequence cycled while "speaking" (lip-sync). */
const VISEME_SEQUENCE: NathaliaVisemeKey[] = [
  "rest", "a", "e", "o", "m", "i", "u", "s", "a", "o", "e", "rest", "tdn", "a", "rest",
];
const VISEME_FRAME_MS = 135;

const OBJECT_POSITION: Record<NathaliaViewMode, string> = {
  bubble: "50% 44%",
  panel: "50% 46%",
  lab: "50% 50%",
};

export interface NathaliaAnimationControllerProps {
  animation: NathaliaAnimationState;
  context?: NathaliaContextKey;
  /** Hard override of the expression (wins over the state's expression). */
  expression?: NathaliaExpressionKey;
  /** Force lip-sync regardless of the state (e.g. while a reply streams). */
  speaking?: boolean;
  /** Audio-driven mouth shape; overrides the cyclic fallback when speaking. */
  viseme?: string | null;
  size?: number;
  withRing?: boolean;
  viewMode?: NathaliaViewMode;
  /** Base URL where the face/viseme/object PNGs are served. */
  baseUrl?: string;
  className?: string;
}

export function NathaliaAnimationController({
  animation,
  context = "general",
  expression,
  speaking,
  viseme: audioViseme = null,
  size = 56,
  withRing = true,
  viewMode = "bubble",
  baseUrl,
  className,
}: NathaliaAnimationControllerProps) {
  const reduce = useReducedMotion();
  const def = getAnimationDef(animation);
  const emo = getNathaliaState(def.stateKey);
  const accent = intentAccent[emo.intent];
  const objectPosition = OBJECT_POSITION[viewMode] ?? OBJECT_POSITION.bubble;

  // Face base frame (expression for the state/context, or explicit override).
  const expressionKey = expressionFor(def.stateKey, context, expression ?? null);
  const faceSrc = expressionImageUrl(expressionKey, baseUrl);

  // --- Lip-sync ------------------------------------------------------------
  const isSpeaking = (speaking ?? def.speaking) && !reduce;
  const hasAudioViseme = isSpeaking && typeof audioViseme === "string" && audioViseme.length > 0;
  const [visemeIdx, setVisemeIdx] = useState<number | null>(null);
  useEffect(() => {
    if (!isSpeaking || hasAudioViseme || typeof window === "undefined") {
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
  }, [isSpeaking, hasAudioViseme]);

  const activeViseme = hasAudioViseme
    ? (audioViseme as string)
    : visemeIdx !== null
      ? VISEME_SEQUENCE[visemeIdx]
      : null;

  const hasMouthLayers = hasLayer("mouths");
  const hasEyeLayers = hasLayer("eyes");
  const mouthKey = isSpeaking ? ((activeViseme ?? "rest") as NathaliaVisemeKey) : null;
  const mouthSprite = mouthKey ? spriteFor("mouth", mouthKey) : null;
  const mouthUrl = spriteUrl(mouthSprite);

  // Legacy fallback: when separated mouths are absent, swap the whole face to a
  // full-face viseme. With mouth layers present, keep the expression face stable
  // and overlay just the mouth region.
  const shouldSwapFullFaceViseme = activeViseme && !mouthUrl;
  const faceFrameKey = shouldSwapFullFaceViseme ? `vis-${activeViseme}` : `expr-${expressionKey}`;
  const faceFrameSrc = shouldSwapFullFaceViseme
    ? visemeImageUrl(activeViseme as NathaliaVisemeKey, baseUrl)
    : faceSrc;

  // --- Optional body base layer (absent today; ready for future art) -------
  const orientation = "front";
  const bodySprite = hasLayer("body") ? spriteFor("body", orientation) : null;
  const bodyUrl = spriteUrl(bodySprite);

  // --- Involuntary side-glance (no squash; see 2DExpr note) ----------------
  const glanceAllowed = !reduce && !isSpeaking && def.blink;
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

  // --- Real blink overlay when eye art exists -----------------------------
  const [blinkClosed, setBlinkClosed] = useState(false);
  useEffect(() => {
    if (!glanceAllowed || !hasEyeLayers || typeof window === "undefined") {
      setBlinkClosed(false);
      return;
    }
    let blinkTimer: number | undefined;
    let openTimer: number | undefined;
    const scheduleNext = () => {
      const delayMs = nextBlinkDelaySec() * 1000;
      blinkTimer = window.setTimeout(() => {
        setBlinkClosed(true);
        openTimer = window.setTimeout(() => {
          setBlinkClosed(false);
          scheduleNext();
        }, 140);
      }, delayMs);
    };
    scheduleNext();
    return () => {
      if (blinkTimer) window.clearTimeout(blinkTimer);
      if (openTimer) window.clearTimeout(openTimer);
    };
  }, [glanceAllowed, hasEyeLayers]);

  const eyeSprite = blinkClosed ? spriteFor("eye", "closed") : null;
  const eyeUrl = spriteUrl(eyeSprite);

  // --- Context object badge ------------------------------------------------
  const objectKey = objectForContext(context);
  const showBadge = objectKey !== null && size >= 44;
  const badgeSize = Math.round(size * 0.4);

  // Preload reachable faces + visemes so swaps don't flash.
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

  // --- Whole-character motion (from the registry's profile) ----------------
  const kf = useMemo(() => motionKeyframes(def.motion, size), [def.motion, size]);
  const idleMotion = reduce
    ? {}
    : { y: kf.y, rotate: kf.rotate, ...(kf.scale ? { scale: kf.scale } : {}) };
  const motionTransition = {
    duration: kf.durationSec,
    repeat: Infinity,
    ease: "easeInOut" as const,
  };

  return (
    <div
      data-nathalia-variant="2d-layered"
      data-nathalia-animation={animation}
      data-nathalia-state={def.stateKey}
      data-nathalia-expression={expressionKey}
      data-nathalia-object={objectKey ?? undefined}
      data-nathalia-speaking={isSpeaking ? "1" : "0"}
      data-nathalia-body={bodyUrl ? "1" : "0"}
      data-nathalia-eyes={eyeUrl ? "closed" : hasEyeLayers ? "open" : "none"}
      data-nathalia-mouth={mouthUrl ? mouthKey ?? undefined : "full-face"}
      data-nathalia-view={viewMode}
      className={["relative", className ?? ""].join(" ")}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${nathaliaCopy.name} — ${emo.label}`}
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
          <motion.div
            className="absolute inset-0"
            animate={{ x: glanceX }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          >
            {/* Body base layer — only when art exists (future). */}
            {bodyUrl ? (
              <NathaliaLayer
                src={bodyUrl}
                frameKey={`body-${orientation}`}
                fit="contain"
                objectPosition="50% 100%"
                reduce={reduce ?? false}
              />
            ) : null}
            {/* Face layer — expression bust, swapping to viseme faces while speaking. */}
            <NathaliaLayer
              src={faceFrameSrc}
              frameKey={faceFrameKey}
              objectPosition={objectPosition}
              fit="cover"
              crossfadeSec={activeViseme ? 0.09 : 0.3}
              reduce={reduce ?? false}
            />
            {mouthUrl && mouthKey ? (
              <NathaliaLayer
                src={mouthUrl}
                frameKey={`mouth-${mouthKey}`}
                objectPosition={objectPosition}
                fit="cover"
                crossfadeSec={0.07}
                reduce={reduce ?? false}
              />
            ) : null}
            {eyeUrl ? (
              <NathaliaLayer
                src={eyeUrl}
                frameKey="eyes-closed"
                objectPosition={objectPosition}
                fit="cover"
                crossfadeSec={0.04}
                reduce={reduce ?? false}
              />
            ) : null}
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
