import type { LucideIcon } from "lucide-react";
import {
  Award,
  BarChart3,
  Banknote,
  BellRing,
  BookOpen,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  Clock,
  Flag,
  FolderKanban,
  Gauge,
  GraduationCap,
  Headset,
  Home,
  KeyRound,
  LayoutDashboard,
  ListOrdered,
  MessageSquareHeart,
  MessagesSquare,
  PlaneTakeoff,
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
import { appConfig } from "@/config/app";
import type { RoleName } from "@/lib/auth/roles";
import { isFeedEnabled } from "@/lib/feed/flags";
import { isModuleDisabled } from "@/lib/modules/disabled-modules";
import { isCheckpointEnabled } from "@/lib/checkpoint/flags";

export interface NavItemDef {
  /** Visible label in the sidebar. */
  label: string;
  /** Route the item links to. */
  href: string;
  /**
   * When true, `href` is an absolute URL to an external site (e.g. the
   * JumpAcademy portal). Rendered as a plain `<a target="_blank">` instead of a
   * Next `<Link>`, and never treated as the active route.
   */
  external?: boolean;
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
   *
   * Legacy static gate, kept during the migration to the permission matrix.
   * When `permissionCode` is also set, the matrix (can_view) is the primary
   * gate and this acts as a fallback.
   */
  requiredRoles?: RoleName[];
  /**
   * Permission code (matrix) that governs visibility AND route access for this
   * item. When set, the sidebar hides the item unless the user's matrix grants
   * `view`, and the app layout enforces `requirePermission(code, "view")` for
   * the route (403 on direct URL access). Undefined means no matrix gate.
   */
  permissionCode?: string;
}

/**
 * Primary operational navigation for the authenticated app shell.
 * Order follows the MVP operational cycle (docs/backlog-mvp.md).
 *
 * `primaryNavigationRaw` is the full catalog; the exported `primaryNavigation`
 * below hides items whose `permissionCode` belongs to a disabled module
 * (EP-M07). Keeping the raw list makes reabilitar um módulo uma edição de um
 * único ponto (disabled-modules.ts).
 */
const primaryNavigationRaw: NavItemDef[] = [
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
    permissionCode: "DASHBOARD",
    icon: LayoutDashboard,
    description: "Visão geral de pendências, alocação e fechamentos.",
  },
  {
    label: "Horas",
    href: "/app/horas",
    permissionCode: "HORAS",
    icon: Clock,
    description: "Lançamento semanal e acompanhamento de horas.",
  },
  {
    label: "Despesas",
    href: "/app/despesas",
    permissionCode: "DESPESAS",
    icon: Receipt,
    description: "Lançamento de despesas, comprovantes e reembolsos.",
  },
  {
    // Ausências (Onda D): o consultor solicita/cancela as próprias férias,
    // licenças e outras ausências; ADMIN/PEOPLE decidem. Visível a todos com a
    // permissão AUSENCIAS (inclui CONSULTANT, no allow-list); a decisão é
    // enforced no servidor (requireRole ADMIN/PEOPLE). Discoverability, não a
    // fronteira de segurança.
    label: "Ausências",
    href: "/app/ausencias",
    permissionCode: "AUSENCIAS",
    icon: PlaneTakeoff,
    description: "Solicitação e aprovação de férias, licenças e ausências.",
  },
  {
    label: "Projetos",
    href: "/app/projetos",
    permissionCode: "PROJETOS",
    icon: FolderKanban,
    description: "Projetos, clientes, budget e responsáveis.",
  },
  {
    label: "Clientes",
    href: "/app/clientes",
    permissionCode: "CLIENTES",
    icon: Building2,
    description: "Clientes, CNPJ, regras fiscais e tipos de cobranca.",
  },
  {
    // Visível a todos; o acesso é enforced no servidor (requireRole) — segue a
    // mesma convenção de Financeiro/Pagamentos (discoverability, não a fronteira
    // de segurança).
    label: "Comercial",
    href: "/app/comercial",
    permissionCode: "COMERCIAL",
    icon: TrendingUp,
    description: "Precificação: tipo de cobrança, budget e valores de venda.",
  },
  {
    label: "Consultores",
    href: "/app/consultores",
    permissionCode: "CONSULTORES",
    icon: Users,
    description: "Cadastro, senioridade e disponibilidade dos consultores.",
  },
  {
    label: "Skills",
    href: "/app/skills",
    permissionCode: "SKILLS",
    icon: GraduationCap,
    description: "Matriz de competências técnicas e comportamentais.",
  },
  {
    // Talentos (Onda 0): catálogo de skills, perfis de competência e matriz de
    // gap. Visível a papéis de gestão/talentos; a escrita é enforced no servidor
    // (COMPETENCY_WRITE_ROLES = ADMIN/PEOPLE). Discoverability, não a fronteira.
    label: "Competências",
    href: "/app/competencias",
    permissionCode: "COMPETENCIAS",
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
    permissionCode: "DISPONIBILIDADE",
    icon: CalendarRange,
    description: "Heatmap de capacidade do time por consultor e semana.",
    // EP-M09: CONSULTANT removido do fallback de papel (o matrix já barra); a
    // navegação restrita do Consultor não inclui Disponibilidade.
    requiredRoles: [
      "ADMIN",
      "PEOPLE",
      "AREA_MANAGER",
      "PROJECT_MANAGER",
      "SALES",
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
    permissionCode: "ALOCACAO_IA",
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
    permissionCode: "RISCO_PROJETOS",
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
    permissionCode: "SCORE_CONSULTOR",
    icon: Trophy,
    description: "Score 0–100 do consultor por avaliações, horas, certificações, feedback e realização, com breakdown transparente.",
    // EP-M09: CONSULTANT removido do fallback de papel (o matrix já barra); a
    // navegação restrita do Consultor não inclui Score.
    requiredRoles: ["ADMIN", "PEOPLE", "AREA_MANAGER", "FINANCE"],
  },
  {
    // Feedback Contínuo (Talentos, Prioridade 1 — EP15): timeline + registro de
    // feedback ancorado a projeto/cliente real. Visível a gestão + CONSULTANT
    // (que só vê os próprios SHARED); a escrita é enforced no servidor
    // (FEEDBACK_WRITE_ROLES). Discoverability, não a fronteira de segurança.
    label: "Feedback",
    href: "/app/feedback",
    permissionCode: "FEEDBACK",
    icon: MessageSquareHeart,
    description: "Feedback contínuo por consultor, ancorado em projetos e clientes.",
    // EP-M09: CONSULTANT removido do fallback de papel (o matrix já barra); a
    // navegação restrita do Consultor não inclui Feedback.
    requiredRoles: [
      "ADMIN",
      "PEOPLE",
      "AREA_MANAGER",
      "PROJECT_MANAGER",
    ],
  },
  // Checkpoint / 1-on-1 (Pessoas, Melhoria #4): registro de acompanhamento do
  // consultor. SÓ GESTOR registra; o 1-on-1 nasce PRIVATE (o consultor avaliado
  // não vê), o CHECKPOINT é o ponto semanal por projeto. Visível a gestão +
  // CONSULTANT (que só vê os próprios SHARED, sem transcrição/insights crus); a
  // escrita é enforced no servidor (permissão CHECKPOINT). Atrás da feature flag
  // NEXT_PUBLIC_FEATURE_CHECKPOINT: quando off, o item some e a rota não é
  // exposta. O spread condicional preserva o tipo NavItemDef[] (como o Feed).
  ...(isCheckpointEnabled()
    ? [
        {
          label: "Checkpoints",
          href: "/app/checkpoints",
          permissionCode: "CHECKPOINT",
          icon: Headset,
          description:
            "1-on-1 e checkpoints por consultor; o consultor só vê o que for compartilhado.",
          requiredRoles: [
            "ADMIN",
            "PEOPLE",
            "AREA_MANAGER",
            "PROJECT_MANAGER",
            "CONSULTANT",
          ],
        } satisfies NavItemDef,
      ]
    : []),
  {
    // Avaliação de Desempenho (Talentos, Prioridade 1 — EP16): ciclos 90/180/360,
    // resposta por competência, resultado (radar/gap) e evolução histórica.
    // CONSULTANT vê o PRÓPRIO resultado (após fechamento) e responde só as
    // próprias avaliações; a config de ciclo é enforced no servidor
    // (EVALUATION_MANAGE_ROLES). Discoverability, não a fronteira de segurança.
    label: "Avaliações",
    href: "/app/avaliacoes",
    permissionCode: "AVALIACOES",
    icon: Gauge,
    description: "Ciclos 90/180/360, radar de competências, gap e evolução.",
    // EP-M09: CONSULTANT removido do fallback de papel (o matrix já barra); a
    // navegação restrita do Consultor não inclui Avaliações.
    requiredRoles: [
      "ADMIN",
      "PEOPLE",
      "AREA_MANAGER",
      "PROJECT_MANAGER",
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
    permissionCode: "PDI",
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
    permissionCode: "CLIMA",
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
    permissionCode: "METAS",
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
    // JumpAcademy: portal EXTERNO de trilhas e cursos (app separado, mesmo
    // tenant Entra ID) — abre em nova aba. A visibilidade continua governada
    // pela matriz via UNIVERSIDADE (discoverability, não a fronteira). O módulo
    // interno legado permanece em /app/universidade, apenas sem entrada no menu.
    // URL em config (appConfig.academyUrl) para ficar fácil de renomear.
    label: "JumpAcademy",
    href: appConfig.academyUrl,
    external: true,
    permissionCode: "UNIVERSIDADE",
    icon: BookOpen,
    description: "Trilhas e cursos no portal JumpAcademy (abre em nova aba).",
  },
  {
    label: "Certificados",
    href: "/app/certificados",
    permissionCode: "CERTIFICADOS",
    icon: Award,
    description: "Certificações, validade e alertas de vencimento.",
  },
  // Feed social interno (Melhoria #5): mural interno com posts, comentários,
  // reações e anexos. Visível a todos (permissão FEED); a moderação e o pin são
  // restritos a ADMIN/PEOPLE no servidor. Atrás da feature flag
  // NEXT_PUBLIC_FEATURE_FEED: quando off, o item some e a rota não é exposta.
  // O spread condicional preserva o tipo NavItemDef[] sem item desligado.
  ...(isFeedEnabled()
    ? [
        {
          label: "Feed",
          href: "/app/feed",
          permissionCode: "FEED",
          icon: MessagesSquare,
          description:
            "Mural interno da Jump: posts, comentários, reações e anexos.",
        } satisfies NavItemDef,
      ]
    : []),
  {
    label: "Aprovações",
    href: "/app/aprovacoes",
    permissionCode: "APROVACOES",
    icon: ClipboardCheck,
    description: "Fluxo de aprovação e reprovação de horas.",
  },
  {
    // Fechamento Operacional para o DP: por mês, marca que toda a equipe do
    // projeto lançou e teve as horas aprovadas, notificando o DP. Visível à
    // gestão + FINANCE/PEOPLE; a marcação é enforced no servidor
    // (OPERATION_CLOSING_WRITE_ROLES). Discoverability, não a fronteira.
    label: "Fechamento Operacional",
    href: "/app/operacao/fechamento",
    permissionCode: "OPERACAO_FECHAMENTO",
    icon: CalendarCheck,
    description:
      "Fechamento de horas do mês por projeto para o Departamento Pessoal.",
    requiredRoles: ["ADMIN", "AREA_MANAGER", "PROJECT_MANAGER", "FINANCE", "PEOPLE"],
  },
  {
    label: "Relatórios",
    href: "/app/relatorios",
    permissionCode: "RELATORIOS",
    icon: BarChart3,
    description: "Relatórios de horas, despesas e consolidado, com exportação.",
  },
  {
    label: "Financeiro",
    href: "/app/financeiro",
    permissionCode: "FINANCEIRO",
    icon: Wallet,
    description: "Horas aprovadas, valor hora e fechamento mensal.",
  },
  {
    label: "Cobrança de projetos",
    href: "/app/financeiro/projetos",
    permissionCode: "FINANCEIRO_COBRANCA",
    icon: ReceiptText,
    description: "Regra de cobrança por projeto (motor parametrizável).",
  },
  {
    label: "Pagamentos",
    href: "/app/pagamentos",
    permissionCode: "PAGAMENTOS",
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
    permissionCode: "ADMIN_ACESSOS",
    icon: ShieldCheck,
    description:
      "Convites, grupos de acesso (perfis) e bloqueio de usuários.",
    requiredRoles: ["ADMIN"],
  },
  {
    label: "Matriz de Permissões",
    href: "/app/admin/permissoes",
    permissionCode: "CONFIGURACOES_PERMISSOES",
    icon: KeyRound,
    description:
      "Configura, por grupo de acesso, o que cada funcionalidade permite (ver, criar, editar, excluir).",
    requiredRoles: ["ADMIN"],
  },
  {
    label: "Regras de Notificação",
    href: "/app/admin/notificacoes",
    permissionCode: "CONFIGURACOES_NOTIFICACOES",
    icon: BellRing,
    description:
      "Define, por evento, quem é notificado e por qual canal (e-mail ou Teams).",
    requiredRoles: ["ADMIN"],
  },
  {
    // Calendário de feriados (Onda A-ext). Cadastro com aplicabilidade por
    // projeto: sem vínculo = global; com vínculo = só os projetos. Acesso 100%
    // governado pela matriz (CONFIGURACOES_FERIADOS): visibilidade + rota por
    // `view`, escrita por create/edit/delete no servidor. `requiredRoles` abaixo
    // é apenas o fallback legado para itens SEM permissionCode (aqui ignorado).
    label: "Feriados",
    href: "/app/admin/feriados",
    permissionCode: "CONFIGURACOES_FERIADOS",
    icon: CalendarDays,
    description:
      "Calendário de feriados nacionais, estaduais e municipais, com aplicabilidade por projeto.",
    requiredRoles: ["ADMIN", "PEOPLE"],
  },
  {
    // Ordem do menu (P28). Reordena o menu principal de forma GLOBAL (por
    // organização). Gate SÓ por papel (ADMIN), sem permissionCode: evita semear
    // um novo código na matriz; a página e as server actions reforçam
    // requireRole(["ADMIN"]) no servidor. Não é reordenável a si própria (é da
    // navegação de Administração, não da principal).
    label: "Ordem do Menu",
    href: "/app/admin/menu",
    icon: ListOrdered,
    description:
      "Reordena os itens do menu principal (ordem global da organização).",
    requiredRoles: ["ADMIN"],
  },
];

/**
 * Hide navigation items whose `permissionCode` belongs to a disabled module
 * (EP-M07). Items without a code are always kept. Preserves the `NavItemDef[]`
 * type. Reabilitar = remover o code de `disabled-modules.ts`.
 */
function withoutDisabledModules(items: NavItemDef[]): NavItemDef[] {
  return items.filter(
    (item) => !item.permissionCode || !isModuleDisabled(item.permissionCode),
  );
}

/**
 * Primary operational navigation, com os módulos desligados (EP-M07) já
 * filtrados. Esta é a lista consumida pela sidebar e pelo layout.
 */
export const primaryNavigation: NavItemDef[] =
  withoutDisabledModules(primaryNavigationRaw);

/**
 * Reorder primary navigation items according to a persisted `href → position`
 * map (P28). Items present in the map are sorted by ascending position; items
 * WITHOUT a saved position keep the default catalog order and are appended
 * after the ordered ones. Pure and stable — the same input always yields the
 * same output — so it is safe on the server (layout) and the client (sidebar).
 */
export function applyNavOrder<T extends { href: string }>(
  items: T[],
  order: Readonly<Record<string, number>>,
): T[] {
  const positioned: Array<{ item: T; index: number }> = [];
  const rest: Array<{ item: T; index: number }> = [];
  items.forEach((item, index) => {
    if (Object.prototype.hasOwnProperty.call(order, item.href)) {
      positioned.push({ item, index });
    } else {
      rest.push({ item, index });
    }
  });
  positioned.sort((a, b) => {
    const byOrder = order[a.item.href] - order[b.item.href];
    // Ties (or equal positions) fall back to the catalog order for stability.
    return byOrder !== 0 ? byOrder : a.index - b.index;
  });
  return [...positioned, ...rest].map((entry) => entry.item);
}

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
 * Whether a navigation item is visible under the permission matrix. Items
 * WITHOUT a `permissionCode` are always visible (no matrix gate); items WITH
 * one are visible only if their code is in the viewable set. Combined with the
 * legacy `canSeeNavItem` role gate during the migration.
 */
export function canSeeNavItemByMatrix(
  item: NavItemDef,
  viewableCodes: ReadonlySet<string>,
): boolean {
  if (!item.permissionCode) return true;
  return viewableCodes.has(item.permissionCode);
}

/** All distinct permission codes referenced by the navigation. */
export function navPermissionCodes(): string[] {
  const codes = new Set<string>();
  for (const item of [...primaryNavigation, ...adminNavigation]) {
    if (item.permissionCode) codes.add(item.permissionCode);
  }
  return [...codes];
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
