/** Aggregated FAQ catalogue across all topics (Fase 8). */
import { approvalsFaq } from "./approvals";
import { hoursFaq } from "./hours";
import { projectsFaq } from "./projects";
import { reportsFaq } from "./reports";
import { settingsFaq } from "./settings";
import type { NathaliaFaqEntry } from "./types";

/** All FAQ entries, stable order (hours → projects → approvals → reports → settings). */
export const nathaliaFaqEntries: NathaliaFaqEntry[] = [
  ...hoursFaq,
  ...projectsFaq,
  ...approvalsFaq,
  ...reportsFaq,
  ...settingsFaq,
];
