"use client";

/**
 * NathaliaConfetti — the Nível 4 ("celebração") presence layer.
 *
 * A lightweight, dependency-free confetti/✨ burst rendered over the floating
 * widget while `celebrating === true`. Pure CSS/`motion` particles (no external
 * lib, keeps the bundle lean), short-lived (~the store's celebrate window) and
 * never interactive (`pointer-events: none`, `aria-hidden`).
 *
 * Reduced motion: instead of flying particles we show a single static 🎉 that
 * quietly fades in and out — a discreet acknowledgement, no intense animation.
 */
import { useMemo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useNathaliaSnapshot } from "./NathaliaProvider";

export interface NathaliaConfettiProps {
  /** Number of particles in the burst. */
  count?: number;
  className?: string;
}

const GLYPHS = ["✨", "🎉", "⭐", "💫", "🎊"];
const COLORS = [
  "var(--color-brand)",
  "var(--color-marker, #ffb800)",
  "var(--color-ink)",
];

interface Particle {
  id: number;
  glyph: string;
  color: string;
  /** Horizontal spread (px), centered over the widget. */
  dx: number;
  /** Rise distance (px), upward. */
  dy: number;
  rotate: number;
  duration: number;
  delay: number;
  size: number;
}

function buildParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * (0.15 + Math.random() * 0.7)); // mostly upward fan
    const radius = 60 + Math.random() * 80;
    return {
      id: i,
      glyph: GLYPHS[i % GLYPHS.length],
      color: COLORS[i % COLORS.length],
      dx: Math.cos(angle) * radius * (Math.random() < 0.5 ? -1 : 1),
      dy: -(40 + Math.sin(angle) * radius),
      rotate: (Math.random() - 0.5) * 220,
      duration: 1.4 + Math.random() * 1.2,
      delay: Math.random() * 0.25,
      size: 12 + Math.random() * 10,
    };
  });
}

export function NathaliaConfetti({ count = 16, className }: NathaliaConfettiProps) {
  const reduce = useReducedMotion();
  const { celebrating } = useNathaliaSnapshot();
  // Stable particle set per mount; cheap enough to keep memoized.
  const particles = useMemo(() => buildParticles(count), [count]);

  return (
    <div
      aria-hidden="true"
      // Anchored over the widget (bottom-right). Never blocks clicks.
      className={[
        "pointer-events-none absolute bottom-10 right-10 z-[1]",
        className ?? "",
      ].join(" ")}
    >
      <AnimatePresence>
        {celebrating ? (
          reduce ? (
            // Reduced motion: a single, calm 🎉 that fades in and out.
            <motion.span
              key="celebrate-static"
              className="absolute -translate-x-1/2 select-none text-2xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              🎉
            </motion.span>
          ) : (
            <div key="celebrate-burst" className="absolute">
              {particles.map((p) => (
                <motion.span
                  key={p.id}
                  className="absolute select-none"
                  style={{ color: p.color, fontSize: p.size }}
                  initial={{ opacity: 0, x: 0, y: 0, scale: 0.4, rotate: 0 }}
                  animate={{
                    opacity: [0, 1, 1, 0],
                    x: p.dx,
                    y: p.dy,
                    scale: [0.4, 1, 1, 0.9],
                    rotate: p.rotate,
                  }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: p.duration,
                    delay: p.delay,
                    ease: "easeOut",
                    times: [0, 0.2, 0.7, 1],
                  }}
                >
                  {p.glyph}
                </motion.span>
              ))}
            </div>
          )
        ) : null}
      </AnimatePresence>
    </div>
  );
}
