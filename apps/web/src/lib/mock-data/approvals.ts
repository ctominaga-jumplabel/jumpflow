/**
 * Mocked approval queue for the MVP "Aprovações" module.
 *
 * NOTE: not connected to the database yet. Shapes mirror `Approval` + the
 * submitted `TimeEntry` it decides (docs/modelo-dados.md). Auto-approval is
 * represented with `isAutomatic` + `ruleKey`, aligned with the automation
 * engine (docs/aprovacao-automatica.md). Decision actions in the UI are
 * prepared but not yet wired to a server action — see the page comments.
 */

export type ApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "AUTO_APPROVED";

export const approvalStatusLabels: Record<ApprovalStatus, string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovado",
  REJECTED: "Reprovado",
  AUTO_APPROVED: "Auto-aprovado",
};

export interface ApprovalItem {
  id: string;
  consultantName: string;
  projectName: string;
  clientName: string;
  /** Period label, e.g. "Semana 23 · 01–07 jun". */
  period: string;
  /** Total hours under this request. */
  hours: number;
  /** Dominant activity for quick scanning. */
  activitySummary: string;
  /** ISO datetime the consultant submitted for approval. */
  submittedAt: string;
  status: ApprovalStatus;
  /** True when decided by the auto-approval engine. */
  isAutomatic: boolean;
  /** Which auto-approval rule fired, when automatic. */
  ruleKey?: string;
  /** Justification — required on rejection. */
  comment?: string;
}

export const approvalItems: ApprovalItem[] = [
  {
    id: "ap-1",
    consultantName: "Carlos Nunes",
    projectName: "Atlas",
    clientName: "Vix Energia",
    period: "Semana 23 · 01–07 jun",
    hours: 40,
    activitySummary: "Desenvolvimento",
    submittedAt: "2026-06-08T18:20:00Z",
    status: "PENDING",
    isAutomatic: false,
  },
  {
    id: "ap-2",
    consultantName: "Pedro Santana",
    projectName: "Órion",
    clientName: "Banco Sul",
    period: "Semana 23 · 01–07 jun",
    hours: 32,
    activitySummary: "Desenvolvimento · Reunião",
    submittedAt: "2026-06-08T11:05:00Z",
    status: "PENDING",
    isAutomatic: false,
  },
  {
    id: "ap-3",
    consultantName: "Marina Alves",
    projectName: "Atlas",
    clientName: "Vix Energia",
    period: "Semana 23 · 01–07 jun",
    hours: 44,
    activitySummary: "Desenvolvimento (FDS)",
    submittedAt: "2026-06-08T09:40:00Z",
    status: "PENDING",
    isAutomatic: false,
  },
  {
    id: "ap-4",
    consultantName: "Bruno Lima",
    projectName: "Helios",
    clientName: "Vix Energia",
    period: "Semana 22 · 25–31 mai",
    hours: 40,
    activitySummary: "Desenvolvimento",
    submittedAt: "2026-06-01T12:00:00Z",
    status: "AUTO_APPROVED",
    isAutomatic: true,
    ruleKey: "DEFAULT_8H_WEEKDAY",
  },
  {
    id: "ap-5",
    consultantName: "Rafael Moreira",
    projectName: "Órion",
    clientName: "Banco Sul",
    period: "Semana 22 · 25–31 mai",
    hours: 36,
    activitySummary: "Discovery",
    submittedAt: "2026-05-30T16:30:00Z",
    status: "APPROVED",
    isAutomatic: false,
  },
  {
    id: "ap-6",
    consultantName: "Carlos Nunes",
    projectName: "Vega",
    clientName: "Loja Norte",
    period: "Semana 22 · 25–31 mai",
    hours: 18,
    activitySummary: "Documentação",
    submittedAt: "2026-05-30T10:15:00Z",
    status: "REJECTED",
    isAutomatic: false,
    comment: "Lançamento sem descrição da atividade; ajustar e reenviar.",
  },
];

/** Items still awaiting a manual decision. */
export function pendingApprovals(list: ApprovalItem[]): ApprovalItem[] {
  return list.filter((item) => item.status === "PENDING");
}

/** Items already decided (manual or automatic), for the history view. */
export function decidedApprovals(list: ApprovalItem[]): ApprovalItem[] {
  return list.filter((item) => item.status !== "PENDING");
}

export interface ApprovalCounts {
  pending: number;
  approved: number;
  rejected: number;
  automatic: number;
}

/** Aggregate counts for the approvals summary header. */
export function summarizeApprovals(list: ApprovalItem[]): ApprovalCounts {
  return {
    pending: list.filter((i) => i.status === "PENDING").length,
    approved: list.filter(
      (i) => i.status === "APPROVED" || i.status === "AUTO_APPROVED",
    ).length,
    rejected: list.filter((i) => i.status === "REJECTED").length,
    automatic: list.filter((i) => i.isAutomatic).length,
  };
}
