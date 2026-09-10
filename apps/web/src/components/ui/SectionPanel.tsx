import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { quietPanel } from "@/lib/styles";

/**
 * Tratamento visual do painel.
 *
 * - `brutal` (padrão): Playful Ops — borda ink de 2px + sombra dura. É o
 *   default de propósito: os ~330 usos existentes não mudam de aparência.
 * - `quiet`: Operational Minimal — hairline de 1px, sem sombra, raio maior.
 *   Usado pelas telas `/nova` de Horas e Aprovações, em validação lado a lado.
 */
export type SectionPanelVariant = "brutal" | "quiet";

export interface SectionPanelProps {
  /**
   * Título da barra de cabeçalho. OPCIONAL na variante `quiet`: a direção em
   * validação tira o título de dentro do painel e o coloca acima dele, como
   * `SectionLabel` — sem título, o painel não renderiza a barra e o conteúdo
   * lidera. Na variante `brutal` o cabeçalho continua sendo a norma.
   */
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Optional DOM id (e.g. so a guided tour can anchor/highlight this panel). */
  id?: string;
  variant?: SectionPanelVariant;
}

/**
 * Shared panel ("band"). Strong ink border + hard shadow mark it as a key
 * container. Holds lists/tables — not nested cards — to keep screens scannable
 * per the design system.
 */
export function SectionPanel({
  title,
  description,
  action,
  children,
  className,
  id,
  variant = "brutal",
}: SectionPanelProps) {
  const quiet = variant === "quiet";
  const hasHeader = Boolean(title || description || action);
  return (
    <section
      id={id}
      className={cn(
        quiet
          ? quietPanel
          : "rounded-[var(--radius-card)] border-2 border-ink bg-surface shadow-[4px_4px_0_0_var(--color-ink)]",
        className,
      )}
    >
      {hasHeader ? (
        <div
          className={cn(
            "flex items-start justify-between gap-4 px-5 py-4",
            quiet ? "border-b border-border" : "border-b-2 border-ink",
          )}
        >
          <div className="min-w-0">
            {title ? (
              <h2 className="text-sm font-semibold text-strong">{title}</h2>
            ) : null}
            {description ? (
              <p className={cn("text-xs text-soft", title && "mt-0.5")}>
                {description}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
