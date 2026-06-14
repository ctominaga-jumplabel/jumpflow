import type { LucideIcon } from "lucide-react";
import {
  Award,
  BarChart3,
  Banknote,
  Building2,
  ClipboardCheck,
  Clock,
  FolderKanban,
  GraduationCap,
  Home,
  LayoutDashboard,
  Receipt,
  Users,
  Wallet,
} from "lucide-react";

export interface NavItemDef {
  /** Visible label in the sidebar. */
  label: string;
  /** Route the item links to. */
  href: string;
  /** Icon rendered to the left of the label. */
  icon: LucideIcon;
  /** Short operational description used on placeholder pages. */
  description: string;
  /**
   * When true, the item is active only on an exact pathname match (not on
   * descendant routes). Used by the launcher ("/app") so it does not light up
   * on every nested page.
   */
  exact?: boolean;
}

/**
 * Primary operational navigation for the authenticated app shell.
 * Order follows the MVP operational cycle (docs/backlog-mvp.md).
 */
export const primaryNavigation: NavItemDef[] = [
  {
    label: "Início",
    href: "/app",
    icon: Home,
    description: "Atalhos operacionais e pendências por perfil.",
    exact: true,
  },
  {
    label: "Dashboard",
    href: "/app/dashboard",
    icon: LayoutDashboard,
    description: "Visão geral de pendências, alocação e fechamentos.",
  },
  {
    label: "Horas",
    href: "/app/horas",
    icon: Clock,
    description: "Lançamento semanal e acompanhamento de horas.",
  },
  {
    label: "Despesas",
    href: "/app/despesas",
    icon: Receipt,
    description: "Lançamento de despesas, comprovantes e reembolsos.",
  },
  {
    label: "Projetos",
    href: "/app/projetos",
    icon: FolderKanban,
    description: "Projetos, clientes, budget e responsáveis.",
  },
  {
    label: "Clientes",
    href: "/app/clientes",
    icon: Building2,
    description: "Clientes, CNPJ, regras fiscais e tipos de cobranca.",
  },
  {
    label: "Consultores",
    href: "/app/consultores",
    icon: Users,
    description: "Cadastro, senioridade e disponibilidade dos consultores.",
  },
  {
    label: "Skills",
    href: "/app/skills",
    icon: GraduationCap,
    description: "Matriz de competências técnicas e comportamentais.",
  },
  {
    label: "Certificados",
    href: "/app/certificados",
    icon: Award,
    description: "Certificações, validade e alertas de vencimento.",
  },
  {
    label: "Aprovações",
    href: "/app/aprovacoes",
    icon: ClipboardCheck,
    description: "Fluxo de aprovação e reprovação de horas.",
  },
  {
    label: "Relatórios",
    href: "/app/relatorios",
    icon: BarChart3,
    description: "Relatórios de horas, despesas e consolidado, com exportação.",
  },
  {
    label: "Financeiro",
    href: "/app/financeiro",
    icon: Wallet,
    description: "Horas aprovadas, valor hora e fechamento mensal.",
  },
  {
    label: "Pagamentos",
    href: "/app/pagamentos",
    icon: Banknote,
    description: "Pagamentos de consultores, NF e envio ao banco.",
  },
];

/** Find the active navigation entry for a given pathname. */
export function findActiveNav(pathname: string): NavItemDef | undefined {
  return primaryNavigation.find((item) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
