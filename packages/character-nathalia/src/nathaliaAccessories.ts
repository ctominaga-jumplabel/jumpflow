/**
 * Accessory system for Nathal.IA (Fase 7, Etapa 9).
 *
 * Props per screen (clipboard, clock, kanban, report, chart, approval_stamp):
 * the three-free contract — registry, context→accessory mapping and URL resolver.
 *
 * **Legacy in the 2D product:** the discontinued 3D path attached these as GLBs;
 * the 2D avatar does not render an accessory mesh. The brain still references an
 * accessory *key* (a plain string) per reply, so this metadata is kept. The GLBs
 * were archived (`archive/nathalia-3d/`).
 *
 * Pure and side-effect free — safe to import anywhere.
 */
import type { NathaliaContextKey } from "./nathaliaTypes";

/** The six official accessory keys (snake_case, matching the GLB file names). */
export type NathaliaAccessoryKey =
  | "clipboard"
  | "clock"
  | "kanban"
  | "report"
  | "chart"
  | "approval_stamp";

/** Where an accessory sits: held in a hand, or floated beside the character. */
export type NathaliaAccessoryAttach = "hand.R" | "hand.L" | "scene";

export interface NathaliaAccessoryDefinition {
  key: NathaliaAccessoryKey;
  /** Root object name inside the GLB (Acc_<PascalKey>). */
  root: string;
  /** Default attach point. */
  attach: NathaliaAccessoryAttach;
  /** Uniform scale hint applied at attach time (model is in metres). */
  scale: number;
  /** Local offset in the model's metre space, three.js axes (x=side, y=up, z=depth). */
  offset: [number, number, number];
  /** pt-BR label for tooling/debug. */
  label: string;
}

/** The accessory catalogue. File name is always `accessory-<key>.glb`. */
export const nathaliaAccessories: Record<
  NathaliaAccessoryKey,
  NathaliaAccessoryDefinition
> = {
  clipboard: {
    key: "clipboard",
    root: "Acc_Clipboard",
    attach: "hand.L",
    scale: 1,
    offset: [0.42, 0.6, 0.18],
    label: "Prancheta",
  },
  clock: {
    key: "clock",
    root: "Acc_Clock",
    attach: "hand.R",
    scale: 1,
    offset: [-0.42, 0.6, 0.18],
    label: "Relógio",
  },
  kanban: {
    key: "kanban",
    root: "Acc_Kanban",
    attach: "scene",
    scale: 1,
    offset: [0.6, 1.0, 0.05],
    label: "Quadro Kanban",
  },
  report: {
    key: "report",
    root: "Acc_Report",
    attach: "hand.L",
    scale: 1,
    offset: [0.42, 0.6, 0.18],
    label: "Relatório",
  },
  chart: {
    key: "chart",
    root: "Acc_Chart",
    attach: "scene",
    scale: 1,
    offset: [0.6, 1.0, 0.05],
    label: "Gráfico",
  },
  approval_stamp: {
    key: "approval_stamp",
    root: "Acc_ApprovalStamp",
    attach: "hand.R",
    scale: 1,
    offset: [-0.42, 0.6, 0.18],
    label: "Carimbo de aprovação",
  },
};

/** Stable ordered list of accessory keys. */
export const nathaliaAccessoryKeys = Object.keys(
  nathaliaAccessories,
) as NathaliaAccessoryKey[];

/** Type guard for an arbitrary string. */
export function isAccessoryKey(value: unknown): value is NathaliaAccessoryKey {
  return typeof value === "string" && value in nathaliaAccessories;
}

/**
 * The accessory that best reinforces a given screen/context (Etapa 9/10).
 * Returns `null` for contexts where a prop would add noise (clients, settings…).
 */
const contextAccessory: Partial<
  Record<NathaliaContextKey, NathaliaAccessoryKey>
> = {
  hours: "clipboard",
  expenses: "clipboard",
  projects: "kanban",
  approvals: "approval_stamp",
  reports: "report",
  finance: "chart",
  dashboard: "chart",
};

/** Map a context to its accessory key (or `null`). */
export function accessoryForContext(
  context: NathaliaContextKey,
): NathaliaAccessoryKey | null {
  return contextAccessory[context] ?? null;
}

/** Default runtime base URL where the accessory GLBs are served. */
export const DEFAULT_NATHALIA_ACCESSORIES_BASE_URL = "/nathalia/accessories/";

/**
 * Base URL for accessory GLBs. Overridable via
 * `NEXT_PUBLIC_NATHALIA_ACCESSORIES_URL` (e.g. a CDN). The literal env access is
 * required so Next can inline it at build time.
 */
export function nathaliaAccessoriesBaseUrl(): string {
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_NATHALIA_ACCESSORIES_URL
      : undefined;
  const base =
    fromEnv && fromEnv.trim()
      ? fromEnv.trim()
      : DEFAULT_NATHALIA_ACCESSORIES_BASE_URL;
  return base.endsWith("/") ? base : `${base}/`;
}

/** File name for an accessory GLB. */
export function accessoryFileName(key: NathaliaAccessoryKey): string {
  return `accessory-${key}.glb`;
}

/** Full runtime URL for an accessory GLB. */
export function accessoryUrl(
  key: NathaliaAccessoryKey,
  baseUrl: string = nathaliaAccessoriesBaseUrl(),
): string {
  return `${baseUrl}${accessoryFileName(key)}`;
}
