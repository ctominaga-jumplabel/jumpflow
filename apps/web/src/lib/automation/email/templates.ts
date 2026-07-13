/**
 * JumpFlow operational email templates.
 *
 * Each builder is a pure function returning `{ subject, html, text }`, ready to
 * hand to `EmailTransport`. Copy is written in the JumpFlow voice: direct,
 * operational, confident — "uma ferramenta de trabalho diário", never a
 * marketing newsletter (see docs/design-system.md §1).
 *
 * These cover the notification surface of the improvement plan
 * (docs/plano-melhorias-financeiro-operacional.md). Add new templates here so
 * all operational mail stays brand-consistent and centrally maintained.
 */
import { appConfig } from "@/config/app";
import { formatCurrency, formatHours } from "@/lib/format";
import {
  button,
  callout,
  dataTable,
  divider,
  heading,
  kpi,
  keyValueList,
  paragraph,
  renderEmail,
  type EmailBlock,
} from "./layout";

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

const app = () => appConfig.name;
/** Parent company brand — used for client-facing mail (apuração). */
const company = () => appConfig.company.name;

// ---------------------------------------------------------------------------
// Tema 1.1 — Notificação por liberação de horas
// ---------------------------------------------------------------------------
export interface LiberacaoEmailInput {
  recipientName: string;
  projectName: string;
  clientName: string;
  periodLabel: string; // competência mensal, ex: "junho/2026"
  totalHours: number;
  consultantsCount: number;
  exceptions?: string[]; // ex: ["Hora extra: 4h (João)", "Sobreaviso: 2h (Maria)"]
  reviewUrl?: string;
}

export function buildLiberacaoEmail(input: LiberacaoEmailInput): BuiltEmail {
  const blocks: EmailBlock[] = [
    paragraph(`Olá, ${input.recipientName}.`),
    paragraph(
      `As horas do projeto ${input.projectName} (${input.clientName}) referentes à competência de ${input.periodLabel} foram liberadas e estão prontas para a próxima etapa.`,
    ),
    keyValueList([
      { label: "Projeto", value: input.projectName },
      { label: "Cliente", value: input.clientName },
      { label: "Competência", value: input.periodLabel },
      { label: "Total de horas", value: formatHours(input.totalHours) },
      { label: "Consultores", value: String(input.consultantsCount) },
    ]),
  ];

  if (input.exceptions && input.exceptions.length > 0) {
    blocks.push(
      callout(
        `Atenção: esta liberação contém exceções que precisam de conferência.`,
        "warning",
      ),
      dataTable(["Exceção"], input.exceptions.map((e) => [e])),
    );
  }

  if (input.reviewUrl) {
    blocks.push(button("Abrir liberação", input.reviewUrl));
  }

  const { html, text } = renderEmail({
    preheader: `Horas liberadas — ${input.projectName} (${input.periodLabel})`,
    title: "Horas liberadas",
    blocks,
    signoff: `Equipe ${app()}`,
  });

  return {
    subject: `${app()} · Liberação de horas — ${input.projectName} (${input.periodLabel})`,
    html,
    text,
  };
}

// ---------------------------------------------------------------------------
// Tema 1.2 — Apuração ao cliente: totalizador por consultor
// ---------------------------------------------------------------------------
export interface ApuracaoClienteLine {
  consultantName: string;
  hours: number;
  amount?: number; // omitido quando o cliente não recebe valores
}

export interface ApuracaoClienteEmailInput {
  clientContactName: string;
  clientName: string;
  projectName: string;
  competenceLabel: string; // ex: "junho/2026"
  lines: ApuracaoClienteLine[];
  totalHours: number;
  totalAmount?: number;
  showValues?: boolean;
}

