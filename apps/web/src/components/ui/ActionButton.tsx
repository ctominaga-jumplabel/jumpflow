import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { tactileButton, focusRing } from "@/lib/styles";

export type ActionVariant = "primary" | "secondary" | "success" | "danger";
export type ActionSize = "sm" | "md";

const variantStyles: Record<ActionVariant, string> = {
  primary: "bg-brand-fill text-white",
  secondary: "bg-surface text-strong",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
};

/**
 * Tratamento plano (`tactile={false}`), para a direção Operational Minimal.
 * A ação PRIMÁRIA aqui usa o acento laranja da direção; o azul continua sendo
 * link, foco e informação, como no protótipo de referência (que mantém as duas
 * cores: `.btn.primary` laranja e `.btn.info` azul).
 * Sem borda ink nem sombra dura: a hierarquia entre primário e secundário passa
 * a vir só do preenchimento, que é o que permite cinco botões conviverem numa
 * barra sem que todos gritem igual.
 */
const flatVariantStyles: Record<ActionVariant, string> = {
  primary:
    "border border-transparent bg-ops-accent-fill text-white hover:bg-ops-accent-fill-hover",
  secondary:
    "border border-border bg-surface text-medium hover:bg-surface-muted hover:text-strong",
  success:
    "border border-success/30 bg-success-soft text-success hover:bg-success-soft/70",
  danger: "border border-danger/30 bg-danger-soft text-danger hover:bg-danger-soft/70",
};

const sizeStyles: Record<ActionSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
};

export interface ActionButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ActionVariant;
  size?: ActionSize;
  icon?: LucideIcon;
  /**
   * Acabamento Playful Ops (borda ink + sombra dura que "afunda" no clique).
   * `false` entrega o botão plano da direção Operational Minimal. Default
   * `true` — os consumidores existentes não mudam.
   */
  tactile?: boolean;
  children: ReactNode;
}

/**
 * Tactile Playful Ops button (ink border + hard shadow that presses on click).
 * Use for primary/secondary actions and prepared (not-yet-wired) operations.
 * Render inside a client component when passing `onClick`.
 */
export function ActionButton({
  variant = "primary",
  size = "md",
  icon: Icon,
  tactile = true,
  children,
  className,
  type = "button",
  ...props
}: ActionButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-semibold disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
        tactile ? tactileButton : "transition-colors",
        focusRing,
        tactile ? variantStyles[variant] : flatVariantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" className="size-4" /> : null}
      {children}
    </button>
  );
}
