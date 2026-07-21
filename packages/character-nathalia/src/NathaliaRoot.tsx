"use client";

/**
 * NathaliaRoot — the dedicated top layer for Nathal.IA (Fase 8.2).
 *
 * Renders its children through a React portal into a `<div data-nathalia-root>`
 * appended to `document.body`. This is the #1 placement fix of this phase: a
 * `position: fixed` launcher/panel is *not* always anchored to the viewport —
 * any ancestor with a `transform`, `filter`, `perspective`, `will-change` or
 * `contain` (very common with `motion.div` page wrappers) becomes its containing
 * block, so the widget would be clipped by that ancestor's `overflow`, pushed
 * off-screen or hidden entirely. Portaling to `document.body` escapes every such
 * stacking/overflow/transform context the app may introduce per screen.
 *
 * The host is a zero-size, `position: relative` element with a dedicated high
 * `z-index` (9999): that establishes a single stacking context for the whole
 * assistant so it always paints above app chrome (sidebar z-40, topbar z-30,
 * modals z-50) — while its `fixed` children still anchor to the viewport (only
 * transforms capture `fixed`, `relative` does not). The host has no width/height
 * and `pointer-events: none`, so it never blocks clicks; the launcher/panel
 * re-enable pointer events on themselves.
 *
 * React context still flows into the portal (the children keep their position in
 * the React tree), so `NathaliaProvider` wrapping `NathaliaRoot` works as usual.
 */
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NathaliaContextCard } from "./NathaliaContextCard";
import { NathaliaConfetti } from "./NathaliaConfetti";

/** Dedicated z-index for the whole Nathal.IA layer (above app chrome). */
export const NATHALIA_ROOT_Z_INDEX = 9999;

export interface NathaliaRootProps {
  children: ReactNode;
}

export function NathaliaRoot({ children }: NathaliaRootProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const el = document.createElement("div");
    el.setAttribute("data-nathalia-root", "");
    // A zero-size, positioned host: establishes a top stacking context without
    // becoming a containing block for `fixed` descendants and without blocking
    // pointer events anywhere on the page.
    el.style.position = "relative";
    el.style.zIndex = String(NATHALIA_ROOT_Z_INDEX);
    el.style.pointerEvents = "none";

    document.body.appendChild(el);
    setHost(el);

    return () => {
      el.remove();
      setHost(null);
    };
  }, []);

  if (!host) return null;
  return createPortal(
    <>
      {children}
      {/* Presence layers (Wave 2b): the contextual nudge card (Nível 2) and the
          celebration confetti (Nível 4). Both are anchored to the bottom-right,
          just above the floating widget, sharing the same viewport safe-area
          inset. The container itself is click-through; the card re-enables
          pointer events on itself, the confetti stays inert. Inline insets
          (not Tailwind arbitrary utilities) for the same reason as the widget. */}
      <div
        // `fixed` anchors to the viewport; `flex-col items-end justify-end` keeps
        // the card stacked above the widget. `pointer-events-none` so it never
        // blocks the page — interactive children opt back in.
        className="pointer-events-none fixed z-[9999] flex flex-col items-end justify-end gap-3"
        style={{ bottom: "1rem", right: "1rem" }}
        data-nathalia-presence=""
      >
        <NathaliaConfetti />
        <NathaliaContextCard />
        {/* Spacer reserving the widget's footprint so the card sits above it
            rather than overlapping the launcher. ~88px launcher + ring. */}
        <div aria-hidden="true" style={{ width: 1, height: 92 }} />
      </div>
    </>,
    host,
  );
}
