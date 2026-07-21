"use client";

/**
 * NathaliaAvatar — the assistant's face.
 *
 * Default: the hand-illustrated, state-driven 2D expression avatar
 * (`NathaliaAvatar2DExpr`), falling back to the dependency-free SVG avatar
 * (`NathaliaAvatar2D`) when `NEXT_PUBLIC_NATHALIA_2D_EXPR=false`.
 *
 * Opt-in Rive path: with `NEXT_PUBLIC_NATHALIA_RIVE=true` it renders the
 * interactive vector avatar (`NathaliaAvatarRiveLazy`), which drives an authored
 * `.riv` state machine (real eyelid blink + visemes). The Rive runtime is lazy,
 * decided only after mount, and falls back to the 2D avatar while loading or if
 * no `.riv` is present — so the first paint is always the safe 2D face and
 * enabling the flag early is harmless. See `docs/nathalia/RIVE_SPEC.md`.
 *
 * There is intentionally no 3D/WebGL path (discontinued — see
 * `docs/nathalia/TECHNICAL_ARCHITECTURE.md`).
 */
import { useEffect, useState } from "react";
import { NathaliaAvatar2D } from "./NathaliaAvatar2D";
import { NathaliaAvatar2DExpr } from "./NathaliaAvatar2DExpr";
import { Nathalia2DAvatar } from "./Nathalia2DAvatar";
import { NathaliaAvatarRiveLazy } from "./NathaliaAvatarRiveLazy";
import { NathaliaVideoAvatar } from "./NathaliaVideoAvatar";
import { isExpressive2DEnabled } from "./nathaliaExpressions";
import { isNathaliaRiveEnabled } from "./nathaliaRive";
import type { NathaliaViewMode } from "./nathaliaFraming";
import type { NathaliaContextKey, NathaliaStateKey } from "./nathaliaTypes";

/**
 * Whether the layered, catalog-driven 2D avatar (`Nathalia2DAvatar`) is used for
 * the 2D path. Off by default — opt in with `NEXT_PUBLIC_NATHALIA_2D_LAYERED=true`.
 * Decided after mount (like Rive) so the first paint stays the safe expressive
 * bust and enabling the flag early is harmless.
 */
export function isLayered2DEnabled(): boolean {
  return process.env.NEXT_PUBLIC_NATHALIA_2D_LAYERED === "true";
}

/**
 * Whether the video avatar is used. Opt-in: the heavy video clips are served
 * from external storage (not versioned), so the path only turns on when
 * `NEXT_PUBLIC_NATHALIA_VIDEO_BASE_URL` points at that CDN/bucket. When unset,
 * the assistant uses the illustrated 2D avatar (assets versioned in the repo).
 * A follow-up escape hatch: `NEXT_PUBLIC_NATHALIA_VIDEO_2D=false` force-disables
 * video even if a base URL is configured.
 */
export function isVideo2DEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_NATHALIA_VIDEO_2D === "false") return false;
  return Boolean(process.env.NEXT_PUBLIC_NATHALIA_VIDEO_BASE_URL);
}

export interface NathaliaAvatarProps {
  /** Current emotional state (drives expression + animation). */
  state?: NathaliaStateKey;
  /** Current screen context — drives the resting expression of the 2D avatar. */
  context?: NathaliaContextKey;
  /** When true, the avatar lip-syncs (viseme mouth-swap) — used while replying. */
  speaking?: boolean;
  /** Audio-driven mouth shape (viseme key) for precise lip-sync; null → cyclic. */
  viseme?: string | null;
  /** Pixel size of the square avatar. */
  size?: number;
  /** Add the intent-colored ring around the avatar. */
  withRing?: boolean;
  /** Framing preset: close-up bust / half body / free. Defaults to `"bubble"`. */
  viewMode?: NathaliaViewMode;
  className?: string;
}

export function NathaliaAvatar({
  state = "idle",
  context = "general",
  speaking = false,
  viseme = null,
  size = 56,
  withRing = true,
  viewMode = "bubble",
  className,
}: NathaliaAvatarProps) {
  // Defer the renderer decision to a client effect so the first paint is always
  // the safe 2D avatar (no SSR/hydration surprises; Rive's WASM never runs server-side).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const video2D = (
    <NathaliaVideoAvatar
      state={state}
      context={context}
      size={size}
      withRing={withRing}
      viewMode={viewMode}
      className={className}
    />
  );

  // The 2D face — also the fallback for the Rive path.
  const twoD = isExpressive2DEnabled() ? (
    <NathaliaAvatar2DExpr
      state={state}
      context={context}
      speaking={speaking}
      viseme={viseme}
      size={size}
      withRing={withRing}
      viewMode={viewMode}
      className={className}
    />
  ) : (
    <NathaliaAvatar2D
      state={state}
      size={size}
      withRing={withRing}
      viewMode={viewMode}
      className={className}
    />
  );

  if (isVideo2DEnabled()) {
    return video2D;
  }

  // Opt-in layered avatar: richer, catalog-driven motion. Decided after mount so
  // the first paint is the safe bust and the (default-off) flag is harmless early.
  if (mounted && isLayered2DEnabled()) {
    return (
      <Nathalia2DAvatar
        state={state}
        context={context}
        speaking={speaking}
        viseme={viseme}
        size={size}
        withRing={withRing}
        viewMode={viewMode}
        className={className}
      />
    );
  }

  if (mounted && isNathaliaRiveEnabled()) {
    return (
      <NathaliaAvatarRiveLazy
        state={state}
        speaking={speaking}
        viseme={viseme}
        size={size}
        withRing={withRing}
        className={className}
        fallback={twoD}
      />
    );
  }

  return twoD;
}
