/**
 * Idle Intelligence config for Nathal.IA (Fase 7, Etapa 8).
 *
 * The body keeps moving via the looping `Idle` clip (breathing + weight shift),
 * but a character only feels *alive* with involuntary micro-behaviour on top:
 * occasional blinks (sometimes a quick double), a subtle resting smile and tiny
 * head drift. This module is the data contract for that behaviour; the 2D
 * expression avatar (`NathaliaAvatar2DExpr`) consumes `nextBlinkDelaySec()` to
 * schedule its simulated blink.
 *
 * Pure, side-effect-free and three-free — safe to import anywhere and to unit
 * test. The randomness lives in the consumer, not here (this is just the dials).
 *
 * Design rule (`docs/nathalia/IDLE_BEHAVIOR.md`): never robotic. Intervals are
 * randomised inside a window, blinks are fast and asymmetric-friendly, and all
 * of it freezes under `prefers-reduced-motion`.
 */

/** Blink timing/shape (seconds). Drives the `Blink_L` / `Blink_R` morphs. */
export interface NathaliaBlinkConfig {
  /** Shortest gap between blinks. */
  minIntervalSec: number;
  /** Longest gap between blinks. */
  maxIntervalSec: number;
  /** How long a single blink takes to close+open. */
  durationSec: number;
  /** Probability [0–1] that a blink is immediately followed by a second one. */
  doubleBlinkChance: number;
  /** Peak eyelid-closed weight (0–1). */
  closedWeight: number;
}

/** Tiny resting head/eye drift so the gaze does not feel frozen. */
export interface NathaliaMicroMotionConfig {
  /** Amplitude of the resting-smile pulse added to the state's Smile weight. */
  smilePulse: number;
  /** Period of the smile pulse, seconds. */
  smilePulsePeriodSec: number;
}

export interface NathaliaIdleConfig {
  blink: NathaliaBlinkConfig;
  micro: NathaliaMicroMotionConfig;
}

/** Default idle behaviour — tuned to read as calm and human, not twitchy. */
export const nathaliaIdleConfig: NathaliaIdleConfig = {
  blink: {
    minIntervalSec: 2.4,
    maxIntervalSec: 6.0,
    durationSec: 0.16,
    doubleBlinkChance: 0.18,
    closedWeight: 1,
  },
  micro: {
    smilePulse: 0.06,
    smilePulsePeriodSec: 7,
  },
};

/**
 * Pick the next blink delay (seconds) inside the configured window. The caller
 * supplies the random source so this stays deterministic in tests.
 */
export function nextBlinkDelaySec(
  cfg: NathaliaBlinkConfig = nathaliaIdleConfig.blink,
  rand: () => number = Math.random,
): number {
  const span = Math.max(0, cfg.maxIntervalSec - cfg.minIntervalSec);
  return cfg.minIntervalSec + rand() * span;
}

/**
 * Eyelid weight (0–1) at `t` seconds into a blink of length `durationSec`.
 * A simple symmetric close→open triangle; 0 before/after the blink window.
 */
export function blinkWeightAt(t: number, durationSec: number): number {
  if (t <= 0 || t >= durationSec) return 0;
  const half = durationSec / 2;
  return t < half ? t / half : 1 - (t - half) / half;
}
