"use client";

/**
 * NathaliaAvatarRive — interactive **vector** avatar powered by Rive.
 *
 * Renders an authored `.riv` (see `docs/nathalia/RIVE_SPEC.md`) and drives its
 * state machine from the store-fed props: `mood` (visual state), `speaking`
 * (talking) and `viseme` (mouth shape). This is where real eyelid blinks and
 * lip-sync live — the `.riv` owns the idle blink/gaze, so React only feeds intent.
 *
 * The Rive runtime (`@rive-app/react-canvas`) is imported ONLY here; the barrel
 * reaches this module exclusively through the lazy boundary
 * `NathaliaAvatarRiveLazy`, so Rive/WASM never enters the initial bundle.
 *
 * Until an authored `.riv` exists at `NATHALIA_RIVE_SRC`, `onLoadError` fires and
 * we render `fallback` (the 2D expression avatar) — so enabling the flag early is
 * safe and simply keeps the current face.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useRive, useStateMachineInput } from "@rive-app/react-canvas";
import { getNathaliaState, intentAccent } from "./nathaliaStates";
import {
  NATHALIA_RIVE_ARTBOARD,
  NATHALIA_RIVE_INPUTS,
  NATHALIA_RIVE_SRC,
  NATHALIA_RIVE_STATE_MACHINE,
  moodToRiveIndex,
  visemeToRiveIndex,
} from "./nathaliaRive";
import type { NathaliaStateKey } from "./nathaliaTypes";

export interface NathaliaAvatarRiveProps {
  state?: NathaliaStateKey;
  /** Drives the `speaking` boolean input (lip-sync). */
  speaking?: boolean;
  /** Audio/cyclic mouth shape (viseme key) → `viseme` number input. */
  viseme?: string | null;
  size?: number;
  withRing?: boolean;
  className?: string;
  /** Shown while the `.riv` loads, or permanently if it cannot load. */
  fallback?: ReactNode;
}

export function NathaliaAvatarRive({
  state = "idle",
  speaking = false,
  viseme = null,
  size = 56,
  withRing = true,
  className,
  fallback = null,
}: NathaliaAvatarRiveProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const { rive, RiveComponent } = useRive({
    src: NATHALIA_RIVE_SRC,
    artboard: NATHALIA_RIVE_ARTBOARD,
    stateMachines: NATHALIA_RIVE_STATE_MACHINE,
    autoplay: true,
    onLoad: () => setLoaded(true),
    onLoadError: () => setFailed(true),
  });

  const moodInput = useStateMachineInput(
    rive,
    NATHALIA_RIVE_STATE_MACHINE,
    NATHALIA_RIVE_INPUTS.mood,
  );
  const speakingInput = useStateMachineInput(
    rive,
    NATHALIA_RIVE_STATE_MACHINE,
    NATHALIA_RIVE_INPUTS.speaking,
  );
  const visemeInput = useStateMachineInput(
    rive,
    NATHALIA_RIVE_STATE_MACHINE,
    NATHALIA_RIVE_INPUTS.viseme,
  );

  useEffect(() => {
    if (moodInput) moodInput.value = moodToRiveIndex(state);
  }, [moodInput, state]);
  useEffect(() => {
    if (speakingInput) speakingInput.value = speaking;
  }, [speakingInput, speaking]);
  useEffect(() => {
    if (visemeInput) visemeInput.value = visemeToRiveIndex(viseme);
  }, [visemeInput, viseme]);

  // Hard failure (no `.riv`, decode error): render only the 2D fallback.
  if (failed) return <>{fallback}</>;

  const accent = intentAccent[getNathaliaState(state).intent];
  return (
    <div
      data-nathalia-variant="rive"
      data-nathalia-state={state}
      className={[
        "relative grid place-items-center overflow-hidden rounded-full",
        accent.chip,
        withRing ? `ring-2 ring-offset-1 ${accent.ring}` : "",
        className ?? "",
      ].join(" ")}
      style={{ width: size, height: size }}
    >
      {/* Fallback shows until the .riv finishes loading. */}
      {!loaded ? <div className="absolute inset-0">{fallback}</div> : null}
      <RiveComponent
        style={{ width: size, height: size, opacity: loaded ? 1 : 0 }}
      />
    </div>
  );
}

export default NathaliaAvatarRive;
