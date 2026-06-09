import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { tactileButton, focusRing } from "@/lib/styles";

export type ActionVariant = "primary" | "secondary" | "success" | "danger";
export type ActionSize = "sm" | "md";

const variantStyles: Record<ActionVariant, string> = {
  primary: "bg-brand text-white",
  secondary: "bg-surface text-strong",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
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
        tactileButton,
        focusRing,
        variantStyles[variant],
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
