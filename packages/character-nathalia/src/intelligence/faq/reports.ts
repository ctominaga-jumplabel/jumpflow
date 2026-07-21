/** FAQ — Relatórios. */
import type { NathaliaFaqEntry } from "./types";

export const reportsFaq: NathaliaFaqEntry[] = [
  {
    id: "faq-reports-which",
    question: "Quais relatórios existem?",
    variations: [
      "que relatorios tem",
      "tipos de relatorio",
      "relatorios disponiveis",
    ],
    answer:
      "Há relatórios de horas, de despesas e um consolidado. Você pode filtrar por período e exportar.",
    context: "reports",
    action: "navigateToReports",
    relatedDocId: "reports-which-exist",
  },
  {
    id: "faq-reports-export",
    question: "Como gerar/exportar um relatório?",
    variations: [
      "como exportar relatorio",
      "como gerar relatorio",
      "baixar relatorio",
      "exportar dados",
    ],
    answer:
      "Abra o relatório desejado, ajuste o filtro de período e use a opção de exportar. O conteúdo respeita o alcance do seu perfil.",
    context: "reports",
    action: "navigateToReports",
    relatedDocId: "reports-which-exist",
  },
  {
    id: "faq-reports-scope",
    question: "Por que vejo só alguns dados?",
    variations: [
      "porque vejo poucos dados",
      "escopo dos dados",
      "alcance do relatorio",
    ],
    answer:
      "O alcance segue o seu perfil: consultores veem os próprios dados; gestores veem os projetos sob sua responsabilidade.",
    context: "reports",
    relatedDocId: "reports-scope",
  },
];
