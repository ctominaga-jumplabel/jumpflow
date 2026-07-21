"use client";

/**
 * NathaliaExpression — renders a single illustrated expression bust by key.
 *
 * A thin, presentational building block over the expression library
 * (`nathaliaExpressions.ts`). Unlike `NathaliaAvatar`, it does not react to the
 * store: you tell it exactly which expression to show. Handy for the Debug Lab
 * (expression grid) and anywhere a static face is needed (docs, onboarding).
 */
import { intentAccent } from "./nathaliaStates";
import {
  expressionImageUrl,
  type NathaliaExpressionKey,
} from "./nathaliaExpressions";

export interface NathaliaExpressionProps {
  /** Which illustrated expression to show. */
  expression: NathaliaExpressionKey;
  /** Pixel size of the square avatar. */
  size?: number;
  /** Draw the neutral ring around the bust. */
  withRing?: boolean;
  /** Override the base URL where expression images are served. */
  baseUrl?: string;
  /** Accessible label; defaults to the expression key. */
  label?: string;
  className?: string;
}

export function NathaliaExpression({
  expression,
  size = 72,
  withRing = true,
  baseUrl,
  label,
  className,
}: NathaliaExpressionProps) {
  const accent = intentAccent.neutral;
  return (
    <div
      data-nathalia-expression={expression}
      className={[
        "relative grid place-items-center overflow-hidden rounded-full",
        accent.chip,
        withRing ? `ring-2 ring-offset-1 ${accent.ring}` : "",
        className ?? "",
      ].join(" ")}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `Nathal.IA — ${expression}`}
    >
      <img
        src={expressionImageUrl(expression, baseUrl)}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="absolute inset-0 h-full w-full select-none object-cover"
        style={{ objectPosition: "50% 46%" }}
      />
    </div>
  );
}
