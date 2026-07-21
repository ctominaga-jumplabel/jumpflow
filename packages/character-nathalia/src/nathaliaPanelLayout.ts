/**
 * Panel layout for Nathal.IA (Fase 8.1, Etapas 1–2).
 *
 * Pure, framework-free math that decides how big the expanded panel may be and
 * how it docks, so it can **never** open partially outside the viewport (the #1
 * UX problem this phase fixes). Safe to import on the server and in tests; the
 * client hook (`useNathaliaPanelLayout`) lives in `useNathaliaPanelLayout.ts`.
 *
 * The widget is pinned to the bottom-right corner and the panel grows up and to
 * the left from there. The algorithm:
 *
 *  1. Reserve a safe `edgeMargin` from every viewport edge.
 *  2. On roomy viewports → "corner": a fixed-ish premium panel
 *     (`preferredWidth` × `preferredHeight`) shrunk only as far as the available
 *     space allows, never below the usable minimums.
 *  3. On cramped viewports (narrow OR too short to host the minimum height) →
 *     "sheet": an almost full-screen card with a slim margin, so small phones
 *     and short landscape windows still get a complete, scrollable panel.
 *
 * Because both branches size the panel to fit *inside* the available box and it
 * is anchored to the corner, no edge (top, bottom, left, right) can ever spill.
 */

/** How the panel docks given the available space. */
export type NathaliaPanelPlacement = "corner" | "sheet";

export interface PanelLayoutInput {
  /** Viewport width in CSS px. */
  viewportWidth: number;
  /** Viewport height in CSS px. */
  viewportHeight: number;
  /** Safe gap kept from each viewport edge on roomy screens (px). */
  edgeMargin?: number;
  /** Desired panel width before fitting (px). */
  preferredWidth?: number;
  /** Desired panel height before fitting (px). */
  preferredHeight?: number;
  /** Smallest width we will shrink to before switching to a sheet (px). */
  minWidth?: number;
  /** Smallest height we will shrink to before switching to a sheet (px). */
  minHeight?: number;
}

export interface PanelLayout {
  /** Resolved panel width (px). */
  width: number;
  /** Resolved panel height (px). */
  height: number;
  /** Distance kept from the docked edges (px). */
  offset: number;
  /** How the panel docks. */
  placement: NathaliaPanelPlacement;
  /** True when width had to drop below the preferred width to fit. */
  constrainedWidth: boolean;
  /** True when height had to drop below the preferred height to fit. */
  constrainedHeight: boolean;
}

/**
 * Default panel dimensions for Fase 8.1. Width sits in the requested
 * 520–600 band; height in the 420–520 band — comfortable for the contextual
 * headline, suggestions and a few conversation turns without inner scroll.
 */
export const NATHALIA_PANEL_DEFAULTS = {
  edgeMargin: 24,
  preferredWidth: 560,
  preferredHeight: 480,
  minWidth: 300,
  minHeight: 380,
  /** Slimmer margin used by the mobile/short "sheet" placement. */
  sheetMargin: 12,
  /** Below this viewport width we always use the full-width sheet. */
  narrowBreakpoint: 480,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Resolve a concrete, viewport-safe panel layout. Deterministic and pure: given
 * the same viewport it always returns the same layout.
 */
export function resolveNathaliaPanelLayout(input: PanelLayoutInput): PanelLayout {
  const {
    viewportWidth,
    viewportHeight,
    edgeMargin = NATHALIA_PANEL_DEFAULTS.edgeMargin,
    preferredWidth = NATHALIA_PANEL_DEFAULTS.preferredWidth,
    preferredHeight = NATHALIA_PANEL_DEFAULTS.preferredHeight,
    minWidth = NATHALIA_PANEL_DEFAULTS.minWidth,
    minHeight = NATHALIA_PANEL_DEFAULTS.minHeight,
  } = input;

  const availableWidth = viewportWidth - edgeMargin * 2;
  const availableHeight = viewportHeight - edgeMargin * 2;

  // Cramped viewport → full-screen-ish sheet with a slim, safe margin.
  const tooNarrow = viewportWidth < NATHALIA_PANEL_DEFAULTS.narrowBreakpoint;
  const tooShort = availableHeight < minHeight;
  if (tooNarrow || tooShort) {
    const margin = Math.min(edgeMargin, NATHALIA_PANEL_DEFAULTS.sheetMargin);
    const width = Math.max(0, viewportWidth - margin * 2);
    const height = Math.max(0, viewportHeight - margin * 2);
    return {
      width,
      height,
      offset: margin,
      placement: "sheet",
      constrainedWidth: width < preferredWidth,
      constrainedHeight: height < preferredHeight,
    };
  }

  // Roomy viewport → premium corner panel, shrunk only as needed to fit.
  const width = clamp(preferredWidth, minWidth, availableWidth);
  const height = clamp(preferredHeight, minHeight, availableHeight);
  return {
    width,
    height,
    offset: edgeMargin,
    placement: "corner",
    constrainedWidth: width < preferredWidth,
    constrainedHeight: height < preferredHeight,
  };
}