export function buildApuracaoClienteEmail(
  input: ApuracaoClienteEmailInput,
): BuiltEmail {
  const showValues = input.showValues ?? input.totalAmount !== undefined;

  const headers = showValues
    ? ["Consultor", "Horas", "Valor"]
    : ["Consultor", "Horas"];
  const rows = input.lines.map((l) =>
    showValues
      ? [l.consultantName, formatHours(l.hours), formatCurrency(l.amount ?? 0)]
      : [l.consultantName, formatHours(l.hours)],
  );
  const alignRight = showValues ? [1, 2] : [1];

  const blocks: EmailBlock[] = [
    paragraph(`Prezado(a) ${input.clientContactName},`),
    paragraph(
      `Segue a apuração de horas do projeto ${input.projectName} referente à competência de ${input.competenceLabel}, detalhada por consultor.`,
    ),
    dataTable(headers, rows, { alignRight }),
    keyValueList([
      { label: "Total de horas", value: formatHours(input.totalHours) },
      ...(showValues && input.totalAmount !== undefined
        ? [{ label: "Total", value: formatCurrency(input.totalAmount) }]
        : []),
    ]),
    paragraph(
      `Em caso de divergência, responda a este e-mail para que possamos revisar antes do faturamento.`,
    ),
  ];

  const { html, text } = renderEmail({
    // Client-facing: wears the Jump (company) brand, not the internal tool.
    brand: "company",
    preheader: `Apuração ${input.competenceLabel} — ${input.projectName}`,
    title: `Apuração de horas — ${input.competenceLabel}`,
    blocks,
    signoff: `Atenciosamente,\nEquipe ${company()}`,
  });

  return {
    subject: `${company()} · Apuração de horas ${input.competenceLabel} — ${input.projectName}`,
    html,
    text,
  };
}

// ---------------------------------------------------------------------------
// Tema 2.5 / 3.3 — Alerta de hora extra (separado por vínculo PJ/CLT)
// ---------------------------------------------------------------------------
export interface HoraExtraAlertLine {
  consultantName: string;
  contractType: "CLT" | "PJ" | "CLT_FLEX";
  /** Optional: hour-bank overtime has no project; per-entry sources may set it. */
  projectName?: string;
  overtimeHours: number;
}

export function buildAlertaHoraExtraEmail(input: {
  recipientName: string;
  competenceLabel: string;
  lines: HoraExtraAlertLine[];
}): BuiltEmail {
  const cltLines = input.lines.filter((l) => l.contractType !== "PJ");
  const pjLines = input.lines.filter((l) => l.contractType === "PJ");

  const section = (label: string, lines: HoraExtraAlertLine[]): EmailBlock[] => {
    if (lines.length === 0) return [];
    const total = lines.reduce((s, l) => s + l.overtimeHours, 0);
    const withProject = lines.some((l) => l.projectName);
    const table = withProject
      ? dataTable(
          ["Consultor", "Projeto", "Horas extras"],
          lines.map((l) => [
            l.consultantName,
            l.projectName ?? "—",
            formatHours(l.overtimeHours),
          ]),
          { alignRight: [2] },
        )
      : dataTable(
          ["Consultor", "Horas extras"],
          lines.map((l) => [l.consultantName, formatHours(l.overtimeHours)]),
          { alignRight: [1] },
        );
    return [
      heading(label),
      table,
      keyValueList([{ label: `Subtotal ${label}`, value: formatHours(total) }]),
    ];
  };

  const blocks: EmailBlock[] = [
    paragraph(`Olá, ${input.recipientName}.`),
    callout(
      `Foram identificadas horas extras na competência de ${input.competenceLabel}. Avalie o impacto em cobrança e remuneração.`,
      "warning",
    ),
    ...section("CLT / CLT FLEX", cltLines),
    ...(cltLines.length && pjLines.length ? [divider()] : []),
    ...section("PJ", pjLines),
  ];

  const { html, text } = renderEmail({
    preheader: `Alerta de hora extra — ${input.competenceLabel}`,
    title: "Alerta de hora extra",
    blocks,
    signoff: `Equipe ${app()}`,
  });

  return {
    subject: `${app()} · Alerta de hora extra — ${input.competenceLabel}`,
    html,
    text,
  };
}

