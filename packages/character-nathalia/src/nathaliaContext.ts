/**
 * Context Engine for Nathal.IA.
 *
 * Resolves the current application area from the route (pt-BR paths from the
 * JumpFlow app shell) into a stable `NathaliaContextKey`, and holds the
 * per-context configuration: greeting, default visual state, quick suggestions
 * and the actions conceptually available there (gated later by RBAC).
 *
 * Pure module — safe to unit test and to import on the server/edge.
 */
import type {
  NathaliaContextDefinition,
  NathaliaContextKey,
} from "./nathaliaTypes";

interface ContextRoute {
  /** Route prefix (matched as exact or `startsWith(prefix + "/")`). */
  prefix: string;
  context: NathaliaContextKey;
}

/**
 * Route → context map. Order matters: more specific prefixes first.
 * Routes mirror `apps/web/src/lib/navigation.ts`.
 */
const contextRoutes: ContextRoute[] = [
  { prefix: "/app/horas", context: "hours" },
  { prefix: "/app/despesas", context: "expenses" },
  { prefix: "/app/projetos", context: "projects" },
  { prefix: "/app/clientes", context: "clients" },
  { prefix: "/app/consultores", context: "consultants" },
  { prefix: "/app/aprovacoes", context: "approvals" },
  { prefix: "/app/relatorios", context: "reports" },
  { prefix: "/app/financeiro", context: "finance" },
  { prefix: "/app/pagamentos", context: "finance" },
  { prefix: "/app/admin", context: "settings" },
  { prefix: "/app/dashboard", context: "dashboard" },
  { prefix: "/app", context: "general" },
];

/** Resolve the context key for a pathname (defaults to `general`). */
export function contextForPath(pathname: string | null | undefined): NathaliaContextKey {
  if (!pathname) return "general";
  const match = contextRoutes.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  );
  return match ? match.context : "general";
}

/** Per-context configuration. */
export const nathaliaContexts: Record<
  NathaliaContextKey,
  NathaliaContextDefinition
