import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SectionLabelProps {
  children: ReactNode;
  /** Conteúdo alinhado à direita (período, contagem, navegação). */
  aside?: ReactNode;
  className?: string;
}

/**
 * Rótulo de seção da direção Operational Minimal.
 *
 * Fica FORA do painel, não dentro dele: sem a barra de cabeçalho com divisória,
 * o título vira texto na página e o painel abaixo carrega só o dado. O marcador
 * `>>>` não é ornamento — ele substitui o peso visual que a borda ink dava ao
 * cabeçalho, marcando início de seção sem desenhar uma caixa. É decorativo para
 * leitores de tela (`aria-hidden`); a hierarquia real vem do `<h2>`.
 */
export function SectionLabel({ children, aside, className }: SectionLabelProps) {
  return (
    <div className={cn("flex items-baseline gap-2.5", className)}>
      <span
        aria-hidden="true"
        className="font-mono text-sm font-semibold tracking-tight text-brand"
      >
        &gt;&gt;&gt;
      </span>
      <h2 className="text-base font-semibold tracking-tight text-strong">
        {children}
      </h2>
      {aside ? (
        <div className="ml-auto shrink-0 text-xs text-soft">{aside}</div>
      ) : null}
    </div>
  );
}
