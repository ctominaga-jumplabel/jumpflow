/** FAQ — Horas. Curated Q&A about time tracking (no live data). */
import type { NathaliaFaqEntry } from "./types";

export const hoursFaq: NathaliaFaqEntry[] = [
  {
    id: "faq-hours-log",
    question: "Como lançar horas?",
    variations: [
      "como registrar horas",
      "como apontar horas",
      "como preencher horas",
      "lancar horas",
      "registrar tempo",
    ],
    answer:
      "Escolha o período (semana), selecione o projeto e a atividade, informe as horas por dia e salve. O lançamento começa como Rascunho e fica editável até você enviar para aprovação.",
    context: "hours",
    action: "startHoursTour",
    relatedDocId: "hours-how-to-log",
  },
  {
    id: "faq-hours-submit",
    question: "Como enviar horas para aprovação?",
    variations: [
      "como submeter horas",
      "como mandar horas para aprovar",
      "enviar horas",
      "submeter periodo",
    ],
    answer:
      "Com o período preenchido, use o botão de enviar para aprovação. Depois de enviado, ele fica bloqueado para edição até o aprovador analisar.",
    context: "hours",
    relatedDocId: "hours-how-to-submit",
  },
  {
    id: "faq-hours-status",
    question: "O que significa cada status das horas?",
    variations: [
      "status das horas",
      "o que e rascunho enviado aprovado reprovado",
      "significado dos status",
    ],
    answer:
      "Rascunho = ainda editável; Enviado = aguardando aprovação; Aprovado = validado; Reprovado = precisa de ajuste e reenvio.",
    context: "hours",
    relatedDocId: "hours-status-meaning",
  },
  {
    id: "faq-hours-rejected",
    question: "Minhas horas foram reprovadas, e agora?",
    variations: [
      "como corrigir horas reprovadas",
      "horas reprovadas",
      "reenviar horas",
      "ajustar horas",
    ],
    answer:
      "Um período reprovado volta a ficar editável. Ajuste os lançamentos conforme o comentário do aprovador e envie novamente para aprovação.",
    context: "hours",
    relatedDocId: "hours-edit-rejected",
  },
  {
    id: "faq-hours-pending",
    question: "Tenho horas pendentes?",
    variations: ["horas em aberto", "pendencias de horas", "o que falta lancar"],
    answer:
      "Posso te levar à tela de Horas para você conferir. Ainda não consulto seus lançamentos reais — isso chega quando a inteligência de dados for ligada.",
    context: "hours",
    action: "navigateToHours",
  },
];
