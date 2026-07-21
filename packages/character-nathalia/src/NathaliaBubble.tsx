"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

export interface NathaliaBubbleProps {
  /** Message text. When empty/undefined the bubble is hidden. */
  message?: string;
  /** Side the bubble points to (relative to the avatar). */
  side?: "left" | "right";
  className?: string;
}

/**
 * A small speech bubble shown next to the minimized widget to surface a short
 * contextual line. Uses the Playful Ops strong border + hard shadow.
 */
export function NathaliaBubble({
  message,
  side = "left",
  className,
}: NathaliaBubbleProps) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {message ? (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.96 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={[
            "relative max-w-[15rem] rounded-card border-2 border-ink bg-surface px-3 py-2 text-sm leading-snug text-strong shadow-[3px_3px_0_0_var(--color-ink)]",
            className ?? "",
          ].join(" ")}
          role="status"
        >
          {message}
          <span
            aria-hidden="true"
            className={[
              "absolute top-1/2 -mt-2 size-3 rotate-45 border-ink bg-surface",
              side === "left"
                ? "-right-[7px] border-r-2 border-t-2"
                : "-left-[7px] border-b-2 border-l-2",
            ].join(" ")}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
