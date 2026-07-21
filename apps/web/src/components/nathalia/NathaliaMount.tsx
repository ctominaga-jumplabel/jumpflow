"use client";

import dynamic from "next/dynamic";
import type { NathaliaSignals, NathaliaUser } from "@jumpflow/character-nathalia";

/**
 * Lazily mounts Nathal.IA on the client only. `ssr: false` keeps the assistant
 * (and its motion/avatar code) out of the server render and the initial page
 * payload — it loads after hydration in the authenticated shell. Shown only in
 * `/app/*`; never on the login screen.
 */
const NathaliaApp = dynamic(() => import("./NathaliaApp"), {
  ssr: false,
  loading: () => null,
});

export interface NathaliaMountProps {
  user: NathaliaUser | null;
  /**
   * Real operational signals computed on the server (hours, approvals, late
   * activities). Plain serializable object, so it crosses the server→client
   * boundary fine even though the mount itself is `ssr: false`.
   */
  signals?: NathaliaSignals;
}

export function NathaliaMount({ user, signals }: NathaliaMountProps) {
  return <NathaliaApp user={user} signals={signals} />;
}
