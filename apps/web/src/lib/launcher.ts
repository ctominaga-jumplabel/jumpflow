import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  BotMessageSquare,
  CircleDollarSign,
  ClipboardCheck,
  Clock,
  FolderKanban,
  GraduationCap,
  ListChecks,
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
 * SECTOR HOME (Wave D — Item 1). For an EXCLUSIVELY-FINANCE user the launcher is
 * NOT the consultant-first shortcut grid but three large, centered "setor" cards
 * (Contas a Receber / Contas a Pagar / Pendentes de Fechamento) — the next
 * decision a finance user makes is *which sector*, not *which action*. The
 * ADMIN gets the operational grid and every other profile is redirected to the
 * Feed; only `page.tsx` chooses between these variations (see
 * {@link isAdminLauncher} / {@link isExclusivelyFinance}).
 */
export type LauncherSectorTone = "receber" | "pagar" | "pendentes";

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

/**
 * The financial sectors, in the order shown on the home. Melhorias v2
 * (2026-07-25): passa a haver um 3º card — Pendentes de Fechamento — onde o
 * Gerente de Área libera projetos para faturamento; Contas a Receber só mostra
 * o que já foi liberado (RevenueClosing CLOSED).
 */
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
  {
    key: "pendentes",
    label: "Pendentes de Fechamento",
    description: "Libere projetos para faturamento",
    // Correções de navegação (2026-07-27): a aba Pendentes agora vive DENTRO do
    // Financeiro; o Financeiro-exclusivo (que vê estes cards) acessa por
    // `?tab=pendentes`. A rota standalone segue existindo para o AREA_MANAGER.
    href: "/app/financeiro?tab=pendentes",
    icon: ListChecks,
    tone: "pendentes",
    // Nº de projetos pendentes de liberação. O contador real é ligado numa wave
    // posterior; por ora sem badge (ausente = não anotado, não quebra a home).
    badgeKey: "pendentesFechamento",
  },
];

/**
 * Whether the given user sees the operational shortcut GRID on `/app`.
 * Correções de navegação (2026-07-27): o ADMIN volta a entrar pela grade de
 * atalhos operacional (não pela home de 3 cards). Precedência: esta checagem
 * roda ANTES de {@link isExclusivelyFinance}, então um combo ADMIN+FINANCE(+…)
 * cai na grade, e nunca nos 3 cards.
 */
export function isAdminLauncher(user: AppUser | null): boolean {
  return hasRole(user, "ADMIN");
}

/**
 * Whether the given user is EXCLUSIVELY Financeiro (papel FINANCE e nenhum
 * outro). Só esse perfil vê a home de 3 cards (Contas a Receber, Contas a Pagar,
 * Pendentes de Fechamento). Um usuário FINANCE que também seja ADMIN cai na
 * grade (isAdminLauncher tem precedência); um FINANCE que também seja
 * AREA_MANAGER/PM/etc. NÃO é exclusivo aqui e vai para o Feed. `roles.length>0`
 * evita tratar um usuário sem papéis como "todos FINANCE".
 */
export function isExclusivelyFinance(user: AppUser | null): boolean {
  if (!user) return false;
  return user.roles.length > 0 && user.roles.every((r) => r === "FINANCE");
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

  // Pendentes de Fechamento (demo): projetos ainda NÃO liberados (qualquer status
  // exceto CLOSED). Coerente com o card `pendentesFechamento` da home financeira.
  const pendingClosings = currentClosing.rows.filter(
    (r) => r.status !== "CLOSED",
  ).length;
  if (pendingClosings > 0) {
    badges.pendentesFechamento = {
      count: pendingClosings,
      tone: "warning",
      label: "a liberar",
    };
  }

  return badges;
}