// ---------------------------------------------------------------------------
// Tema 6.1 — Notificação de criação de projeto (Financeiro + comercial)
// ---------------------------------------------------------------------------
export function buildProjetoCriadoEmail(input: {
  recipientName: string;
  projectName: string;
  clientName: string;
  managerName?: string;
  hasCommercialContract: boolean;
  projectUrl?: string;
}): BuiltEmail {
  const blocks: EmailBlock[] = [
    paragraph(`Olá, ${input.recipientName}.`),
    paragraph(
      `Um novo projeto foi cadastrado no ${app()} e precisa da sua atenção para configuração financeira e comercial.`,
    ),
    keyValueList([
      { label: "Projeto", value: input.projectName },
      { label: "Cliente", value: input.clientName },
      ...(input.managerName
        ? [{ label: "Gestor", value: input.managerName }]
        : []),
    ]),
  ];

  if (!input.hasCommercialContract) {
    blocks.push(
      callout(
        `Este projeto ainda não tem contrato comercial vinculado. Vincule antes do primeiro faturamento.`,
        "warning",
      ),
    );
  }

  if (input.projectUrl) {
    blocks.push(button("Abrir projeto", input.projectUrl));
  }

  const { html, text } = renderEmail({
    preheader: `Novo projeto: ${input.projectName} (${input.clientName})`,
    title: "Novo projeto cadastrado",
    blocks,
    signoff: `Equipe ${app()}`,
  });

  return {
    subject: `${app()} · Novo projeto — ${input.projectName}`,
    html,
    text,
  };
}

// ---------------------------------------------------------------------------
// Tema 4.3 / 5.2 — Cobrança periódica de faturamento não realizado
// ---------------------------------------------------------------------------
export interface FaturamentoPendenteLine {
  projectName: string;
  clientName: string;
  competenceLabel: string;
  amount: number;
  daysOpen: number;
}

export function buildFaturamentoPendenteEmail(input: {
  recipientName: string;
  lines: FaturamentoPendenteLine[];
  appUrl?: string;
}): BuiltEmail {
  const total = input.lines.reduce((s, l) => s + l.amount, 0);
  const blocks: EmailBlock[] = [
    paragraph(`Olá, ${input.recipientName}.`),
    paragraph(
      `Existem fechamentos prontos que ainda não foram faturados. Quanto mais tempo abertos, maior o impacto no caixa.`,
    ),
    kpi("Total pendente de faturamento", formatCurrency(total), "warning"),
    dataTable(
      ["Projeto", "Cliente", "Competência", "Valor", "Dias em aberto"],
      input.lines.map((l) => [
        l.projectName,
        l.clientName,
        l.competenceLabel,
        formatCurrency(l.amount),
        String(l.daysOpen),
      ]),
      { alignRight: [3, 4] },
    ),
  ];

  if (input.appUrl) {
    blocks.push(button("Ver fechamentos", input.appUrl));
  }

  const { html, text } = renderEmail({
    preheader: `Faturamento pendente: ${formatCurrency(total)}`,
    title: "Faturamento pendente",
    blocks,
    signoff: `Equipe ${app()}`,
  });

  return {
    subject: `${app()} · Faturamento pendente (${formatCurrency(total)})`,
    html,
    text,
  };
}

// ---------------------------------------------------------------------------
// Fechamento operacional para o DP — toda a equipe lançou e teve as horas
// aprovadas no mês, liberando o Departamento Pessoal para folha/pagamento.
// ---------------------------------------------------------------------------
export interface FechamentoOperacaoLine {
  consultantName: string;
  hours: number;
}

export function buildFechamentoOperacaoEmail(input: {
  recipientName: string;
  projectName: string;
  clientName: string;
  periodLabel: string; // ex: "junho/2026"
  lines: FechamentoOperacaoLine[];
  totalHours: number;
  closedByName?: string;
  reviewUrl?: string;
}): BuiltEmail {
  const blocks: EmailBlock[] = [
    paragraph(`Olá, ${input.recipientName}.`),
    paragraph(
      `A operação do projeto ${input.projectName} (${input.clientName}) referente a ${input.periodLabel} foi fechada: todos os consultores alocados lançaram e tiveram as horas aprovadas. O DP já pode seguir com folha e pagamento.`,
    ),
    keyValueList([
      { label: "Projeto", value: input.projectName },
      { label: "Cliente", value: input.clientName },
      { label: "Competência", value: input.periodLabel },
      { label: "Consultores", value: String(input.lines.length) },
      { label: "Total de horas", value: formatHours(input.totalHours) },
      ...(input.closedByName
        ? [{ label: "Fechado por", value: input.closedByName }]
        : []),
    ]),
  ];

  if (input.lines.length > 0) {
    blocks.push(
      dataTable(
        ["Consultor", "Horas"],
        input.lines.map((l) => [l.consultantName, formatHours(l.hours)]),
        { alignRight: [1] },
      ),
    );
  }

  if (input.reviewUrl) {
    blocks.push(button("Abrir fechamento operacional", input.reviewUrl));
  }

  const { html, text } = renderEmail({
    preheader: `Operação fechada — ${input.projectName} (${input.periodLabel})`,
    title: "Operação fechada para o DP",
    blocks,
    signoff: `Equipe ${app()}`,
  });

  return {
    subject: `${app()} · Operação fechada — ${input.projectName} (${input.periodLabel})`,
    html,
    text,
  };
}

