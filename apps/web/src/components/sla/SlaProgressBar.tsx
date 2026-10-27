"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Barra de % concluido de uma etapa. Animacao funcional e contida (preenche
 * uma vez ao montar; respeita prefers-reduced-motion). O numero acompanha a
 * barra em texto, entao a informacao nao depende da cor.
 */
export function SlaProgressBar({
  value,
  tone,
  label,
}: {
  /** 0..100 ou null (sem itens). */
  value: number | null;
  tone: "success" | "warning" | "danger" | "info" | "neutral";
  label: string;
}) {
  const reduce = useReducedMotion();
  const pct = value ?? 0;
  const fill = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-brand",
    neutral: "bg-ink/30",
  }[tone];
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? undefined}
      aria-valuetext={value === null ? "sem itens" : `${pct}% concluído`}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
    >
      <motion.div
        className={cn("h-full rounded-full", fill)}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        style={reduce ? { width: `${pct}%` } : undefined}
      />
    </div>
  );
}
