"use client";

/**
 * NathaliaLayer — a single composable image layer of the 2D avatar.
 *
 * The layered avatar (`Nathalia2DAvatar`) stacks several of these (body → face →
 * mouth → accessory) inside one square frame. Each layer crossfades when its
 * `frameKey` changes (e.g. expression → viseme) so swaps never pop. SSR-safe and
 * reduced-motion aware; the motion of the *whole character* (breathe/sway) lives
 * in `NathaliaAnimationController`, not here.
 */
import type { CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";

export interface NathaliaLayerProps {
  /** Image URL for the current frame. */
  src: string;
  /** Stable identity for crossfade — change it to crossfade to a new frame. */
  frameKey: string;
  /** CSS object-position (the busts are face-centered squares). */
  objectPosition?: string;
  /** `cover` for the face bust, `contain` for badges/objects. */
  fit?: "cover" | "contain";
  /** Crossfade duration (seconds); 0 under reduced motion. */
  crossfadeSec?: number;
  reduce?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function NathaliaLayer({
  src,
  frameKey,
  objectPosition = "50% 46%",
  fit = "cover",
  crossfadeSec = 0.3,
  reduce = false,
  className,
  style,
}: NathaliaLayerProps) {
  return (
    <AnimatePresence initial={false}>
      <motion.img
        key={frameKey}
        src={src}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={[
          "absolute inset-0 h-full w-full select-none",
          fit === "cover" ? "object-cover" : "object-contain",
          className ?? "",
        ].join(" ")}
        style={{ objectPosition, ...style }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduce ? 0 : crossfadeSec, ease: "easeOut" }}
      />
    </AnimatePresence>
  );
}
