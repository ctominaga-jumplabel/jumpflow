"use client";

import { motion, useReducedMotion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export type MetricTrend = "up" | "down" | "flat";

export interface MetricCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  trend?: MetricTrend;
  trendLabel?: string;
  /** Stagger index for entrance animation. */
  index?: number;
  className?: string;
}

const trendIcon: Record<MetricTrend, LucideIcon> = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: Minus,
};

const trendColor: Record<MetricTrend, string> = {
  up: "text-success",
  down: "text-danger",
  flat: "text-soft",
};

/** KPI tile for dashboards. Restrained entrance + hover microinteraction. */
export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  trendLabel,
  index = 0,
  className,
}: MetricCardProps) {
  const TrendIcon = trend ? trendIcon[trend] : null;
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut", delay: index * 0.05 }}
      whileHover={reduce ? undefined : { y: -2 }}
      className={cn(
        "rounded-[var(--radius-card)] border border-border bg-surface p-5 transition-shadow hover:shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <span className="grid size-10 place-items-center rounded-md bg-brand-soft text-brand-dark">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        {trend && TrendIcon ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium",
              trendColor[trend],
            )}
          >
            <TrendIcon aria-hidden="true" className="size-3.5" />
            {trendLabel}
          </span>
        ) : null}
      </div>
      <p className="mt-4 text-sm font-medium text-medium">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-strong">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-soft">{hint}</p> : null}
    </motion.div>
  );
}
