import Image from "next/image";
import { cn } from "@/lib/utils";

export interface BrandMarkProps {
  /** Rendered box size in px (the logo is contained within, with padding). */
  size?: number;
  /**
   * When true (default), the mark sits in a white tile with the brutalist
   * ink border + drop shadow, matching the design system. When false, the
   * transparent logo is rendered bare (useful over light surfaces).
   */
  framed?: boolean;
  /**
   * Accessible label. Defaults to "" (decorative) since the mark is normally
   * paired with the visible product name. Pass a label when it stands alone.
   */
  alt?: string;
  className?: string;
}

/**
 * The JumpFlow brand mark (transparent logo asset). Single source of truth for
 * rendering the logo so every surface stays consistent and a future rebrand
 * only needs the asset + this component to change.
 */
export function BrandMark({
  size = 36,
  framed = true,
  alt = "",
  className,
}: BrandMarkProps) {
  const inner = Math.round(size * (framed ? 0.74 : 1));
  const logo = (
    <Image
      src="/brand/jumpflow-logo.png"
      alt={alt}
      aria-hidden={alt ? undefined : true}
      width={inner}
      height={inner}
      priority
      className="object-contain"
    />
  );

  if (!framed) {
    return (
      <span
        className={cn("inline-grid shrink-0 place-items-center", className)}
        style={{ width: size, height: size }}
      >
        {logo}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-md border-2 border-ink bg-white shadow-[2px_2px_0_0_var(--color-ink)]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {logo}
    </span>
  );
}
