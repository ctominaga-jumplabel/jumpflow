import type { LucideIcon } from "lucide-react";
import {
  BotMessageSquare,
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
 * Operational launcher model. PURE (no server-only imports) so it is safe to
 * unit test the role filtering and to import on the edge.
 *
 * Shortcuts carry NO badge here: badge counts are derived separately so the
 * shortcut/role contract stays free of data sources. Real counts come from
 * `lib/db/launcher-badges.ts` (server) when a database is configured; the
 * demo-mode fallback ({@link mockLauncherBadges}) derives them from the
 * centralized mock data.
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
  },
  {
    key: "despesas",
    label: "Lançar despesas",
    description: "Registre gastos por projeto com comprovante.",
    href: "/app/despesas",
    icon: Receipt,
    access: "ALL",
  },
  {
    key: "skills",
    label: "Skills e certificados",
    description: "Suas competências e certificações.",
    href: "/app/skills",
    icon: GraduationCap,
    access: "ALL",
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
    // Mirrors the route map: FINANCE decides the finance stage of expenses.
    access: ["ADMIN", "AREA_MANAGER", "PROJECT_MANAGER", "FINANCE"],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    description: "Fechamento mensal e despesas aprovadas.",
    href: "/app/financeiro",
    icon: Wallet,
    access: FINANCIAL_ROLES,
  },
  {
    key: "aprovacao-automatica",
    label: "Aprovação automática",
    description: "Configuração, exceções e pendências da automação.",
    href: "/app/automacoes/aprovacao-automatica",
    icon: BotMessageSquare,
    // Management only; PROJECT_MANAGER read-only deferred to a later round.
    access: ["ADMIN", "AREA_MANAGER"],
  },
];

/** Shortcuts the given user is allowed to see, in launcher order. */
export function shortcutsForUser(user: AppUser | null): LauncherShortcut[] {
  return launcherShortcuts.filter((s) => canAccess(user, s.access));
}

/**
 * Merge a `key → badge` map into a list of shortcuts (pure). Unknown keys are
 * ignored and shortcuts without a matching badge stay unannotated.
 */
export function withBadges(
  shortcuts: LauncherShortcut[],
  badges: Record<string, LauncherBadge>,
): LauncherShortcut[] {
  return shortcuts.map((shortcut) => {
    const badge = badges[shortcut.key];
    return badge ? { ...shortcut, badge } : shortcut;
  });
}

/**
 * Demo-mode badges derived from the centralized mock data. Pure and honest:
 * used only when no database is configured, mirroring what the real badge
 * source ({@link import("./db/launcher-badges")}) reports against live data.
 */
export function mockLauncherBadges(): Record<string, LauncherBadge> {
  const badges: Record<string, LauncherBadge> = {};

  const draftHours = statusCounts(currentWeek).DRAFT;
  if (draftHours > 0) {
    badges.horas = {
      count: draftHours,
      tone: "warning",
      label: "rascunhos pendentes",
    };
  }

  const draftExpenses = expenses.filter((e) => e.status === "DRAFT").length;
  if (draftExpenses > 0) {
    badges.despesas = { count: draftExpenses, tone: "warning", label: "a enviar" };
  }

  const c = summarizeCertificates(certificates);
  const expiringCerts = c.expiring + c.expired;
  if (expiringCerts > 0) {
    badges.skills = {
      count: expiringCerts,
      tone: "danger",
      label: "vencendo/vencidos",
    };
  }

  const pendingApprovalCount = pendingApprovals(approvalItems).length;
  if (pendingApprovalCount > 0) {
    badges.aprovacoes = {
      count: pendingApprovalCount,
      tone: "info",
      label: "aguardando",
    };
  }

  const readyToClose = currentClosing.rows.filter(
    (r) => r.status === "READY",
  ).length;
  if (readyToClose > 0) {
    badges.financeiro = {
      count: readyToClose,
      tone: "info",
      label: "prontos p/ fechar",
    };
  }

  return badges;
}
