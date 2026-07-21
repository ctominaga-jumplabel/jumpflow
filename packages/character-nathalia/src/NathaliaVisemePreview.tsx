"use client";

/**
 * NathaliaVisemePreview — shows a single mouth shape (viseme) or cycles through
 * the whole set to demonstrate simulated lip-sync. Used by the Debug Lab to
 * exercise the speaking mouth-swap without any audio/TTS.
 *
 * - Static: pass `viseme` and leave `cycle` false → renders that mouth shape.
 * - Animated: set `cycle` → loops a natural-ish viseme sequence on an interval,
 *   respecting reduced motion (falls back to `rest`).
 */
import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { intentAccent } from "./nathaliaStates";
import {
  NATHALIA_VISEMES,
  visemeImageUrl,
  type NathaliaVisemeKey,
} from "./nathaliaExpressions";

/** Natural-ish mouth sequence — mirrors the avatar's lip-sync fallback. */
const VISEME_SEQUENCE: NathaliaVisemeKey[] = [
  "rest", "a", "e", "o", "m", "i", "u", "s", "a", "o", "e", "rest", "tdn", "a", "rest",
];
const FRAME_MS = 135;

export interface NathaliaVisemePreviewProps {
  /** Static mouth shape to show when not cycling. Defaults to `"rest"`. */
  viseme?: NathaliaVisemeKey;
  /** When true, loop through the viseme sequence (simulated speech). */
  cycle?: boolean;
  /** Pixel size of the square preview. */
  size?: number;
  withRing?: boolean;
  baseUrl?: string;
  className?: string;
}

export function NathaliaVisemePreview({
  viseme = "rest",
  cycle = false,
  size = 72,
  withRing = true,
  baseUrl,
  className,
}: NathaliaVisemePreviewProps) {
  const reduce = useReducedMotion();
  const [idx, setIdx] = useState(0);
  const animate = cycle && !reduce;

  useEffect(() => {
    if (!animate || typeof window === "undefined") {
      setIdx(0);
      return;
    }
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % VISEME_SEQUENCE.length);
    }, FRAME_MS);
    return () => window.clearInterval(id);
  }, [animate]);

  const current: NathaliaVisemeKey = animate ? VISEME_SEQUENCE[idx] : viseme;
  const accent = intentAccent.info;

  return (
    <div
      data-nathalia-viseme={current}
      className={[
        "relative grid place-items-center overflow-hidden rounded-full",
        accent.chip,
        withRing ? `ring-2 ring-offset-1 ${accent.ring}` : "",
        className ?? "",
      ].join(" ")}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Visema ${current}`}
    >
      <img
        src={visemeImageUrl(current, baseUrl)}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="absolute inset-0 h-full w-full select-none object-cover"
        style={{ objectPosition: "50% 46%" }}
      />
    </div>
  );
}

/** The full ordered viseme catalog (for grids/legends). */
export const NATHALIA_VISEME_LIST = NATHALIA_VISEMES;
