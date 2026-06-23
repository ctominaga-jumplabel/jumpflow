/**
 * Brand tokens for transactional/operational emails.
 *
 * These mirror the JumpFlow "Playful Ops" palette declared in
 * `apps/web/src/app/globals.css` and documented in `docs/design-system.md`.
 * Email clients cannot read CSS variables or Tailwind, so the values are
 * duplicated here as literals — keep them in sync with the design system.
 *
 * Visual direction in email:
 * - Neutral canvas, white card surface.
 * - Controlled neo-brutalism reserved for HIGH-VALUE elements only (the card
 *   frame and the primary CTA): 2px ink border + hard offset shadow.
 * - Lists/tables stay clean and scannable (no heavy borders).
 * - Geist is unavailable in mail clients; fall back to a system sans stack.
 */
export const emailTheme = {
  color: {
    canvas: "#f7f5ea",
    surface: "#ffffff",
    surfaceMuted: "#eceff3",
    ink: "#111814",
    textStrong: "#111814",
    textMedium: "#42524a",
    textSoft: "#6d756f",
    borderSoft: "#d7d8cf",
    // Action
    blue: "#2457ff",
    blueDark: "#1237b8",
    blueSoft: "#dde4ff",
    // Semantic text (AA on soft backgrounds)
    successText: "#166534",
    warningText: "#92400e",
    errorText: "#b91c1c",
    successSoft: "#dcfce7",
    warningSoft: "#fef3c7",
    errorSoft: "#fee2e2",
    // Playful accents (blocks/markers only, never as text on light bg)
    coral: "#ff5a5f",
    flowGreen: "#32d583",
    markerYellow: "#ffd43b",
  },
  font: {
    sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    mono: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
  },
  radius: "8px",
  maxWidth: "600px",
} as const;

export type EmailTone = "neutral" | "success" | "warning" | "error" | "info";

/** Map a semantic tone to a (text, background) pair for callouts/badges. */
export function toneColors(tone: EmailTone): { text: string; bg: string } {
  switch (tone) {
    case "success":
      return { text: emailTheme.color.successText, bg: emailTheme.color.successSoft };
    case "warning":
      return { text: emailTheme.color.warningText, bg: emailTheme.color.warningSoft };
    case "error":
      return { text: emailTheme.color.errorText, bg: emailTheme.color.errorSoft };
    case "info":
      return { text: emailTheme.color.blueDark, bg: emailTheme.color.blueSoft };
    case "neutral":
    default:
      return { text: emailTheme.color.textMedium, bg: emailTheme.color.surfaceMuted };
  }
}
