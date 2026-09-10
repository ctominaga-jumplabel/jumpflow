"use client";

import { cn } from "@/lib/utils";
import { focusRing, opsNum } from "@/lib/styles";
import type { StatusTone } from "./StatusBadge";

const toneStyles: Record<StatusTone, string> = {
  neutral: "text-strong",
  info: "text-brand-dark",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export interface CounterPillProps {
  count: number;
  label: string;
  tone?: StatusTone;
  /** Quando presente, a pílula vira um filtro clicável. */
  onClick?: () => void;
  /** Estado de filtro ativo (só faz sentido junto com `onClick`). */
  active?: boolean;
  className?: string;
}

/**
 * Contador de fila da direção Operational Minimal.
 *
 * O `StatusBadge` dá ao número o mesmo peso tipográfico de uma etiqueta de
 * linha de tabela — mas na Aprovações essa contagem é a primeira coisa que o
 * gestor lê. Aqui o número ganha escala e a cor semântica, e o rótulo recua
 * para texto neutro: a cor marca a severidade, o tamanho marca a importância.
 *
 * Com `onClick` vira filtro; sem ele, renderiza como texto estático (nunca um
 * botão inerte, que anunciaria interatividade inexistente ao leitor de tela).
 */
export function CounterPill({
  count,
  label,
  tone = "neutral",
  onClick,
  active = false,
  className,
}: CounterPillProps) {
  const content = (
    <>
      <span className={cn("text-lg font-semibold", opsNum, toneStyles[tone])}>
        {count}
      </span>
      <span className="text-xs text-medium">{label}</span>
    </>
  );

  const shared = cn(
    "inline-flex items-baseline gap-2 rounded-full border bg-surface px-4 py-2",
    active ? "border-brand ring-1 ring-brand/30" : "border-border",
    className,
  );

  if (!onClick) {
    return <span className={shared}>{content}</span>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        shared,
        focusRing,
        "transition-colors hover:border-brand/60 hover:bg-surface-muted",
      )}
    >
      {content}
    </button>
  );
}
