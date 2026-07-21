"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Nathalia2DApp } from "./Nathalia2DApp";
import { NathaliaBubble } from "./NathaliaBubble";
import { NathaliaChatPanel } from "./NathaliaChatPanel";
import { useNathalia } from "./NathaliaProvider";
import { openNathalia } from "./nathaliaStore";
import { canUseNathalia } from "./nathaliaPermissions";
import { nathaliaCopy } from "./nathaliaCopy";

export interface NathaliaWidgetProps {
  /** Hide the hover/idle hint bubble next to the minimized avatar. */
  hideBubble?: boolean;
  className?: string;
}

/**
 * Floating assistant launcher pinned to the bottom-right. In the minimized
 * state Nathal.IA is shown as a free-standing 2D video avatar; clicking her
 * opens the contextual panel directly.
 */
export function NathaliaWidget({ hideBubble, className }: NathaliaWidgetProps) {
  const { open, state, message, hasNotification, user, activeTour } =
    useNathalia();
  const [hovered, setHovered] = useState(false);
  const reduce = useReducedMotion();

  if (!canUseNathalia(user)) return null;

  const showBubble = !hideBubble && !open && !activeTour && (hovered || hasNotification);

  return (
    <div
      className={[
        "pointer-events-auto fixed z-[9999] flex flex-col items-end gap-3",
        className ?? "",
      ].join(" ")}
      style={
        open
          ? { bottom: "1rem", right: "1rem" }
          : // Minimized: the full-body avatar (430px) has transparent padding on
            // its sides, so a stronger negative right offset slides her toward the
            // edge — reducing overlap with page content — without cropping her body.
            { bottom: "0.5rem", right: "-7rem" }
      }
    >
      <AnimatePresence>
        {open ? <NathaliaChatPanel key="panel" /> : null}
      </AnimatePresence>

      {!open && !activeTour ? (
        <div className="flex items-end gap-2">
          <NathaliaBubble message={showBubble ? message : undefined} side="left" />
          <button
            type="button"
            onClick={() => openNathalia()}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocus={() => setHovered(true)}
            onBlur={() => setHovered(false)}
            aria-label={nathaliaCopy.openLabel}
            aria-haspopup="dialog"
            className="relative grid place-items-center bg-transparent outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            data-nathalia-launcher=""
          >
            {hasNotification && !reduce ? (
              <motion.span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-6 bottom-3 h-16 rounded-full bg-brand/25 blur-md"
                animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              />
            ) : null}
            <Nathalia2DApp
              state={state}
              context="general"
              size={430}
              viewMode="lab"
              className="drop-shadow-[0_18px_24px_rgba(0,0,0,0.18)]"
            />
            {hasNotification ? (
              <span
                aria-label={nathaliaCopy.notificationDot}
                className="absolute right-8 top-5 size-3.5 rounded-full border-2 border-ink bg-marker"
              />
            ) : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}
