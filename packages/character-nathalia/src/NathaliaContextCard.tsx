"use client";

/**
 * NathaliaContextCard — the Nível 2 ("card contextual") presence layer.
 *
 * A small, non-modal card anchored just above the minimized floating widget. It
 * surfaces the current proactive nudge (`activeNudge`) with the assistant's face,
 * the message and the nudge's CTAs — so Nathal.IA can offer a gentle, actionable
 * hint without forcing the panel open. It is shown ONLY while there is an active
 * nudge AND the panel is closed; opening the panel (or dismissing) removes it.
 *
 * Styling mirrors `NathaliaBubble` / `NathaliaChatPanel`: Playful Ops strong ink
 * border, hard shadow and card radius. Motion is a soft slide/fade that degrades
 * to a plain fade under `prefers-reduced-motion`. It never blocks the page (no
 * backdrop, scoped pointer events), and is keyboard-accessible.
 */
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { NathaliaAvatar } from "./NathaliaAvatar";
import { useNathaliaActionsOptional, useNathaliaSnapshot } from "./NathaliaProvider";
import { getNathaliaContext } from "./nathaliaContext";
import { dismissNudge, openNathalia } from "./nathaliaStore";
import { nathaliaCopy } from "./nathaliaCopy";
import type { ProactiveCta } from "./intelligence/proactive/ProactiveEngine";

export interface NathaliaContextCardProps {
  className?: string;
}

export function NathaliaContextCard({ className }: NathaliaContextCardProps) {
  const reduce = useReducedMotion();
  // Read state from the framework-agnostic store and treat the host-bound action
  // API as optional: `NathaliaRoot` (which renders this card) is decoupled from
  // `NathaliaProvider`, so we must not throw when no provider is present.
  const { open, activeNudge, context } = useNathaliaSnapshot();
  const actions = useNathaliaActionsOptional();
  const contextDef = getNathaliaContext(context);

  // Only when there is a pending nudge and the panel is closed.
  const visible = !open && activeNudge != null;

  function handleCta(cta: ProactiveCta) {
    if (cta.kind === "dismiss") {
      dismissNudge();
      return;
    }
    // primary: run the offered safe action (if any and the host wired actions),
    // otherwise just open the panel — both are safe without a provider.
    if (cta.action && actions) {
      actions.runAction(cta.action);
      dismissNudge();
    } else {
      openNathalia();
    }
  }

  const ctas = activeNudge?.ctas ?? [];

  return (
    <AnimatePresence>
      {visible && activeNudge ? (
        <motion.aside
          key={activeNudge.id}
          // role=status keeps it as a polite live region (announced, not focus-
          // grabbing). It is informational + actionable, not a modal dialog.
          role="status"
          aria-live="polite"
          aria-label={`${nathaliaCopy.name}: ${activeNudge.message}`}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.96 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className={[
            "pointer-events-auto w-[18rem] max-w-[calc(100vw-2rem)] rounded-card border-2 border-ink bg-surface text-strong shadow-[5px_5px_0_0_var(--color-ink)]",
            className ?? "",
          ].join(" ")}
        >
          <div className="flex items-start gap-3 px-3 pb-2 pt-3">
            <NathaliaAvatar
              state={activeNudge.state}
              context={contextDef.key}
              size={44}
              viewMode="bubble"
              withRing
              className="shrink-0"
            />
            <p className="min-w-0 flex-1 whitespace-pre-line pt-0.5 text-sm leading-snug">
              {activeNudge.message}
            </p>
            <button
              type="button"
              onClick={() => dismissNudge()}
              aria-label={nathaliaCopy.dismissCardLabel}
              className="-mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-md text-medium outline-none transition-colors hover:bg-canvas hover:text-strong focus-visible:ring-2 focus-visible:ring-brand"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>

          {ctas.length > 0 ? (
            <div className="flex flex-wrap justify-end gap-2 border-t-2 border-ink bg-canvas px-3 py-2">
              {ctas.map((cta, i) => (
                <button
                  key={`${cta.kind}-${cta.label}-${i}`}
                  type="button"
                  onClick={() => handleCta(cta)}
                  className={
                    cta.kind === "primary"
                      ? "rounded-md border-2 border-ink bg-brand px-3 py-1 text-xs font-bold text-white shadow-[2px_2px_0_0_var(--color-ink)] outline-none transition-transform hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
                      : "rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-medium outline-none transition-colors hover:border-ink hover:text-strong focus-visible:ring-2 focus-visible:ring-brand"
                  }
                >
                  {cta.label}
                </button>
              ))}
            </div>
          ) : null}
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
