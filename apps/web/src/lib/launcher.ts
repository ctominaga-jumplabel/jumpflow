import type { LucideIcon } from "lucide-react";
import {
  ClipboardCheck,
  Clock,
  FolderKanban,
  GraduationCap,
  Receipt,
  Wallet,
} from "lucide-react";
import type { AppUser } from "./auth/types";
import {
  canAccess,
  FINANCIAL_ROLES,
  type RouteAccess,
} from "./auth/route-permissions";
import { currentWeek, statusCounts } from "./mock-data/timesheet";
import { expenses } from "./mock-data/expenses";
import { approvalItems, pendingApprovals } from "./mock-data/approvals";
import { currentClosing } from "./mock-data/financial";
import { certificates, summarizeCertificates } from "./mock-data/certificates";

/**
 * Operational launcher model. Pure (no server-only imports) so it is safe to
 * unit test the role filtering and to import on the edge. Badge counts come
 * from the centralized mock data; swap those sources for real queries later
 * without touching the shortcut/role contract.
 */

export type LauncherBadgeTone = "info" | "warning" | "danger";

export interface LauncherBadge {
  count: number;
  tone: LauncherBadgeTone;
  /** Short context after the count, e.g. "a enviar". */
  label: string;
}

export interface LauncherShortcut {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  /** Roles allowed to see the shortcut (`"ALL"` = any authenticated user). */
  access: RouteAccess;
  badge?: LauncherBadge;
}

const draftHours = statusCounts(currentWeek).DRAFT;
const draftExpenses = expenses.filter((e) => e.status === "DRAFT").length;
const pendingApprovalCount = pendingApprovals(approvalItems).length;
const expiringCerts = (() => {
  const c = summarizeCertificates(certificates);
  return c.expiring + c.expired;
})();
const readyToClose = currentClosing.rows.filter((r) => r.status === "READY").length;

/**
 * All operational shortcuts in consultant-first order. Management shortcuts
 * (Aprovações, Financeiro) are role-gated and only appear for allowed roles.
 */
export const launcherShortcuts: LauncherShortcut[] = [
  {
    key: "horas",
    label: "Lançar horas",
    description: "Apontamento semanal por projeto e atividade.",
    href: "/app/horas",
    icon: Clock,
    access: "ALL",
    badge:
      draftHours > 0
        ? { count: draftHours, tone: "warning", label: "rascunhos a enviar" }
        : undefined,
  },
  {
    key: "despesas",
    label: "Lançar despesas",
    description: "Registre gastos por projeto com comprovante.",
    href: "/app/despesas",
    icon: Receipt,
    access: "ALL",
    badge:
      draftExpenses > 0
        ? { count: draftExpenses, tone: "warning", label: "a enviar" }
        : undefined,
  },
  {
    key: "skills",
    label: "Skills e certificados",
    description: "Suas competências e certificações.",
    href: "/app/skills",
    icon: GraduationCap,
    access: "ALL",
    badge:
      expiringCerts > 0
        ? { count: expiringCerts, tone: "danger", label: "vencendo/vencidos" }
        : undefined,
  },
  {
    key: "projetos",
    label: "Meus projetos",
    description: "Projetos, clientes e alocações.",
    href: "/app/projetos",
    icon: FolderKanban,
    access: "ALL",
  },
  {
    key: "aprovacoes",
    label: "Aprovações",
    description: "Triagem de horas e despesas pendentes.",
    href: "/app/aprovacoes",
    icon: ClipboardCheck,
    access: ["ADMIN", "AREA_MANAGER", "PROJECT_MANAGER"],
    badge:
      pendingApprovalCount > 0
        ? { count: pendingApprovalCount, tone: "info", label: "aguardando" }
        : undefined,
  },
  {
    key: "financeiro",
    label: "Financeiro",
    description: "Fechamento mensal e despesas aprovadas.",
    href: "/app/financeiro",
    icon: Wallet,
    access: FINANCIAL_ROLES,
    badge:
      readyToClose > 0
        ? { count: readyToClose, tone: "info", label: "prontos p/ fechar" }
        : undefined,
  },
];

/** Shortcuts the given user is allowed to see, in launcher order. */
export function shortcutsForUser(user: AppUser | null): LauncherShortcut[] {
  return launcherShortcuts.filter((s) => canAccess(user, s.access));
}
