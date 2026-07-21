/** FAQ — Projetos. */
import type { NathaliaFaqEntry } from "./types";

export const projectsFaq: NathaliaFaqEntry[] = [
  {
    id: "faq-projects-what",
    question: "O que vejo na tela de Projetos?",
    variations: [
      "o que tem em projetos",
      "para que serve a tela de projetos",
      "lista de projetos",
    ],
    answer:
      "A lista de projetos com cliente, responsável e situação. Abra um projeto para ver detalhes, alocações e vínculos.",
    context: "projects",
    action: "navigateToProjects",
    relatedDocId: "projects-overview",
  },
  {
    id: "faq-projects-allocation",
    question: "O que é alocação?",
    variations: [
      "o que significa alocacao",
      "o que e alocar consultor",
      "vinculo de projeto",
    ],
    answer:
      "Alocação é o vínculo de um consultor a um projeto. É a base para lançar horas e para os valores por hora. Mudanças sensíveis pedem perfil adequado.",
    context: "projects",
    relatedDocId: "projects-allocation",
  },
  {
    id: "faq-projects-mine",
    question: "Quais projetos estão vinculados a mim?",
    variations: [
      "meus projetos",
      "em quais projetos estou alocado",
      "projetos que participo",
    ],
    answer:
      "Seus projetos são aqueles em que você tem uma alocação ativa. É por esse vínculo que você consegue lançar horas para o projeto.",
    context: "projects",
    relatedDocId: "projects-my-projects",
  },
];
