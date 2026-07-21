"use client";

/**
 * Client hook that tracks the viewport and resolves a safe panel layout
 * (Fase 8.1, Etapas 1–2). Wraps the pure `resolveNathaliaPanelLayout` and
 * re-measures on resize / orientation change so the panel always fits.
 *
 * SSR-safe: before mount it returns a sensible desktop default (the panel only
 * renders client-side, inside the lazily-loaded widget), then snaps to the real
 * viewport on the first effect.
 */
import { useEffect, useState } from "react";
import {
  NATHALIA_PANEL_DEFAULTS,
  resolveNathaliaPanelLayout,
  type PanelLayout,
  type PanelLayoutInput,
} from "./nathaliaPanelLayout";

/** Reasonable pre-mount default (roomy desktop) so the first paint is stable. */
const SSR_DEFAULT: PanelLayout = resolveNathaliaPanelLayout({
  viewportWidth: 1280,
  viewportHeight: 800,
});

export type UseNathaliaPanelLayoutOptions = Omit<
  PanelLayoutInput,
  "viewportWidth" | "viewportHeight"
>;

export function useNathaliaPanelLayout(
  options: UseNathaliaPanelLayoutOptions = {},
): PanelLayout {
  const [layout, setLayout] = useState<PanelLayout>(SSR_DEFAULT);

  // Re-resolve whenever the viewport changes. We intentionally read the option
  // primitives (not the object) so a fresh inline `{}` does not re-subscribe.
  const {
    edgeMargin = NATHALIA_PANEL_DEFAULTS.edgeMargin,
    preferredWidth = NATHALIA_PANEL_DEFAULTS.preferredWidth,
    preferredHeight = NATHALIA_PANEL_DEFAULTS.preferredHeight,
    minWidth = NATHALIA_PANEL_DEFAULTS.minWidth,
    minHeight = NATHALIA_PANEL_DEFAULTS.minHeight,
  } = options;

  useEffect(() => {
    if (typeof window === "undefined") return;

    function measure() {
      setLayout(
        resolveNathaliaPanelLayout({
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          edgeMargin,
          preferredWidth,
          preferredHeight,
          minWidth,
          minHeight,
        }),
      );
    }

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [edgeMargin, preferredWidth, preferredHeight, minWidth, minHeight]);

  return layout;
}