// ---------------------------------------------------------------------------
// Melhoria #5 — Feed social interno: resumo de interações (respostas + reações).
// Reaproveita o motor de notificações (sem canal novo). O template aceita N
// itens e os lista numa tabela; hoje normalmente recebe 1 item por envio (uma
// notificação por interação nova, idempotente — ver feed-events.ts §A1), mas
// consolida vários quando o emitter passa um lote pendente.
// ---------------------------------------------------------------------------
export interface FeedDigestItem {
  /** Quem gerou a interação. */
  actorName: string;
  /** Tipo de interação no alvo do destinatário. */
  kind: "reply" | "reaction" | "mention";
  /** Para reações: o emoji (ex. "👍"). Ignorado nos demais tipos. */
  emoji?: string;
  /** "post" | "comentário" — o alvo do destinatário que recebeu a interação. */
  target: "post" | "comment";
}

/**
 * "Fulano respondeu seu post" / "Beltrano reagiu 👍 ao seu comentário" /
 * "Ciclana mencionou você em um post". Menção usa artigo indefinido ("um post")
 * porque o alvo não é necessariamente do destinatário — ele só foi citado nele.
 */
function describeFeedItem(item: FeedDigestItem): string {
  if (item.kind === "mention") {
    const alvo = item.target === "post" ? "um post" : "um comentário";
    return `${item.actorName} mencionou você em ${alvo}`;
  }
  const targetLabel = item.target === "post" ? "seu post" : "seu comentário";
  if (item.kind === "reply") {
    return `${item.actorName} respondeu ${targetLabel}`;
  }
  const emoji = item.emoji ? ` ${item.emoji}` : "";
  return `${item.actorName} reagiu${emoji} a ${targetLabel}`;
}

export function buildFeedDigestEmail(input: {
  recipientName: string;
  items: FeedDigestItem[];
  feedUrl?: string;
}): BuiltEmail {
  const count = input.items.length;
  const replies = input.items.filter((i) => i.kind === "reply").length;
  const reactions = input.items.filter((i) => i.kind === "reaction").length;
  const mentions = input.items.filter((i) => i.kind === "mention").length;

  // Resumo curto e operacional do que aconteceu.
  const summaryParts: string[] = [];
  if (replies > 0)
    summaryParts.push(`${replies} ${replies === 1 ? "resposta" : "respostas"}`);
  if (reactions > 0)
    summaryParts.push(`${reactions} ${reactions === 1 ? "reação" : "reações"}`);
  if (mentions > 0)
    summaryParts.push(`${mentions} ${mentions === 1 ? "menção" : "menções"}`);
  const summary = summaryParts.join(" e ");

  const blocks: EmailBlock[] = [
    paragraph(`Olá, ${input.recipientName}.`),
    paragraph(`Você tem ${summary} no Feed. Veja o que rolou:`),
    dataTable(
      ["Interação"],
      input.items.map((i) => [describeFeedItem(i)]),
    ),
  ];

  if (input.feedUrl) {
    blocks.push(button("Abrir o Feed", input.feedUrl));
  }

  const { html, text } = renderEmail({
    preheader: `Novas interações no Feed (${count})`,
    title: "Novidades no seu Feed",
    blocks,
    signoff: `Equipe ${app()}`,
  });

  return {
    subject: `${app()} · Você tem ${count} ${count === 1 ? "interação" : "interações"} no Feed`,
    html,
    text,
  };
}

// ---------------------------------------------------------------------------
// Onda A/2 — Notificação de feriado próximo (job agendado varre o calendário)
// ---------------------------------------------------------------------------
export interface FeriadoProximoLine {
  /** Data já formatada em pt-BR (dd/mm/aaaa). */
  dateLabel: string;
  name: string;
  /** Abrangência legível ("Nacional", "SP", "São Paulo"). Opcional. */
  scopeLabel?: string;
}

