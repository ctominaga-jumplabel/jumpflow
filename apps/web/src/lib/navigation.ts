import type { LucideIcon } from "lucide-react";
import {
  Award,
  ClipboardCheck,
  Clock,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
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
}

/**
 * Primary operational navigation for the authenticated app shell.
 * Order follows the MVP operational cycle (docs/backlog-mvp.md).
 */
export const primaryNavigation: NavItemDef[] = [
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
    label: "Projetos",
    href: "/app/projetos",
    icon: FolderKanban,
    description: "Projetos, clientes, budget e responsáveis.",
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
    label: "Financeiro",
    href: "/app/financeiro",
    icon: Wallet,
    description: "Horas aprovadas, valor hora e fechamento mensal.",
  },
];

/** Find the active navigation entry for a given pathname. */
export function findActiveNav(pathname: string): NavItemDef | undefined {
  return primaryNavigation.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
