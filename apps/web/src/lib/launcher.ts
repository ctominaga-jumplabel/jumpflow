import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  BotMessageSquare,
  CircleDollarSign,
  ClipboardCheck,
  Clock,
  FolderKanban,
  GraduationCap,
  Receipt,
  ShieldCheck,
  Upload,
  Wallet,
} from "lucide-react";
import type { AppUser } from "./auth/types";
import {
  canAccess,
  FINANCIAL_ROLES,
  hasRole,
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
    key: "pagamentos",
    label: "Pagamentos",
    description: "Consultores, NFs e envio ao banco.",
    href: "/app/pagamentos",
    icon: Banknote,
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
  {
    key: "acessos",
    label: "Acessos",
    description: "Convites, grupos de acesso e bloqueio de usuários.",
    href: "/app/admin/acessos",
    icon: ShieldCheck,
    // Access administration is ADMIN only (auth-foundation §11).
    access: ["ADMIN"],
  },
];

/** Shortcuts the given user is allowed to see, in launcher order. */
export function shortcutsForUser(user: AppUser | null): LauncherShortcut[] {
  return launcherShortcuts.filter((s) => canAccess(user, s.access));
}

/**
 * SECTOR HOME (Wave D — Item 1). For a FINANCE-ONLY user the launcher is NOT
 * the consultant-first shortcut grid but a pair of large, centered "setor" cards
 * (Contas a Receber / Contas a Pagar) — the next decision a finance user makes
 * is *which sector*, not *which action*. The shortcut grid stays untouched for
 * every other profile; only `page.tsx` chooses between the two variations.
 */
export type LauncherSectorTone = "receber" | "pagar";

export interface LauncherSector {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  /** Drives the icon color (green = receber, blue = pagar). */
  tone: LauncherSectorTone;
  /**
   * Optional key into the shared badge map (see {@link getLauncherBadges} /
   * {@link mockLauncherBadges}) whose count annotates this sector. Reuses the
   * existing finance counter so the sector card never invents its own source.
   */
  badgeKey?: string;
  badge?: LauncherBadge;
}

/** The two financial sectors, in the order shown in the mockup (assets/01). */
export const financialSectors: LauncherSector[] = [
  {
    key: "receber",
    label: "Contas a Receber",
    description: "Gerencie apurações e recebimentos",
    href: "/app/financeiro?tab=receber",
    icon: CircleDollarSign,
    tone: "receber",
    // Fechamentos prontos p/ fechar (demo) / pendências financeiras (db).
    badgeKey: "financeiro",
  },
  {
    key: "pagar",
    label: "Contas a Pagar",
    description: "Gerencie pagamentos e obrigações",
    href: "/app/financeiro?tab=pagar",
    icon: Upload,
    tone: "pagar",
  },
];

/**
 * Whether the given user sees the sector home instead of the shortcut grid.
 * Review MÉDIO #5: the sector home is for FINANCE-ONLY users. ADMIN and
 * AREA_MANAGER are broad operational profiles that also need the consultant-first
 * shortcut grid (Aprovações, Automações, Acessos, etc.), so they keep the grid
 * even though they belong to FINANCIAL_ROLES. A user who is FINANCE *and* also a
 * manager keeps the grid (the broader operational surface wins).
 */
export function isFinancialLauncher(user: AppUser | null): boolean {
  if (!user) return false;
  const isManager = hasRole(user, ["ADMIN", "AREA_MANAGER"]);
  return hasRole(user, "FINANCE") && !isManager;
}

/**
 * Merge a `key → badge` map onto sectors by their `badgeKey` (pure). Sectors
 * without a matching badge stay unannotated, mirroring {@link withBadges}.
 */
export function sectorsWithBadges(
  sectors: LauncherSector[],
  badges: Record<string, LauncherBadge>,
): LauncherSector[] {
  return sectors.map((sector) => {
    const badge = sector.badgeKey ? badges[sector.badgeKey] : undefined;
    return badge ? { ...sector, badge } : sector;
  });
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
 * Sum the counts of a `key → badge` map (pure). Used by the topbar notification
 * bell (P20) to show a single total of actionable pending items, reusing the
 * exact same source as the launcher badges so the number never overstates the
 * user's real queue.
 */
export function sumBadgeCounts(badges: Record<string, LauncherBadge>): number {
  return Object.values(badges).reduce((total, badge) => total + badge.count, 0);
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