export function buildFeriadoProximoEmail(input: {
  recipientName: string;
  holidays: FeriadoProximoLine[];
  /** Janela do alerta em dias (usada só na cópia). */
  daysAhead?: number;
  appUrl?: string;
}): BuiltEmail {
  const count = input.holidays.length;
  const single = count === 1;
  const showScope = input.holidays.some((h) => h.scopeLabel);

  const headers = showScope
    ? ["Data", "Feriado", "Abrangência"]
    : ["Data", "Feriado"];
  const rows = input.holidays.map((h) =>
    showScope
      ? [h.dateLabel, h.name, h.scopeLabel ?? "—"]
      : [h.dateLabel, h.name],
  );

  const janela = input.daysAhead
    ? ` nos próximos ${input.daysAhead} dias`
    : "";

  const blocks: EmailBlock[] = [
    paragraph(`Olá, ${input.recipientName}.`),
    callout(
      single
        ? `Atenção: há um feriado se aproximando${janela}. Planeje escalas, apontamento de horas e prazos.`
        : `Atenção: há ${count} feriados se aproximando${janela}. Planeje escalas, apontamento de horas e prazos.`,
      "info",
    ),
    dataTable(headers, rows),
  ];

  if (input.appUrl) {
    blocks.push(button("Abrir calendário", input.appUrl));
  }

  const title = single ? "Feriado próximo" : "Feriados próximos";
  const { html, text } = renderEmail({
    preheader: single
      ? `Feriado próximo: ${input.holidays[0]?.name ?? ""} (${input.holidays[0]?.dateLabel ?? ""})`
      : `${count} feriados próximos`,
    title,
    blocks,
    signoff: `Equipe ${app()}`,
  });

  return {
    subject: single
      ? `${app()} · Feriado próximo — ${input.holidays[0]?.name ?? ""} (${input.holidays[0]?.dateLabel ?? ""})`
      : `${app()} · ${count} feriados próximos`,
    html,
    text,
  };
}

// ---------------------------------------------------------------------------
// Tema 6.2 — Alerta de contrato comercial ausente
// ---------------------------------------------------------------------------
export function buildContratoAusenteEmail(input: {
  recipientName: string;
  projectName: string;
  clientName: string;
  projectUrl?: string;
}): BuiltEmail {
  const blocks: EmailBlock[] = [
    paragraph(`Olá, ${input.recipientName}.`),
    callout(
      `O projeto ${input.projectName} (${input.clientName}) está sem contrato comercial vinculado.`,
      "error",
    ),
    paragraph(
      `Vincule o contrato comercial para liberar faturamento e garantir a base de cobrança correta.`,
    ),
  ];
  if (input.projectUrl) {
    blocks.push(button("Vincular contrato", input.projectUrl));
  }

  const { html, text } = renderEmail({
    preheader: `Contrato comercial ausente — ${input.projectName}`,
    title: "Contrato comercial ausente",
    blocks,
    signoff: `Equipe ${app()}`,
  });

  return {
    subject: `${app()} · Contrato comercial ausente — ${input.projectName}`,
    html,
    text,
  };
}

/** Sweep variant: lista de projetos ativos sem contrato comercial vinculado. */
export function buildContratosAusentesEmail(input: {
  recipientName: string;
  projects: Array<{ projectName: string; clientName: string }>;
  appUrl?: string;
}): BuiltEmail {
  const blocks: EmailBlock[] = [
    paragraph(`Olá, ${input.recipientName}.`),
    callout(
      `Existem ${input.projects.length} projeto(s) ativo(s) sem contrato comercial vinculado.`,
      "warning",
    ),
    dataTable(
      ["Projeto", "Cliente"],
      input.projects.map((p) => [p.projectName, p.clientName]),
    ),
    paragraph(
      `Vincule o contrato comercial de cada projeto para liberar faturamento com a base de cobrança correta.`,
    ),
  ];
  if (input.appUrl) blocks.push(button("Abrir comercial", input.appUrl));

  const { html, text } = renderEmail({
    preheader: `Contratos comerciais ausentes (${input.projects.length})`,
    title: "Contratos comerciais ausentes",
    blocks,
    signoff: `Equipe ${app()}`,
  });

  return {
    subject: `${app()} · Contratos comerciais ausentes (${input.projects.length})`,
    html,
    text,
  };
}
