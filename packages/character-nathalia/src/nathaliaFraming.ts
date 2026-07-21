/**
 * Avatar framing for Nathal.IA (Fase 7.1 — enquadramento).
 *
 * Pure, three-free data + math. In the 2D product the part that stays in use is
 * the `NathaliaViewMode` enum (`bubble | panel | lab`), which the expression
 * avatar maps to an `object-position` crop. The normalised camera/zoom math
 * below is **legacy** from the discontinued 3D path (kept harmless; no three) —
 * see `docs/nathalia/TECHNICAL_ARCHITECTURE.md`.
 *
 * Three view modes:
 *  - `"bubble"` → tight close-up/bust: face, shoulders and upper torso fill the
 *    floating circle. Never tries to show the whole body. (default)
 *  - `"panel"`  → half/upper body for the expanded panel.
 *  - `"lab"`    → looser full-body framing, meant to be driven by the dev Lab
 *    controls (`zoom`, `cameraY`, `modelScale`).
 */

/** Which framing preset to use. */
export type NathaliaViewMode = "bubble" | "panel" | "lab";

/** Caller overrides layered on top of a preset (all optional). */
export interface NathaliaFramingOverrides {
  /** Multiplier on closeness: `> 1` zooms in (smaller distance), `< 1` out. */
  zoom?: number;
  /** Vertical offset added to the preset look-at height (camera pans up/down). */
  cameraY?: number;
  /** Multiplier on the normalised model scale. */
  modelScale?: number;
  /** Extra model offset in normalised space (x=side, y=up, z=depth). */
  modelPosition?: [number, number, number];
}

/** Fully resolved framing consumed by the R3F canvas. */
export interface ResolvedNathaliaFraming {
  /** Look-at height (and camera height) in normalised units. */
  targetY: number;
  /** Camera distance from the target in normalised units. */
  distance: number;
  /** Perspective field of view, in degrees. */
  fov: number;
  /** Effective uniform model scale. */
  modelScale: number;
  /** Effective model offset in normalised space. */
  modelPosition: [number, number, number];
}

/**
 * Per-mode 3D presets. Tuned against a unit-height, origin-centred model so the
 * bubble lands a bust at ~75–90% of the frame without touching the GLB.
 */
export const nathaliaFramingPresets: Record<
  NathaliaViewMode,
  ResolvedNathaliaFraming
> = {
  // Close-up bust: aim at the face, pull the camera in tight so the face is the
  // protagonist with shoulders + upper torso filling the rest of the circle —
  // matching the reference "Sempre com você" badges (Fase 8.2).
  bubble: { targetY: 0.38, distance: 0.66, fov: 28, modelScale: 1, modelPosition: [0, 0, 0] },
  // Half body: waist-up, head comfortably inside the frame.
  panel: { targetY: 0.16, distance: 1.55, fov: 32, modelScale: 1, modelPosition: [0, 0, 0] },
  // Full body, looser — the Lab drives it further with the controls.
  lab: { targetY: 0.02, distance: 2.1, fov: 35, modelScale: 1, modelPosition: [0, 0, 0] },
};

/** Clamp helper (kept local so the module stays dependency-free). */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Resolve a view mode + overrides into a concrete camera framing.
 *
 * - `zoom` divides the distance (`zoom > 1` ⇒ closer); clamped to a sane range.
 * - `cameraY` is added to the preset look-at height.
 * - `modelScale` multiplies the preset scale; `modelPosition` replaces it.
 */
export function resolveNathaliaFraming(
  viewMode: NathaliaViewMode = "bubble",
  overrides: NathaliaFramingOverrides = {},
): ResolvedNathaliaFraming {
  const base = nathaliaFramingPresets[viewMode] ?? nathaliaFramingPresets.bubble;
  const zoom = clamp(overrides.zoom ?? 1, 0.25, 4);
  const modelScale = base.modelScale * clamp(overrides.modelScale ?? 1, 0.25, 4);

  return {
    targetY: base.targetY + (overrides.cameraY ?? 0),
    distance: clamp(base.distance / zoom, 0.2, 12),
    fov: base.fov,
    modelScale,
    modelPosition: overrides.modelPosition ?? base.modelPosition,
  };
}

/** SVG content framing for the 2D fallback, kept visually in sync with the 3D. */
export interface Nathalia2DFraming {
  /** Uniform scale of the character content inside the clipped circle. */
  scale: number;
  /** Pivot the scale is applied around, in the `0..100` SVG viewBox. */
  originX: number;
  originY: number;
}

/**
 * 2D framing per view mode so the CSS/SVG fallback matches the 3D crop: the
 * bubble zooms into the face/bust, the panel shows a bit more, the lab is 1:1.
 * Applied as a transform on the character group inside the circular clip.
 */
export const nathalia2DFramingPresets: Record<NathaliaViewMode, Nathalia2DFraming> = {
  bubble: { scale: 1.85, originX: 50, originY: 44 },
  panel: { scale: 1.12, originX: 50, originY: 46 },
  lab: { scale: 1, originX: 50, originY: 50 },
};

/** Resolve the 2D content framing for a view mode. */
export function nathalia2DFraming(
  viewMode: NathaliaViewMode = "bubble",
): Nathalia2DFraming {
  return nathalia2DFramingPresets[viewMode] ?? nathalia2DFramingPresets.bubble;
}

/** SVG `transform` string that scales the content about its framing pivot. */
export function nathalia2DTransform(viewMode: NathaliaViewMode = "bubble"): string {
  const { scale, originX, originY } = nathalia2DFraming(viewMode);
  if (scale === 1) return "";
  return `translate(${originX} ${originY}) scale(${scale}) translate(${-originX} ${-originY})`;
}
