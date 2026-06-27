/**
 * Feature flag for the Feed social interno (Melhoria #5).
 *
 * Edge-safe: only reads `process.env` (NEXT_PUBLIC_* so it is inlined for the
 * client too). Defaults to OFF — when off, the navigation hides the Feed item
 * and the `/app/feed` route is not exposed (the page returns notFound). This
 * mirrors the pattern of `lib/feedback/flags.ts`.
 *
 * To enable locally, set in the env:
 *   NEXT_PUBLIC_FEATURE_FEED=true
 */

function isEnabled(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

/** Whether the Feed social interno is enabled (atrás de flag, off por padrão). */
export function isFeedEnabled(): boolean {
  return isEnabled(process.env.NEXT_PUBLIC_FEATURE_FEED);
}
