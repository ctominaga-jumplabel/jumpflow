/**
 * Internal "tools" Nathal.IA can invoke.
 *
 * Everything here is mocked/navigational in this phase — no sensitive data, no
 * writes, no LLM. The definitions describe the contract; `createNathaliaActions`
 * binds them to a host runtime (router push, element highlight, store setters)
 * so the same vocabulary can later be exposed to a real model behind RBAC.
 */
import type {
  NathaliaActionDefinition,
  NathaliaActionId,
  NathaliaStateKey,
} from "./nathaliaTypes";

/** Static metadata for every action (used by RBAC + future tool schemas). */
export const nathaliaActions: Record<
  NathaliaActionId,
  NathaliaActionDefinition
> = {
  navigateToHours: {
    id: "navigateToHours",
    label: "Ir para Horas",
    description: "Navega para a tela de lançamento de horas.",
    sensitivity: "navigation",
    requiresConfirmation: false,
  },
  navigateToProjects: {
    id: "navigateToProjects",
    label: "Ir para Projetos",
    description: "Navega para a tela de projetos.",
    sensitivity: "navigation",
    requiresConfirmation: false,
  },
  navigateToApprovals: {
    id: "navigateToApprovals",
    label: "Ir para Aprovações",
    description: "Navega para a fila de aprovações.",
    sensitivity: "navigation",
    requiresConfirmation: false,
  },
  navigateToReports: {
    id: "navigateToReports",
    label: "Ir para Relatórios",
    description: "Navega para a tela de relatórios.",
    sensitivity: "navigation",
    requiresConfirmation: false,
  },
  navigateToExpenses: {
    id: "navigateToExpenses",
    label: "Ir para Despesas",
    description: "Navega para a tela de despesas.",
    sensitivity: "navigation",
    requiresConfirmation: false,
  },
  highlightElement: {
    id: "highlightElement",
    label: "Destacar elemento",
    description: "Realça visualmente um elemento da tela por um instante.",
    sensitivity: "safe",
    requiresConfirmation: false,
  },
  startHoursTour: {
    id: "startHoursTour",
    label: "Tour de Horas",
    description: "Inicia o tour guiado da tela de horas.",
    sensitivity: "safe",
    requiresConfirmation: false,
  },
  startApprovalsTour: {
    id: "startApprovalsTour",
    label: "Tour de Aprovações",
    description: "Inicia o tour guiado da fila de aprovações.",
    sensitivity: "safe",
    requiresConfirmation: false,
  },
  showPendingMock: {
    id: "showPendingMock",
    label: "Mostrar pendências (exemplo)",
    description:
      "Exibe um exemplo de pendências. Não consulta dados reais nesta fase.",
    sensitivity: "safe",
    requiresConfirmation: false,
  },
};

/** Routes used by the navigation actions (pt-BR, mirrors the app shell). */
export const nathaliaRoutes = {
  hours: "/app/horas",
  projects: "/app/projetos",
  approvals: "/app/aprovacoes",
  reports: "/app/relatorios",
  expenses: "/app/despesas",
} as const;

/**
 * Host hooks the actions need. The provider supplies these so the package never
 * imports the router directly (keeps it testable and portable).
 */
export interface NathaliaActionRuntime {
  /** Navigate to a path (e.g. Next router.push). */
  navigate: (path: string) => void;
  /** Briefly highlight an element by id. Returns true if found. */
  highlight: (elementId: string) => boolean;
  /** Start a named tour. */
  startTour: (tourId: string) => void;
  /** Push a message into the conversation as Nathal.IA. */
  say: (text: string, state?: NathaliaStateKey) => void;
  /** Set the current visual state. */
  setState: (state: NathaliaStateKey) => void;
}

export interface NathaliaActionContext {
  /** Optional element id for `highlightElement`. */
  elementId?: string;
}

/** The bound, callable action map. */
export type NathaliaActionRunner = (
  ctx?: NathaliaActionContext,
) => void;

/**
 * Bind action definitions to a runtime. Each returned function is safe to call
 * directly (e.g. from a suggestion chip) and performs only mocked/navigational
 * work in this phase.
 */
export function createNathaliaActions(
  runtime: NathaliaActionRuntime,
): Record<NathaliaActionId, NathaliaActionRunner> {
  return {
    navigateToHours: () => runtime.navigate(nathaliaRoutes.hours),
    navigateToProjects: () => runtime.navigate(nathaliaRoutes.projects),
    navigateToApprovals: () => runtime.navigate(nathaliaRoutes.approvals),
    navigateToReports: () => runtime.navigate(nathaliaRoutes.reports),
    navigateToExpenses: () => runtime.navigate(nathaliaRoutes.expenses),
    highlightElement: (ctx) => {
      if (!ctx?.elementId) return;
      const found = runtime.highlight(ctx.elementId);
      runtime.setState(found ? "pointing" : "warning");
    },
    // Navigate to the screen first so the tour's anchors exist, then start it.
    startHoursTour: () => {
      runtime.navigate(nathaliaRoutes.hours);
      runtime.startTour("hours");
    },
    startApprovalsTour: () => {
      runtime.navigate(nathaliaRoutes.approvals);
      runtime.startTour("approvals");
    },
    showPendingMock: () => {
      runtime.say(
        "Exemplo: você tem 1 período de horas em rascunho e 2 itens aguardando aprovação. (dados fictícios)",
        "warning",
      );
    },
  };
}
