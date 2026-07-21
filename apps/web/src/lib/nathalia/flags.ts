/**
 * Nathal.IA feature flags (server-side).
 *
 * The MASTER switch `NATHALIA_ENABLED` controls whether Nathal.IA exists at all.
 * It is a plain (non-`NEXT_PUBLIC_`) env var read on the server so it can be
 * flipped at runtime on the host (e.g. Vercel project env) WITHOUT a rebuild —
 * the authenticated layout reads it per request and mounts (or does not mount)
 * the assistant accordingly.
 *
 * Default is OFF: only the exact string "true" enables the assistant. Anything
 * else (unset, "false", "0", "") keeps the whole feature dark — no mount, no
 * client bundle, no signal computation.
 */
export function isNathaliaFeatureEnabled(): boolean {
  return process.env.NATHALIA_ENABLED === "true";
}
