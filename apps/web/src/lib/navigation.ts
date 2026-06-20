import type { LucideIcon } from "lucide-react";
import {
  Award,
  BarChart3,
  Banknote,
  BookOpen,
  Building2,
  CalendarRange,
  ClipboardCheck,
  Clock,
  Flag,
  FolderKanban,
  Gauge,
  GraduationCap,
  Home,
  LayoutDashboard,
  MessageSquareHeart,
  Receipt,
  ReceiptText,
  ShieldCheck,
  Smile,
  Sparkles,
  ShieldAlert,
  Sprout,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import type { RoleName } from "@/lib/auth/roles";

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
  /**
   * Roles allowed to see this item. Undefined means visible to everyone. The
   * sidebar hides items the current user cannot use; the route still enforces
   * access on the server (this is discoverability, not the security boundary).
   */
  requiredRoles?: RoleName[];
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
    // Visível a todos; o acesso é enforced no servidor (requireRole) — segue a
    // mesma convenção de Financeiro/Pagamentos (discoverability, não a fronteira
    // de segurança).
    label: "Comercial",
    href: "/app/comercial",
    icon: TrendingUp,
    description: "Precificação: tipo de cobrança, budget e valores de venda.",
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
    // Talentos (Onda 0): catálogo de skills, perfis de competência e matriz de
    // gap. Visível a papéis de gestão/talentos; a escrita é enforced no servidor
    // (COMPETENCY_WRITE_ROLES = ADMIN/PEOPLE). Discoverability, não a fronteira.
    label: "Competências",
    href: "/app/competencias",
    icon: Target,
    description: "Catálogo de skills, perfis de competência e gap do time.",
    requiredRoles: ["ADMIN", "PEOPLE", "AREA_MANAGER", "PROJECT_MANAGER", "SALES"],
  },
  {
    // Disponibilidade (Talentos, Onda 0): heatmap read-only derivado de alocação
    // + férias + status. Visível a todos os papéis exceto FINANCE; o escopo por
    // linha é enforced no servidor (discoverability, não a fronteira).
    label: "Disponibilidade",
    href: "/app/disponibilidade",
    icon: CalendarRange,
    description: "Heatmap de capacidade do time por consultor e semana.",
    requiredRoles: [
      "ADMIN",
      "PEOPLE",
      "AREA_MANAGER",
      "PROJECT_MANAGER",
      "SALES",
      "CONSULTANT",
    ],
  },
  {
    // IA de Alocação (Talentos, Prioridade 3 — §8.2): ranking determinístico de
    // candidatos a uma alocação (aderência de skills, disponibilidade, histórico
    // com cliente, [margem]). Visível aos papéis que alocam; o fator financeiro
    // é gateado no servidor (FINANCIAL_ROLES). A IA é sugestão, não aloca.
    // Discoverability, não a fronteira de segurança.
    label: "IA de Alocação",
    href: "/app/alocacao-ia",
    icon: Sparkles,
    description: "Ranking de consultores por aderência a uma alocação, com breakdown transparente.",
    requiredRoles: ["ADMIN", "AREA_MANAGER", "PROJECT_MANAGER", "SALES"],
  },
  {
    // IA de Risco de Projeto (Talentos, Prioridade 3 — §8.3): semáforo
    // GREEN/YELLOW/RED determinístico por burn rate, prazo, [margem] e feedbacks
    // CONCERN. Visível aos gestores de projeto + FINANCE (margem); o escopo por
    // linha (PROJECT_MANAGER vê só seus projetos) e o sinal de margem são gateados
    // no servidor. O sentimento por LLM é à parte e não altera o nível. A IA é
    // sugestão, não muda status. Discoverability, não a fronteira de segurança.
    label: "Risco de Projetos",
    href: "/app/risco-projetos",
    icon: ShieldAlert,
    description: "Semáforo de risco por projeto: burn rate, prazo, margem e feedbacks, com breakdown transparente.",
    requiredRoles: ["ADMIN", "AREA_MANAGER", "PROJECT_MANAGER", "FINANCE"],
  },
  {
    // Score do Consultor (Talentos, Prioridade 3 — §8.4): score 0–100
    // determinístico e transparente por avaliações, horas/presença,
    // certificações, capacitação, saldo de feedback e [realização financeira].
    // Visível à gestão de pessoas (ADMIN/PEOPLE — todos), AREA_MANAGER (seu time)
    // e CONSULTANT (o próprio); FINANCE pela ótica de realização. O fator
    // financeiro e o escopo por linha são gateados no servidor. A narrativa por
    // LLM não recalcula. Discoverability, não a fronteira de segurança.
    label: "Score",
    href: "/app/score",
    icon: Trophy,
    description: "Score 0–100 do consultor por avaliações, horas, certificações, feedback e realização, com breakdown transparente.",
    requiredRoles: ["ADMIN", "PEOPLE", "AREA_MANAGER", "FINANCE", "CONSULTANT"],
  },
  {
    // Feedback Contínuo (Talentos, Prioridade 1 — EP15): timeline + registro de
    // feedback ancorado a projeto/cliente real. Visível a gestão + CONSULTANT
    // (que só vê os próprios SHARED); a escrita é enforced no servidor
    // (FEEDBACK_WRITE_ROLES). Discoverability, não a fronteira de segurança.
    label: "Feedback",
    href: "/app/feedback",
    icon: MessageSquareHeart,
    description: "Feedback contínuo por consultor, ancorado em projetos e clientes.",
    requiredRoles: [
      "ADMIN",
      "PEOPLE",
      "AREA_MANAGER",
      "PROJECT_MANAGER",
      "CONSULTANT",
    ],
  },
  {
    // Avaliação de Desempenho (Talentos, Prioridade 1 — EP16): ciclos 90/180/360,
    // resposta por competência, resultado (radar/gap) e evolução histórica.
    // CONSULTANT vê o PRÓPRIO resultado (após fechamento) e responde só as
    // próprias avaliações; a config de ciclo é enforced no servidor
    // (EVALUATION_MANAGE_ROLES). Discoverability, não a fronteira de segurança.
    label: "Avaliações",
    href: "/app/avaliacoes",
    icon: Gauge,
    description: "Ciclos 90/180/360, radar de competências, gap e evolução.",
    requiredRoles: [
      "ADMIN",
      "PEOPLE",
      "AREA_MANAGER",
      "PROJECT_MANAGER",
      "CONSULTANT",
    ],
  },
  {
    // PDI — Plano de Desenvolvimento Individual (Talentos, Prioridade 1 — EP17):
    // gera ações a partir do gap, acompanha progresso. Visível a gestão +
    // CONSULTANT (que só vê o próprio PDI e atualiza status/evidência das
    // próprias ações); a criação/edição de estrutura é enforced no servidor
    // (DEVELOPMENT_MANAGE_ROLES). Discoverability, não a fronteira de segurança.
    label: "PDI",
    href: "/app/pdi",
    icon: Sprout,
    description: "Plano de desenvolvimento individual a partir do gap de competências.",
    requiredRoles: [
      "ADMIN",
      "PEOPLE",
      "AREA_MANAGER",
      "PROJECT_MANAGER",
      "CONSULTANT",
    ],
  },
  {
    // Clima / NPS interno (Talentos, Prioridade 2 — EP 7.1): pesquisas de clima
    // e eNPS, respostas anônimas e dashboards agregados. Visível a gestão +
    // AREA_MANAGER (dashboards) + CONSULTANT (que só vê/responde os próprios
    // convites); a gestão é enforced no servidor (SURVEY_MANAGE_ROLES).
    // Discoverability, não a fronteira de segurança.
    label: "Clima",
    href: "/app/clima",
    icon: Smile,
    description: "Pesquisas de clima e eNPS interno, respostas anônimas e dashboards.",
    requiredRoles: ["ADMIN", "PEOPLE", "AREA_MANAGER", "CONSULTANT"],
  },
  {
    // Metas e OKRs (Talentos, Prioridade 2 — EP 7.2): objetivos por escopo
    // (consultor/projeto/área/empresa) com Key Results e progresso derivado.
    // Visível a gestão + CONSULTANT (que só vê/atualiza os próprios OKRs de
    // consultor); a criação/edição de estrutura é enforced no servidor
    // (OKR_MANAGE_ROLES + canManageObjective). Discoverability, não a fronteira.
    label: "Metas",
    href: "/app/metas",
    icon: Flag,
    description: "Objetivos e Key Results por consultor, projeto, área e empresa.",
    requiredRoles: [
      "ADMIN",
      "PEOPLE",
      "AREA_MANAGER",
      "PROJECT_MANAGER",
      "CONSULTANT",
    ],
  },
  {
    // Universidade Jump (Talentos, Prioridade 2 — EP 7.3): trilhas, cursos,
    // matrícula, progresso e gamificação derivada. Visível a TODOS (o consultor
    // navega o catálogo e se matricula); a curadoria (CRUD) é enforced no
    // servidor (UNIVERSITY_CURATE_ROLES = ADMIN/PEOPLE); o ranking com nomes é
    // restrito a ADMIN/PEOPLE/AREA_MANAGER. Discoverability, não a fronteira.
    label: "Universidade",
    href: "/app/universidade",
    icon: BookOpen,
    description: "Trilhas e cursos da Universidade Jump, matrícula, progresso e ranking.",
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
    label: "Cobrança de projetos",
    href: "/app/financeiro/projetos",
    icon: ReceiptText,
    description: "Regra de cobrança por projeto (motor parametrizável).",
  },
  {
    label: "Pagamentos",
    href: "/app/pagamentos",
    icon: Banknote,
    description: "Pagamentos de consultores, NF e envio ao banco.",
  },
];

/**
 * Administration navigation, shown below the primary rail and gated by role.
 * Visible only to users who hold one of `requiredRoles`; the page itself also
 * enforces the same role on the server.
 */
export const adminNavigation: NavItemDef[] = [
  {
    label: "Acessos",
    href: "/app/admin/acessos",
    icon: ShieldCheck,
    description:
      "Convites, grupos de acesso (perfis) e bloqueio de usuários.",
    requiredRoles: ["ADMIN"],
  },
];

/** Whether the current user's roles allow seeing a navigation item. */
export function canSeeNavItem(
  item: NavItemDef,
  roles: readonly RoleName[],
): boolean {
  return (
    !item.requiredRoles ||
    item.requiredRoles.some((role) => roles.includes(role))
  );
}

/**
 * Find the active navigation entry for a given pathname. When several prefixes
 * match (e.g. `/app/financeiro` and `/app/financeiro/projetos`), the most
 * specific — longest href — wins, so a nested route highlights its own item.
 */
export function findActiveNav(pathname: string): NavItemDef | undefined {
  const matches = [...primaryNavigation, ...adminNavigation].filter((item) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  return matches.sort((a, b) => b.href.length - a.href.length)[0];
}