> = {
  general: {
    key: "general",
    label: "Geral",
    greeting:
      "Oi! Sou a Nathal.IA. Posso te ajudar a navegar pelo JumpFlow e entender cada tela.",
    defaultState: "idle",
    suggestions: [
      {
        id: "general-hours",
        label: "Lançar horas",
        mockReply: "Vamos para a tela de Horas. 👇",
        action: "navigateToHours",
      },
      {
        id: "general-approvals",
        label: "Ver aprovações",
        mockReply: "Abrindo a fila de Aprovações. 👇",
        action: "navigateToApprovals",
      },
      {
        id: "general-projects",
        label: "Abrir projetos",
        mockReply: "Vamos para Projetos. 👇",
        action: "navigateToProjects",
      },
    ],
    availableActions: [
      "navigateToHours",
      "navigateToApprovals",
      "navigateToProjects",
      "showPendingMock",
    ],
  },

  dashboard: {
    key: "dashboard",
    label: "Dashboard",
    greeting:
      "Este é o seu panorama. Posso explicar os indicadores e te levar para onde a ação acontece.",
    defaultState: "explaining",
    suggestions: [
      {
        id: "dash-explain",
        label: "O que os cards mostram?",
        mockReply:
          "Os cards resumem pendências, alocação e fechamentos. Cada um é um atalho para a tela completa.",
      },
      {
        id: "dash-hours",
        label: "Ver minhas horas",
        mockReply: "Vamos para Horas. 👇",
        action: "navigateToHours",
      },
    ],
    availableActions: ["navigateToHours", "navigateToApprovals", "navigateToReports"],
  },

  hours: {
    key: "hours",
    label: "Horas",
    greeting:
      "Posso te ajudar a lançar, revisar, enviar ou entender suas horas.",
    defaultState: "explaining",
    suggestions: [
      {
        id: "hours-how",
        label: "Como lançar horas?",
        mockReply:
          "Em 3 passos:\n• escolha o período\n• selecione projeto e atividade\n• informe as horas por dia e salve",
      },
      {
        id: "hours-status",
        label: "O que significa cada status?",
        mockReply:
          "• Rascunho: ainda editável\n• Enviado: aguardando aprovação\n• Aprovado: validado\n• Reprovado: ajuste e reenvie",
      },
      {
        id: "hours-submit",
        label: "Como enviar apontamentos?",
        mockReply:
          "Com o período preenchido, toque em enviar para aprovação. Depois ele fica bloqueado até a análise.",
      },
      {
        id: "hours-pending",
        label: "Tenho horas pendentes?",
        mockReply:
          "Mostro um exemplo por enquanto. Em breve confiro seus lançamentos em aberto de verdade.",
        action: "showPendingMock",
      },
      {
        id: "hours-tour",
        label: "Me mostre a tela",
        mockReply: "Encontrei alguns pontos importantes para revisar.",
        action: "startHoursTour",
      },
    ],
    availableActions: [
      "navigateToHours",
      "showPendingMock",
      "startHoursTour",
      "highlightElement",
    ],
  },

  expenses: {
    key: "expenses",
    label: "Despesas",
    greeting:
      "Posso te ajudar a lançar despesas, anexar comprovantes e acompanhar reembolsos.",
    defaultState: "explaining",
    suggestions: [
      {
        id: "exp-how",
        label: "Como lançar uma despesa?",
        mockReply:
          "Informe data, categoria e valor, anexe o comprovante e envie para aprovação.",
      },
      {
        id: "exp-status",
        label: "Status do reembolso?",
        mockReply:
          "Mostro um exemplo por enquanto. Em breve acompanho o status real do reembolso.",
        action: "showPendingMock",
      },
    ],
    availableActions: ["navigateToExpenses", "showPendingMock"],
  },

  projects: {
    key: "projects",
    label: "Projetos",
    greeting:
      "Posso te ajudar a entender projetos, responsáveis, clientes e alocações.",
    defaultState: "explaining",
    suggestions: [
      {
        id: "proj-status",
        label: "Explicar status",
        mockReply:
          "O status mostra a situação do projeto (ativo, pausado, encerrado) e orienta horas e alocações.",
      },
      {
        id: "proj-active",
        label: "Projetos ativos",
        mockReply:
          "São os projetos em andamento, abertos para lançamento de horas. Abra um para ver vínculos e indicadores.",
      },
      {
        id: "proj-create",
        label: "Como criar projeto?",
        mockReply:
          "Use o botão de novo projeto, informe cliente e responsável e salve. A criação pode exigir perfil de gestão.",
      },
    ],
    availableActions: ["navigateToProjects", "highlightElement"],
  },

  clients: {
    key: "clients",
    label: "Clientes",
    greeting:
      "Posso explicar os cadastros de clientes, dados fiscais e tipos de cobrança.",
    defaultState: "explaining",
    suggestions: [
      {
        id: "cli-what",
        label: "O que tem nesta tela?",
        mockReply:
          "Cadastro de clientes com CNPJ, dados fiscais e regras de cobrança. Campos financeiros podem ficar ocultos conforme seu perfil.",
      },
    ],
    availableActions: ["highlightElement"],
  },

  consultants: {
    key: "consultants",
    label: "Consultores",
    greeting:
      "Posso te orientar sobre cadastro, senioridade e disponibilidade dos consultores.",
    defaultState: "explaining",
    suggestions: [
      {
        id: "cons-what",
        label: "O que vejo aqui?",
        mockReply:
          "O diretório de consultores. Escritas sensíveis (valores, dados pessoais) são restritas por perfil.",
      },
    ],
    availableActions: ["highlightElement"],
  },

  approvals: {
    key: "approvals",
    label: "Aprovações",
    greeting:
      "Posso te ajudar a entender a fila de aprovação de horas e despesas.",
    defaultState: "explaining",
    suggestions: [
      {
        id: "appr-how",
        label: "Como aprovar?",
        mockReply:
          "Abra um item enviado, revise as horas e aprove — ou reprove com um comentário para ajuste.",
      },
      {
        id: "appr-pending",
        label: "O que está pendente?",
        mockReply:
          "A fila lista os itens enviados aguardando análise. Mostro um exemplo até ler seus dados reais.",
        action: "showPendingMock",
      },
      {
        id: "appr-flow",
        label: "Explicar fluxo",
        mockReply:
          "• Consultor envia\n• Gestor analisa\n• Aprovado ou reprovado\nRegras podem aprovar itens automáticos.",
      },
      {
        id: "appr-tour",
        label: "Me mostre a fila",
        mockReply: "Encontrei alguns pontos importantes para revisar.",
        action: "startApprovalsTour",
      },
    ],
    availableActions: [
      "navigateToApprovals",
      "startApprovalsTour",
      "showPendingMock",
      "highlightElement",
    ],
  },

  reports: {
    key: "reports",
    label: "Relatórios",
    greeting:
      "Posso te ajudar a entender e exportar relatórios de horas, despesas e consolidado.",
    defaultState: "explaining",
    suggestions: [
      {
        id: "rep-generate",
        label: "Como gerar relatório?",
        mockReply:
          "Escolha o tipo (horas, despesas ou consolidado), ajuste os filtros e gere o relatório.",
      },
      {
        id: "rep-export",
        label: "Exportações",
        mockReply:
          "Depois de gerar, exporte em planilha para compartilhar ou conferir fora do JumpFlow.",
      },
      {
        id: "rep-filters",
        label: "Filtros",
        mockReply:
          "Filtre por período, projeto ou pessoa. O alcance segue o seu perfil de acesso.",
      },
    ],
    availableActions: ["navigateToReports", "highlightElement"],
  },

  finance: {
    key: "finance",
    label: "Financeiro",
    greeting:
      "Posso explicar conceitos do módulo financeiro — sem mostrar valores sensíveis.",
    defaultState: "explaining",
    suggestions: [
      {
        id: "fin-what",
        label: "O que é o fechamento?",
        mockReply:
          "O fechamento consolida horas aprovadas e valores do período. Os valores em si seguem as regras de acesso financeiro.",
      },
    ],
    availableActions: ["highlightElement"],
  },

  settings: {
    key: "settings",
    label: "Acessos e administração",
    greeting:
      "Posso explicar a administração de acessos, convites e perfis.",
    defaultState: "explaining",
    suggestions: [
      {
        id: "set-what",
        label: "O que dá para fazer aqui?",
        mockReply:
          "Convidar pessoas, definir grupos de acesso (perfis) e bloquear usuários. Esta área é restrita a administradores.",
      },
    ],
    availableActions: ["highlightElement"],
  },
};

/** Lookup helper with a safe fallback to `general`. */
export function getNathaliaContext(
  key: NathaliaContextKey,
): NathaliaContextDefinition {
  return nathaliaContexts[key] ?? nathaliaContexts.general;
}
