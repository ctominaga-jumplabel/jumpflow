"use client";

/**
 * Nathal.IA's 2D/CSS avatar — a lightweight, dependency-free SVG character.
 *
 * This is the **fallback** face: it ships in the initial bundle, renders on any
 * device, needs no WebGL, and respects reduced motion. `NathaliaAvatar` uses the
 * illustrated expression avatar (`NathaliaAvatar2DExpr`) by default and falls
 * back to this SVG when `NEXT_PUBLIC_NATHALIA_2D_EXPR=false`.
 */
import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { animationForState } from "./nathaliaAnimations";
import { getNathaliaState, intentAccent } from "./nathaliaStates";
import { nathalia2DTransform, type NathaliaViewMode } from "./nathaliaFraming";
import { nathaliaCopy } from "./nathaliaCopy";
import type { NathaliaStateKey } from "./nathaliaTypes";

export interface NathaliaAvatar2DProps {
  /** Current emotional state (drives expression + idle motion). */
  state?: NathaliaStateKey;
  /** Pixel size of the square avatar. */
  size?: number;
  /** Add the intent-colored ring around the avatar. */
  withRing?: boolean;
  /** Framing preset; zooms the character to stay in sync with the 3D crop. */
  viewMode?: NathaliaViewMode;
  className?: string;
}

