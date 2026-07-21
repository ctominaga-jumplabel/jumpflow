"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Nathalia2DApp } from "./Nathalia2DApp";
import type { NathaliaStateKey } from "./nathaliaTypes";

export interface NathaliaTooltipProps {
  /** Whether the tooltip is visible. */
  open: boolean;
  /** Tooltip text. */
  message: string;
  /** Visual state for the small avatar. */
  state?: NathaliaStateKey;
  /** Optional title (e.g. step label in a tour). */
  title?: string;
  /** Primary action (e.g. "Próximo"). */
  primaryAction?: { label: string; onClick: () => void };
  /** Secondary action (e.g. "Pular"). */
  secondaryAction?: { label: string; onClick: () => void };
  /** Which side of the speech bubble the avatar should occupy. */
  avatarSide?: "left" | "right";
  className?: string;
}

/**
 * A compact, anchored callout used by tours and inline hints. Pairs a tiny
 * Nathal.IA avatar with a short message and optional step actions. Positioning
 * is left to the caller (wrap in an absolutely-positioned container).
 */
export function NathaliaTooltip({
  open,
  message,
  state = "explaining",
  title,
  primaryAction,
  secondaryAction,
  avatarSide = "left",
  className,
}: NathaliaTooltipProps) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 4 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-label={title ?? "Dica da Nathal.IA"}
          className={[
            "flex w-[32rem] max-w-[92vw] items-end gap-3",
            className ?? "",
          ].join(" ")}
          style={{ flexDirection: avatarSide === "right" ? "row-reverse" : "row" }}
        >
          <Nathalia2DApp
            state={state}
            size={190}
            viewMode="lab"
            className="shrink-0 self-end"
          />
          <div className="min-w-0 flex-1 rounded-card border-2 border-ink bg-surface p-3 shadow-[4px_4px_0_0_var(--color-ink)]">
            {title ? (
              <p className="text-xs font-semibold uppercase tracking-wide text-soft">
                {title}
              </p>
            ) : null}
            <p className="text-sm leading-snug text-strong">{message}</p>
            {primaryAction || secondaryAction ? (
              <div className="mt-2 flex items-center justify-end gap-2">
                {secondaryAction ? (
                  <button
                    type="button"
                    onClick={secondaryAction.onClick}
                    className="rounded-md px-2 py-1 text-xs font-medium text-medium hover:text-strong"
                  >
                    {secondaryAction.label}
                  </button>
                ) : null}
                {primaryAction ? (
                  <button
                    type="button"
                    onClick={primaryAction.onClick}
                    className="rounded-md border-2 border-ink bg-brand px-2.5 py-1 text-xs font-semibold text-white shadow-[2px_2px_0_0_var(--color-ink)]"
                  >
                    {primaryAction.label}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
