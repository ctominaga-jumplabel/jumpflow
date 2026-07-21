/**
 * ToolRegistry — the catalogue of things Nathal.IA may invoke (Fase 8).
 *
 * Layered on top of the existing action system: each tool references a
 * `NathaliaActionId`, so binding/execution and RBAC stay in `nathaliaActions.ts`
 * + `nathaliaPermissions.ts`. The registry adds discovery (by id / context),
 * metadata (kind, target context) and an RBAC-aware permission check.
 *
 * SECURITY: no write tools exist. `canRun` defers to `canExecuteAction`, which
 * blocks any `sensitive` tool and would force confirmation if one were enabled.
 */
import { canExecuteAction, type ActionPermission } from "../../nathaliaPermissions";
import type { NathaliaActionId, NathaliaContextKey, NathaliaUser } from "../../nathaliaTypes";
import type { NathaliaTool } from "./types";

/** The default tool catalogue (all safe / navigation / tour). */
export const nathaliaTools: Record<NathaliaActionId, NathaliaTool> = {
  navigateToHours: {
    id: "navigateToHours",
    kind: "navigation",
    label: "Ir para Horas",
    description: "Abre a tela de lançamento de horas.",
    sensitivity: "navigation",
    requiresConfirmation: false,
    targetContext: "hours",
  },
  navigateToProjects: {
    id: "navigateToProjects",
    kind: "navigation",
    label: "Ir para Projetos",
    description: "Abre a tela de projetos.",
    sensitivity: "navigation",
    requiresConfirmation: false,
    targetContext: "projects",
  },
  navigateToApprovals: {
    id: "navigateToApprovals",
    kind: "navigation",
    label: "Ir para Aprovações",
    description: "Abre a fila de aprovações.",
    sensitivity: "navigation",
    requiresConfirmation: false,
    targetContext: "approvals",
  },
  navigateToReports: {
    id: "navigateToReports",
    kind: "navigation",
    label: "Ir para Relatórios",
    description: "Abre a tela de relatórios.",
    sensitivity: "navigation",
    requiresConfirmation: false,
    targetContext: "reports",
  },
  navigateToExpenses: {
    id: "navigateToExpenses",
    kind: "navigation",
    label: "Ir para Despesas",
    description: "Abre a tela de despesas.",
    sensitivity: "navigation",
    requiresConfirmation: false,
    targetContext: "expenses",
  },
  highlightElement: {
    id: "highlightElement",
    kind: "ui",
    label: "Destacar elemento",
    description: "Realça visualmente um elemento da tela por um instante.",
    sensitivity: "safe",
    requiresConfirmation: false,
  },
  startHoursTour: {
    id: "startHoursTour",
    kind: "tour",
    label: "Tour de Horas",
    description: "Inicia o tour guiado da tela de horas.",
    sensitivity: "safe",
    requiresConfirmation: false,
    targetContext: "hours",
  },
  startApprovalsTour: {
    id: "startApprovalsTour",
    kind: "tour",
    label: "Tour de Aprovações",
    description: "Inicia o tour guiado da fila de aprovações.",
    sensitivity: "safe",
    requiresConfirmation: false,
    targetContext: "approvals",
  },
  showPendingMock: {
    id: "showPendingMock",
    kind: "ui",
    label: "Mostrar pendências (exemplo)",
    description: "Exibe um exemplo de pendências (dados fictícios, sem leitura real).",
    sensitivity: "safe",
    requiresConfirmation: false,
  },
};

export class ToolRegistry {
  private readonly tools: Record<NathaliaActionId, NathaliaTool>;

  constructor(tools: Record<NathaliaActionId, NathaliaTool> = nathaliaTools) {
    this.tools = tools;
  }

  /** Look up a tool by id. */
  get(id: NathaliaActionId): NathaliaTool | undefined {
    return this.tools[id];
  }

  /** All tools, stable order. */
  list(): NathaliaTool[] {
    return Object.values(this.tools);
  }

  /** The navigation/tour tool that targets a given context (if any). */
  forContext(context: NathaliaContextKey): NathaliaTool | undefined {
    return this.list().find((t) => t.targetContext === context && t.kind !== "ui");
  }

  /**
   * Whether a user may run a tool. Delegates to the central RBAC gate, so the
   * security posture is identical to direct action execution.
   */
  canRun(user: NathaliaUser | null, id: NathaliaActionId): ActionPermission {
    return canExecuteAction(user, id);
  }
}

/** Shared default registry. */
export const defaultToolRegistry = new ToolRegistry();
