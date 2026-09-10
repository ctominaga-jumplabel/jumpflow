import Link from "next/link";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";

export interface ViewSwitchOption {
  label: string;
  href: string;
}

export interface ViewSwitchProps {
  /** Rótulo acessível do grupo, ex.: "Tratamento visual de Horas". */
  ariaLabel: string;
  options: [ViewSwitchOption, ViewSwitchOption];
  /** `href` da opção atualmente renderizada. */
  current: string;
  className?: string;
}

/**
 * Alternador entre os dois tratamentos visuais em validação (clássica ↔ nova).
 *
 * Existe enquanto a decisão de direção estiver aberta: as duas telas leem os
 * MESMOS dados e chamam as MESMAS server actions, então trocar aqui compara
 * apenas moldura e densidade. Quando a direção for decidida, este componente e
 * a rota perdedora saem juntos — é andaime de validação, não navegação
 * permanente, e por isso não entra no menu lateral.
 */
export function ViewSwitch({
  ariaLabel,
  options,
  current,
  className,
}: ViewSwitchProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border bg-surface-muted p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.href === current;
        return (
          <Link
            key={option.href}
            href={option.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              focusRing,
              active
                ? "bg-surface text-strong shadow-sm"
                : "text-soft hover:text-medium",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
