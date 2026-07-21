"use client";

import { useEffect, useRef } from "react";
import { getNathaliaState, intentAccent } from "./nathaliaStates";
import { nathaliaCopy } from "./nathaliaCopy";
import {
  nathaliaVideoStageTransform,
  videoClipForNathalia,
} from "./nathaliaVideo";
import type { NathaliaViewMode } from "./nathaliaFraming";
import type { NathaliaContextKey, NathaliaStateKey } from "./nathaliaTypes";

export interface NathaliaVideoAvatarProps {
  state?: NathaliaStateKey;
  context?: NathaliaContextKey;
  size?: number;
  withRing?: boolean;
  viewMode?: NathaliaViewMode;
  className?: string;
  autoPlay?: boolean;
  loop?: boolean;
  frame?: "circle" | "free";
}

export function NathaliaVideoAvatar({
  state = "idle",
  context = "general",
  size = 56,
  withRing = true,
  viewMode = "bubble",
  className,
  autoPlay = true,
  loop = true,
  frame = "circle",
}: NathaliaVideoAvatarProps) {
  const def = getNathaliaState(state);
  const accent = intentAccent[def.intent];
  const clip = videoClipForNathalia(state, context);
  const transform = nathaliaVideoStageTransform[viewMode];
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "test") return;
    if (!autoPlay) return;
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    try {
      const result = video.play();
      if (typeof result?.catch === "function") {
        void result.catch(() => {
          // Browsers may block autoplay in unusual environments; poster remains visible.
        });
      }
    } catch {
      // JSDOM/old browsers may not implement play(); poster remains visible.
    }
  }, [autoPlay, clip.key]);

  return (
    <div
      data-nathalia-state={state}
      data-nathalia-context={context}
      data-nathalia-variant="video-2d"
      data-nathalia-video={clip.key}
      data-nathalia-view={viewMode}
      className={[
        "relative grid place-items-center",
        frame === "circle" ? "overflow-hidden rounded-full" : "overflow-visible",
        frame === "circle" ? accent.chip : "",
        frame === "circle" && withRing ? `ring-2 ring-offset-1 ${accent.ring}` : "",
        className ?? "",
      ].join(" ")}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${nathaliaCopy.name} - ${def.label}`}
    >
      <video
        key={clip.key}
        ref={videoRef}
        poster={clip.poster}
        className="absolute inset-0 h-full w-full select-none object-contain"
        style={{
          transform: `translate(${transform.x}, ${transform.y}) scale(${transform.scale})`,
          transformOrigin: "50% 50%",
        }}
        autoPlay={autoPlay}
        loop={loop}
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
      >
        <source src={clip.webm} type="video/webm" />
      </video>
    </div>
  );
}
