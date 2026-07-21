"use client";

import type React from "react";
import { NathaliaVideoAvatar } from "./NathaliaVideoAvatar";
import type { NathaliaViewMode } from "./nathaliaFraming";
import type { NathaliaContextKey, NathaliaStateKey } from "./nathaliaTypes";

export interface Nathalia2DAppProps {
  state?: NathaliaStateKey;
  context?: NathaliaContextKey;
  viewMode?: NathaliaViewMode;
  size?: number;
  showSafeArea?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * A small 2D stage for Nathal.IA.
 *
 * `NathaliaAvatar` is the compact product primitive. This component is the
 * extensible 2D app shell: it owns a stable stage, renders the video avatar and
 * leaves an overlay layer for future controls, props, captions and debugging.
 */
export function Nathalia2DApp({
  state = "idle",
  context = "general",
  viewMode = "lab",
  size = 320,
  showSafeArea = false,
  className,
  children,
}: Nathalia2DAppProps) {
  return (
    <div
      data-nathalia-2d-app=""
      data-nathalia-state={state}
      data-nathalia-context={context}
      className={[
        "relative grid place-items-center overflow-hidden rounded-card bg-transparent",
        showSafeArea ? "outline outline-1 outline-dashed outline-brand/50" : "",
        className ?? "",
      ].join(" ")}
      style={{ width: size, height: size }}
    >
      <NathaliaVideoAvatar
        state={state}
        context={context}
        size={size}
        viewMode={viewMode}
        withRing={false}
        frame="free"
      />
      {children ? (
        <div className="pointer-events-none absolute inset-0" data-nathalia-2d-overlay="">
          {children}
        </div>
      ) : null}
    </div>
  );
}
