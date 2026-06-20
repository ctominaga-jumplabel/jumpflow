/**
 * Shared, pure types for the Feedback Contínuo (Talentos — Prioridade 1) module.
 *
 * No server-only imports so these are safe to import from client components,
 * schemas and tests. Mirrors the Prisma model `Feedback` and its enums
 * (`FeedbackType`, `FeedbackSource`, `FeedbackVisibility`, `TranscriptionStatus`).
 * See docs/backlog-talentos.md EP15.
 */

export type FeedbackType = "PRAISE" | "GUIDANCE" | "RECOGNITION" | "CONCERN";
export type FeedbackSource = "INTERNAL" | "CLIENT" | "PEER";
export type FeedbackVisibility = "PRIVATE" | "SHARED";
export type TranscriptionStatus = "NONE" | "PENDING" | "DONE" | "FAILED";

export const feedbackTypeLabels: Record<FeedbackType, string> = {
  PRAISE: "Elogio",
  GUIDANCE: "Orientação",
  RECOGNITION: "Reconhecimento",
  CONCERN: "Ponto de atenção",
};

export const feedbackSourceLabels: Record<FeedbackSource, string> = {
  INTERNAL: "Interno",
  CLIENT: "Cliente",
  PEER: "Par (peer)",
};

export const feedbackVisibilityLabels: Record<FeedbackVisibility, string> = {
  PRIVATE: "Privado",
  SHARED: "Compartilhado",
};

/** Tone hint for the type chip (maps to StatusBadge tone). */
export const feedbackTypeTone: Record<
  FeedbackType,
  "success" | "info" | "neutral" | "warning"
> = {
  PRAISE: "success",
  GUIDANCE: "info",
  RECOGNITION: "success",
  CONCERN: "warning",
};

// ── Read-model (timeline) ───────────────────────────────────────────────────

/** A single feedback row as projected for the timeline (no audio internals). */
export interface FeedbackItem {
  id: string;
  subjectConsultantId: string;
  subjectConsultantName: string;
  type: FeedbackType;
  source: FeedbackSource;
  visibility: FeedbackVisibility;
  body: string;
  /** Author display name; null when the author user was removed (SetNull). */
  authorName: string | null;
  /** Author user id; used by the UI/scope to flag "you wrote this". */
  authorUserId: string | null;
  relatedProjectId: string | null;
  relatedProjectName: string | null;
  relatedClientId: string | null;
  relatedClientName: string | null;
  /** ISO date string (createdAt). */
  createdAt: string;
  /** Whether the viewer may edit/change visibility (author or PEOPLE/ADMIN). */
  canManage: boolean;
}

/** Lightweight option for the consultor-alvo select. */
export interface ConsultantOption {
  id: string;
  name: string;
}

/** Lightweight option for the related-project select (carries clientId). */
export interface ProjectOption {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
}

/** Lightweight option for the related-client select. */
export interface ClientOption {
  id: string;
  name: string;
}
