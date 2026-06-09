/**
 * Shared style fragments to keep the design system consistent.
 * Source of truth: docs/design-system.md.
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
