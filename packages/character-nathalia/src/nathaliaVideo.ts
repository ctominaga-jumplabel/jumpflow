import type { NathaliaViewMode } from "./nathaliaFraming";
import type { NathaliaContextKey, NathaliaStateKey } from "./nathaliaTypes";

export type NathaliaVideoClipKey =
  | "idle_loop"
  | "welcome_wave"
  | "listening"
  | "thinking"
  | "explaining"
  | "pointing"
  | "success_thumbs_up"
  | "warning_attention"
  | "celebrate"
  | "goodbye"
  | "hours_clipboard"
  | "projects_kanban"
  | "approvals_badge"
  | "reports_chart";

export interface NathaliaVideoClip {
  key: NathaliaVideoClipKey;
  webm: string;
  mp4: string;
  poster: string;
}

/**
 * Base URL for the (heavy) video-avatar clips. These binaries are NOT versioned
 * in git — they are served from external storage/CDN. Point
 * `NEXT_PUBLIC_NATHALIA_VIDEO_BASE_URL` at that bucket (e.g.
 * `https://cdn.example.com/nathalia/videos/flow`) to enable the video avatar;
 * when unset, the video path stays off and the assistant uses the illustrated
 * 2D avatar (whose assets ARE versioned). See {@link isVideo2DEnabled}.
 */
const VIDEO_BASE_URL =
  process.env.NEXT_PUBLIC_NATHALIA_VIDEO_BASE_URL ?? "/nathalia/videos/flow";

export const nathaliaVideoClips: Record<NathaliaVideoClipKey, NathaliaVideoClip> = {
  idle_loop: clip("idle_loop"),
  welcome_wave: clip("welcome_wave"),
  listening: clip("listening"),
  thinking: clip("thinking"),
  explaining: clip("explaining"),
  pointing: clip("pointing"),
  success_thumbs_up: clip("success_thumbs_up"),
  warning_attention: clip("warning_attention"),
  celebrate: clip("celebrate"),
  goodbye: clip("goodbye"),
  hours_clipboard: clip("hours_clipboard"),
  projects_kanban: clip("projects_kanban"),
  approvals_badge: clip("approvals_badge"),
  reports_chart: clip("reports_chart"),
};

const CONTEXT_CLIP: Partial<Record<NathaliaContextKey, NathaliaVideoClipKey>> = {
  hours: "hours_clipboard",
  projects: "projects_kanban",
  approvals: "approvals_badge",
  reports: "reports_chart",
};

const STATE_CLIP: Record<NathaliaStateKey, NathaliaVideoClipKey> = {
  idle: "idle_loop",
  welcome: "welcome_wave",
  listening: "listening",
  thinking: "thinking",
  searching: "thinking",
  explaining: "explaining",
  pointing: "pointing",
  happy: "success_thumbs_up",
  warning: "warning_attention",
  error: "warning_attention",
  success: "success_thumbs_up",
  celebrate: "celebrate",
};

export const nathaliaVideoStageTransform: Record<
  NathaliaViewMode,
  { scale: number; x: string; y: string }
> = {
  bubble: { scale: 5.6, x: "0%", y: "150%" },
  panel: { scale: 5.05, x: "0%", y: "136%" },
  lab: { scale: 0.92, x: "0%", y: "0%" },
};

export function videoClipForNathalia(
  state: NathaliaStateKey,
  context: NathaliaContextKey,
): NathaliaVideoClip {
  const contextual = CONTEXT_CLIP[context];
  const shouldUseContext =
    contextual &&
    (state === "idle" ||
      state === "listening" ||
      state === "explaining" ||
      state === "pointing");

  return nathaliaVideoClips[shouldUseContext ? contextual : STATE_CLIP[state]];
}

function clip(key: NathaliaVideoClipKey): NathaliaVideoClip {
  return {
    key,
    webm: `${VIDEO_BASE_URL}/${key}.webm`,
    mp4: `${VIDEO_BASE_URL}/${key}.mp4`,
    poster: `${VIDEO_BASE_URL}/${key}-poster.png`,
  };
}
