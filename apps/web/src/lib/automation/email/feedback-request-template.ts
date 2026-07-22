/**
 * Pedido de feedback ao cliente (P29) — client-facing → veste a marca da empresa
 * (Jump), como os demais e-mails que saem para o cliente (apuração, pré-fatura).
 *
 * O e-mail apenas SOLICITA o retorno do cliente sobre o trabalho do consultor;
 * o feedback em si volta por resposta ao e-mail e é cadastrado depois na
 * plataforma (Feedback source=CLIENT). NÃO expõe dados internos/financeiros —
 * apenas nome do consultor, projeto (quando houver) e uma mensagem curta e
 * opcional do solicitante.
 */
import { appConfig } from "@/config/app";
import { callout, paragraph, keyValueList, renderEmail, type EmailBlock } from "./layout";
import type { BuiltEmail } from "./templates";

const company = () => appConfig.company.name;

export interface FeedbackRequestEmailInput {
  /** Nome do contato do cliente, quando conhecido. */
  contactName?: string;
  /** Nome do consultor avaliado (não sensível). */
  consultantName: string;
  /** Projeto ancorado, quando houver. */
  projectName?: string;
  /** Nome do cliente, quando houver. */
  clientName?: string;
  /** Quem solicitou (aparece na assinatura do corpo, opcional). */
  requesterName?: string;
  /** Mensagem curta opcional do solicitante ao cliente. */
  note?: string;
}

export function buildFeedbackRequestEmail(
  input: FeedbackRequestEmailInput,
): BuiltEmail {
  const anchor = input.projectName
    ? `no projeto ${input.projectName}`
    : "no trabalho realizado";

  const blocks: EmailBlock[] = [
    paragraph(
      input.contactName ? `Prezado(a) ${input.contactName},` : "Prezado(a),",
    ),
    paragraph(
      `Gostaríamos de ouvir a sua percepção sobre o trabalho de ${input.consultantName} ${anchor}. Seu retorno nos ajuda a reconhecer entregas e a evoluir continuamente.`,
    ),
    keyValueList([
      { label: "Consultor(a)", value: input.consultantName },
      ...(input.projectName
        ? [{ label: "Projeto", value: input.projectName }]
        : []),
      ...(input.clientName
        ? [{ label: "Cliente", value: input.clientName }]
        : []),
    ]),
  ];

  if (input.note && input.note.trim() !== "") {
    blocks.push(callout(input.note.trim(), "neutral"));
  }

  blocks.push(
    paragraph(
      `Basta responder a este e-mail com os seus comentários — pode ser objetivo. Agradecemos desde já pela colaboração.`,
    ),
  );

  const { html, text } = renderEmail({
    brand: "company",
    preheader: `Feedback sobre ${input.consultantName}${
      input.projectName ? ` — ${input.projectName}` : ""
    }`,
    title: "Pedido de feedback",
    blocks,
    signoff: input.requesterName
      ? `Atenciosamente,\n${input.requesterName}\nEquipe ${company()}`
      : `Atenciosamente,\nEquipe ${company()}`,
  });

  return {
    subject: `${company()} · Seu feedback sobre ${input.consultantName}`,
    html,
    text,
  };
}
