"use client";

import {
  NathaliaProvider,
  NathaliaRoot,
  NathaliaTour,
  NathaliaWidget,
  type NathaliaSignals,
  type NathaliaUser,
} from "@jumpflow/character-nathalia";

export interface NathaliaAppProps {
  /** Current user for RBAC (null while unknown). */
  user: NathaliaUser | null;
  /** Real operational signals; the provider turns them into gentle nudges. */
  signals?: NathaliaSignals;
}

/**
 * Client-only assembly of Nathal.IA: provider + floating widget + tour overlay.
 * Loaded lazily (ssr:false) by `NathaliaMount`, so no WebGL/2D avatar code runs
 * on the server or in the initial bundle of pages that never open it.
 *
 * The widget and tour are portaled to `document.body` by `NathaliaRoot` so the
 * assistant always paints above app chrome and can never be clipped by a screen
 * that wraps its content in a transformed/overflow container (Fase 8.2). The
 * provider stays outside the portal — context still flows into it.
 */
export default function NathaliaApp({ user, signals }: NathaliaAppProps) {
  return (
    <NathaliaProvider user={user} signals={signals}>
      <NathaliaRoot>
        <NathaliaWidget />
        <NathaliaTour />
      </NathaliaRoot>
    </NathaliaProvider>
  );
}
