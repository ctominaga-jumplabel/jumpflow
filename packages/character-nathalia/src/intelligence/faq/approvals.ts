/** FAQ — Aprovações. Restricted to approver/management roles. */
import type { NathaliaFaqEntry } from "./types";

const APPROVAL_ROLES = ["ADMIN", "AREA_MANAGER", "PROJECT_MANAGER", "FINANCE"];

export const approvalsFaq: NathaliaFaqEntry[] = [
  {
    id: "faq-approvals-queue",
    question: "Como funciona a fila de aprovação?",
    variations: [
      "como aprovar horas",
      "como aprovar despesas",
      "como funciona aprovacao",
      "fila de aprovacao",
    ],
    answer:
      "Os itens enviados aparecem na fila para análise. Você revisa e aprova ou reprova com um comentário. Reprovar devolve o item para ajuste.",
    context: "approvals",
    roles: APPROVAL_ROLES,
    action: "startApprovalsTour",
    relatedDocId: "approvals-how-queue-works",
  },
  {
    id: "faq-approvals-auto",
    question: "O que é aprovação automática?",
    variations: [
      "aprovacao automatica",
      "regras de aprovacao",
      "automatizar aprovacao",
    ],
    answer:
      "São regras que aprovam itens dentro de critérios definidos, reduzindo trabalho manual. A configuração é restrita à gestão e fica registrada em auditoria.",
    context: "approvals",
    roles: APPROVAL_ROLES,
    relatedDocId: "approvals-auto",
  },
];
