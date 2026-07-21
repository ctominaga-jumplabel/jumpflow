"use client";

/**
 * Lazy boundary for the Rive avatar. `NathaliaAvatarRive` imports the Rive
 * runtime (`@rive-app/react-canvas`, WASM); reaching it only through this
 * `React.lazy` chunk keeps Rive out of the initial bundle. The barrel exports
 * THIS, never `NathaliaAvatarRive` directly.
 *
 * While the chunk (or the `.riv`) loads, the Suspense fallback is the same 2D
 * avatar passed in `props.fallback`, so there is never a blank flash.
 */
import { lazy, Suspense } from "react";
import type { NathaliaAvatarRiveProps } from "./NathaliaAvatarRive";

const Impl = lazy(() => import("./NathaliaAvatarRive"));

export function NathaliaAvatarRiveLazy(props: NathaliaAvatarRiveProps) {
  return (
    <Suspense fallback={props.fallback ?? null}>
      <Impl {...props} />
    </Suspense>
  );
}

export type { NathaliaAvatarRiveProps };