export function NathaliaAvatar2D({
  state = "idle",
  size = 56,
  withRing = true,
  viewMode = "bubble",
  className,
}: NathaliaAvatar2DProps) {
  const reduce = useReducedMotion();
  const def = getNathaliaState(state);
  const anim = animationForState(state, def.animation);
  const expr = useMemo(() => expressionFor(state), [state]);
  const accent = intentAccent[def.intent];
  const contentTransform = nathalia2DTransform(viewMode);

  const idleMotion = reduce
    ? {}
    : {
        y: anim.fallback.bob ? [0, -anim.fallback.bob, 0] : 0,
        rotate: anim.fallback.tilt
          ? [0, anim.fallback.tilt, -anim.fallback.tilt, 0]
          : 0,
        scale: anim.fallback.pulse ? [1, 1 + anim.fallback.pulse, 1] : 1,
      };

  return (
    <motion.div
      data-nathalia-state={state}
      data-nathalia-variant="2d"
      className={[
        // Soft, per-state colored disc — mirrors the reference "Sempre com você"
        // badges (warm/green/purple) and keeps the 3D bubble crop on a matching
        // backdrop. `overflow-hidden` clips the bust to the circle.
        "relative grid place-items-center overflow-hidden rounded-full",
        accent.chip,
        withRing ? `ring-2 ring-offset-1 ${accent.ring}` : "",
        className ?? "",
      ].join(" ")}
      style={{ width: size, height: size }}
      animate={idleMotion}
      transition={{
        duration: anim.durationSec,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      role="img"
      aria-label={`${nathaliaCopy.name} — ${def.label}`}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        aria-hidden="true"
        className="overflow-visible"
      >
        <defs>
          <clipPath id="nathalia-clip">
            <circle cx="50" cy="50" r="48" />
          </clipPath>
        </defs>
        <g clipPath="url(#nathalia-clip)">
          {/* No solid fill here: the parent disc (accent.chip) shows through, so
              the badge color tracks the emotional state like the reference. */}
          {/* Character content, scaled per view mode so the bubble reads as a
              bust (face + shoulders + upper torso) inside the circular clip. */}
          <g transform={contentTransform || undefined}>
            {/* Hair back — long, wavy, dark espresso framing the face. V3: fuller
                and wider so the silhouette reads at small sizes. */}
            <path
              d="M12 58 Q8 13 50 11 Q92 13 88 58 L86 98 L67 98 Q73 58 64 44 L36 44 Q27 58 33 98 L14 98 Z"
              fill="#2a2320"
            />
            {/* Black t-shirt with the orange jumpflow chevron mark (truer black) */}
            <path d="M27 98 Q29 73 50 71 Q71 73 73 98 Z" fill="#0e0e10" />
            <g fill="#ff7a18">
              <path d="M43 82 L47.5 85 L43 88 L44.7 85 Z" />
              <path d="M48 82 L52.5 85 L48 88 L49.7 85 Z" />
              <path d="M53 82 L57.5 85 L53 88 L54.7 85 Z" />
            </g>
            {/* Neck — warm tan */}
            <rect x="44" y="61" width="12" height="13" rx="4.5" fill="#d99e76" />
            {/* Face — warm tan, rounded & friendly (V3 palette) */}
            <ellipse cx="50" cy="45.5" rx="23" ry="24.5" fill="#ecb893" />
            {/* Hair front — soft side-parted fringe, a touch fuller over the brow */}
            <path
              d="M25 47 Q26 18 50 18 Q74 18 75 47 Q71 32 56 30 Q52 38 49 30 Q35 31 25 47 Z"
              fill="#2a2320"
            />
            {/* Cheeks (blush) on positive states */}
            {expr.blush ? (
              <>
                <circle cx="35" cy="52" r="4.2" fill="#ff8a8a" opacity="0.45" />
                <circle cx="65" cy="52" r="4.2" fill="#ff8a8a" opacity="0.45" />
              </>
            ) : null}
            {/* Eyebrows */}
            <Brow side="left" shape={expr.brow} />
            <Brow side="right" shape={expr.brow} />
            {/* Eyes */}
            <Eye side="left" look={expr.look} closed={expr.eyesClosed} />
            <Eye side="right" look={expr.look} closed={expr.eyesClosed} />
            {/* Nose hint */}
            <path
              d="M49 50 Q48.4 53 50.6 53.6"
              stroke="#d59c74"
              strokeWidth="1.1"
              fill="none"
              strokeLinecap="round"
            />
            {/* Mouth */}
            <Mouth shape={expr.mouth} />
          </g>
        </g>
      </svg>

      {/* Thinking dots */}
      {state === "thinking" || state === "searching" ? (
        <span className="absolute -right-1 -top-1 flex gap-0.5 rounded-full bg-surface px-1.5 py-1 shadow-sm">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="block size-1 rounded-full bg-brand"
              animate={reduce ? {} : { opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </span>
      ) : null}
    </motion.div>
  );
}

type MouthShape = "smile" | "grin" | "open" | "flat" | "concerned";
type BrowShape = "neutral" | "up" | "worried";
type LookDir = "center" | "up" | "side";

interface Expression {
  mouth: MouthShape;
  brow: BrowShape;
  look: LookDir;
  blush: boolean;
  eyesClosed: boolean;
}

function expressionFor(state: NathaliaStateKey): Expression {
  switch (state) {
    case "welcome":
      return { mouth: "grin", brow: "up", look: "center", blush: true, eyesClosed: false };
    case "happy":
    case "success":
      return { mouth: "smile", brow: "up", look: "center", blush: true, eyesClosed: false };
    case "celebrate":
      return { mouth: "open", brow: "up", look: "up", blush: true, eyesClosed: true };
    case "thinking":
    case "searching":
      return { mouth: "flat", brow: "neutral", look: "up", blush: false, eyesClosed: false };
    case "explaining":
    case "pointing":
      return { mouth: "smile", brow: "neutral", look: "side", blush: false, eyesClosed: false };
    case "listening":
      return { mouth: "smile", brow: "up", look: "center", blush: false, eyesClosed: false };
    case "warning":
      return { mouth: "concerned", brow: "worried", look: "center", blush: false, eyesClosed: false };
    case "error":
      return { mouth: "concerned", brow: "worried", look: "side", blush: false, eyesClosed: false };
    case "idle":
    default:
      return { mouth: "smile", brow: "neutral", look: "center", blush: false, eyesClosed: false };
  }
}

function Eye({
  side,
  look,
  closed,
}: {
  side: "left" | "right";
  look: LookDir;
  closed: boolean;
}) {
  const cx = side === "left" ? 40 : 60;
  const cy = 47;
  const dx = look === "side" ? 1.6 : 0;
  const dy = look === "up" ? -1.6 : 0;
  if (closed) {
    // Closed/blinking — a soft lash curve.
    return (
      <path
        d={`M${cx - 5} ${cy - 0.5} Q${cx} ${cy + 3} ${cx + 5} ${cy - 0.5}`}
        stroke="#1c130d"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
    );
  }
  return (
    <>
      {/* Large, expressive eye with warm brown iris + catchlight + upper lash.
          V3: bigger sclera/iris for a friendlier, more expressive read. */}
      <ellipse cx={cx} cy={cy} rx="4.9" ry="5.8" fill="#ffffff" />
      <circle cx={cx + dx} cy={cy + dy} r="3.5" fill="#4a2f22" />
      <circle cx={cx + dx} cy={cy + dy} r="1.75" fill="#1c130d" />
      <circle cx={cx + dx - 1.1} cy={cy + dy - 1.7} r="1.1" fill="#ffffff" />
      <path
        d={`M${cx - 5.3} ${cy - 4.3} Q${cx} ${cy - 6.9} ${cx + 5.3} ${cy - 4.3}`}
        stroke="#1c130d"
        strokeWidth="1.7"
        fill="none"
        strokeLinecap="round"
      />
    </>
  );
}

function Brow({ side, shape }: { side: "left" | "right"; shape: BrowShape }) {
  const cx = side === "left" ? 40 : 60;
  const y = shape === "up" ? 37.5 : 39;
  const tilt = shape === "worried" ? (side === "left" ? 2 : -2) : 0;
  return (
    <path
      d={`M${cx - 5} ${y + tilt} Q${cx} ${y - 2} ${cx + 5} ${y - tilt}`}
      stroke="#2e2320"
      strokeWidth="2.1"
      fill="none"
      strokeLinecap="round"
    />
  );
}

function Mouth({ shape }: { shape: MouthShape }) {
  switch (shape) {
    case "grin":
      return <path d="M42 58 Q50 67 58 58 Q50 62 42 58 Z" fill="#7a2e2e" />;
    case "open":
      return <ellipse cx="50" cy="60" rx="5" ry="6" fill="#7a2e2e" />;
    case "flat":
      return (
        <path d="M44 60 L56 60" stroke="#7a2e2e" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      );
    case "concerned":
      return (
        <path d="M44 62 Q50 57 56 62" stroke="#7a2e2e" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      );
    case "smile":
    default:
      // V3: a warmer, more visible resting smile (fuller upward curve).
      return (
        <path d="M41.5 58.5 Q50 67.5 58.5 58.5" stroke="#7a2e2e" strokeWidth="1.9" strokeLinecap="round" fill="none" />
      );
  }
}
