"use client";

/**
 * Nathalia2DAvatar — the layered, catalog-driven 2D avatar.
 *
 * A modular alternative to `NathaliaAvatar2DExpr`: instead of a single
 * crossfading bust, it composes the character from catalog layers (body → face →
 * mouth → object) and plays a named **animation state** from
 * `nathaliaAnimationRegistry` (idle, idle_blink, listening, talking, thinking,
 * success, error, alert, celebrate, wave), each with its own motion profile.
 *
 * It keeps the exact public prop shape of the other avatars, so it can be
 * swapped in behind `NEXT_PUBLIC_NATHALIA_2D_LAYERED` without touching callers.
 * Today only face/viseme/object layers have art, so it renders the expressive
 * bust with richer, declarative motion; when body/pose art is generated it
 * composes automatically (see `docs/nathalia/2D_ANIMATION_ARCHITECTURE.md`).
 *
 * Graceful fallback: if the face layer is somehow absent from the catalog it
 * defers to `NathaliaAvatar2DExpr` so the assistant always has a face.
 */
import { NathaliaAnimationController } from "./NathaliaAnimationController";
import { NathaliaAvatar2DExpr } from "./NathaliaAvatar2DExpr";
import {
  layeredAnimationFor,
  type NathaliaAnimationState,
} from "./nathaliaAnimationRegistry";
import { hasLayer } from "./nathaliaSpriteCatalog";
import type { NathaliaExpressionKey } from "./nathaliaExpressions";
import type { NathaliaViewMode } from "./nathaliaFraming";
import type { NathaliaContextKey, NathaliaStateKey } from "./nathaliaTypes";

export interface Nathalia2DAvatarProps {
  /** Emotional state (mapped to an animation state). */
  state?: NathaliaStateKey;
  /** Direct animation-state override (wins over `state`); for the Lab. */
  animation?: NathaliaAnimationState;
  /** Current screen — drives the resting expression and the object badge. */
  context?: NathaliaContextKey;
  /** Hard expression override. */
  expression?: NathaliaExpressionKey;
  /** Force lip-sync (talking) regardless of state. */
  speaking?: boolean;
  /** Audio-driven mouth shape for precise lip-sync. */
  viseme?: string | null;
  size?: number;
  withRing?: boolean;
  viewMode?: NathaliaViewMode;
  baseUrl?: string;
  className?: string;
}

export function Nathalia2DAvatar({
  state = "idle",
  animation,
  context = "general",
  expression,
  speaking,
  viseme = null,
  size = 56,
  withRing = true,
  viewMode = "bubble",
  baseUrl,
  className,
}: Nathalia2DAvatarProps) {
  // Defensive fallback — the assistant must always have a face.
  if (!hasLayer("face")) {
    return (
      <NathaliaAvatar2DExpr
        state={state}
        context={context}
        expression={expression}
        speaking={Boolean(speaking)}
        viseme={viseme}
        size={size}
        withRing={withRing}
        viewMode={viewMode}
        baseUrl={baseUrl}
        className={className}
      />
    );
  }

  const resolved = animation ?? layeredAnimationFor(state);
  return (
    <NathaliaAnimationController
      animation={resolved}
      context={context}
      expression={expression}
      speaking={speaking}
      viseme={viseme}
      size={size}
      withRing={withRing}
      viewMode={viewMode}
      baseUrl={baseUrl}
      className={className}
    />
  );
}
