/**
 * Shared style fragments to keep the design system consistent.
 * Source of truth: docs/identidade-visual-playful-ops.md and docs/design-system.md.
 *
 * The Playful Ops direction reserves strong borders + hard ("brutalist") shadows
 * for high-value elements — CTAs, KPIs, key cards and empty states. Lists,
 * tables and forms stay on the soft 1px border to remain scannable.
 */

/**
 * Standard keyboard focus ring for interactive elements (buttons, links).
 * Uses the brand (action) color with a 2px ring and offset against the
 * surrounding surface, matching the design system's focus treatment.
 *
 * Compose with `cn(focusRing, ...)`.
 */
export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

/**
 * Focus treatment for text inputs. Inputs read better with a colored border +
 * soft ring than with an offset ring, so they use a dedicated fragment instead
 * of `focusRing`. Keeps input focus consistent as more fields are added.
 */
export const focusRingInput =
  "outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40";

/** Playful Ops strong border (ink, 2px). Use on high-value framed elements. */
export const brutalBorder = "border-2 border-ink";

/** Hard offset shadow for high-value elements (KPIs, key cards, CTAs). */
export const brutalShadow = "shadow-[4px_4px_0_0_var(--color-ink)]";

/** Smaller hard shadow for compact elements (nav items, chips, icon blocks). */
export const brutalShadowSm = "shadow-[2px_2px_0_0_var(--color-ink)]";

/** Pressed-state hard shadow (depth collapses toward the surface). */
export const brutalShadowPressed = "shadow-[1px_1px_0_0_var(--color-ink)]";

/**
 * Tactile button: strong ink border + hard shadow that lifts on hover and
 * "presses" into the surface on click. Pair with a background + text color.
 * Motion is transform/shadow only, so `prefers-reduced-motion` (handled
 * globally in globals.css) neutralizes it gracefully.
 *
 * Compose with `cn(tactileButton, focusRing, "bg-brand text-white")`.
 */
export const tactileButton =
  "border-2 border-ink shadow-[3px_3px_0_0_var(--color-ink)] transition-[transform,box-shadow] duration-150 hover:-translate-x-px hover:-translate-y-px hover:shadow-[4px_4px_0_0_var(--color-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_var(--color-ink)]";
