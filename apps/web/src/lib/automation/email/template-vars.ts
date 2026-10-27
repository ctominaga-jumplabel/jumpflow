/**
 * Variáveis dos templates de e-mail editáveis, por evento (ITEM 3).
 *
 * Cada função recebe EXATAMENTE o mesmo input do builder padrão em
 * `templates.ts` (ou um subconjunto dele) e devolve os valores das variáveis
 * `{{...}}`. Assim o ponto de envio monta o input uma vez e entrega aos dois:
 *
 *   const input = {...};
 *   const email = await applyEmailTemplate(EVENT, xTemplateVars(input), buildX(input));
 *
 * Blocos (tabelas, resumos, KPIs) reaproveitam os mesmos helpers de layout dos
 * builders, então um template personalizado mostra as tabelas idênticas ao
 * padrão. Puro — sem I/O.
 */
import { appConfig } from "@/config/app";
import type { PreInvoice } from "@/lib/billing/pre-invoice";
import { formatCurrency, formatDate, formatHours } from "@/lib/format";
import {
  callout,
  dataTable,
  divider,
  heading,
  keyValueList,
  kpi,
  paragraph,
  type EmailBlock,
} from "./layout";
import type {
  ApuracaoClienteEmailInput,
  FaturamentoPendenteLine,
  FeedDigestItem,
  FeriadoProximoLine,
  HoraExtraAlertLine,
  FechamentoOperacaoLine,
  LiberacaoEmailInput,
} from "./templates";
import type { TemplateVars } from "./template-renderer";

/** Junta vários blocos num só (ex.: aviso + tabela). Vazio → null. */
export function joinBlocks(...blocks: Array<EmailBlock | null | undefined>): EmailBlock | null {
  const present = blocks.filter((b): b is EmailBlock => Boolean(b));
  if (present.length === 0) return null;
  return {
    html: present.map((b) => b.html).join("\n"),
    text: present.map((b) => b.text).join("\n"),
  };
}

/** Variáveis disponíveis em todos os eventos. */
export function commonTemplateVars(): TemplateVars {
  return {
    "app.nome": appConfig.name,
    "empresa.nome": appConfig.company.name,
  };
}

const competenceMMYYYY = (month: number, year: number) =>
  `${String(month).padStart(2, "0")}/${year}`;

// ---------------------------------------------------------------------------
// HOURS_RELEASED
// ---------------------------------------------------------------------------
export function liberacaoTemplateVars(input: LiberacaoEmailInput): TemplateVars {
  const exceptions = input.exceptions ?? [];
  return {
    ...commonTemplateVars(),
    "destinatario.nome": input.recipientName,
    "projeto.nome": input.projectName,
    "cliente.nome": input.clientName,
    competencia: input.periodLabel,
    "horas.total": formatHours(input.totalHours),
    "consultores.quantidade": String(input.consultantsCount),
    link: input.reviewUrl ?? "",
    resumo: keyValueList([
      { label: "Projeto", value: input.projectName },
      { label: "Cliente", value: input.clientName },
      { label: "Competência", value: input.periodLabel },
      { label: "Total de horas", value: formatHours(input.totalHours) },
      { label: "Consultores", value: String(input.consultantsCount) },
    ]),
    excecoes:
      exceptions.length > 0
        ? joinBlocks(
            callout(
              "Atenção: esta liberação contém exceções que precisam de conferência.",
              "warning",
            ),
            dataTable(["Exceção"], exceptions.map((e) => [e])),
          )
        : null,
  };
}

// ---------------------------------------------------------------------------
// CLIENT_BILLING_SUMMARY
// ---------------------------------------------------------------------------
export function apuracaoClienteTemplateVars(
  input: ApuracaoClienteEmailInput,
): TemplateVars {
  const showValues = input.showValues ?? input.totalAmount !== undefined;
  const headers = showValues ? ["Consultor", "Horas", "Valor"] : ["Consultor", "Horas"];
  const rows = input.lines.map((l) =>
    showValues
      ? [l.consultantName, formatHours(l.hours), formatCurrency(l.amount ?? 0)]
      : [l.consultantName, formatHours(l.hours)],
  );
  return {
    ...commonTemplateVars(),
    "contato.nome": input.clientContactName,
    "destinatario.nome": input.clientContactName,
    "cliente.nome": input.clientName,
    "projeto.nome": input.projectName,
    competencia: input.competenceLabel,
    "horas.total": formatHours(input.totalHours),
    "valor.total":
      showValues && input.totalAmount !== undefined
        ? formatCurrency(input.totalAmount)
        : "",
    tabela_consultores: dataTable(headers, rows, {
      alignRight: showValues ? [1, 2] : [1],
    }),
    totais: keyValueList([
      { label: "Total de horas", value: formatHours(input.totalHours) },
      ...(showValues && input.totalAmount !== undefined
        ? [{ label: "Total", value: formatCurrency(input.totalAmount) }]
        : []),
    ]),
  };
}

// ---------------------------------------------------------------------------
// OVERTIME_ALERT
// ---------------------------------------------------------------------------
export function horaExtraTemplateVars(input: {
  recipientName: string;
  competenceLabel: string;
  lines: HoraExtraAlertLine[];
}): TemplateVars {
  const cltLines = input.lines.filter((l) => l.contractType !== "PJ");
  const pjLines = input.lines.filter((l) => l.contractType === "PJ");
  const section = (label: string, lines: HoraExtraAlertLine[]): EmailBlock | null => {
    if (lines.length === 0) return null;
    const total = lines.reduce((s, l) => s + l.overtimeHours, 0);
    const withProject = lines.some((l) => l.projectName);
    const table = withProject
      ? dataTable(
          ["Consultor", "Projeto", "Horas extras"],
          lines.map((l) => [l.consultantName, l.projectName ?? "—", formatHours(l.overtimeHours)]),
          { alignRight: [2] },
        )
      : dataTable(
          ["Consultor", "Horas extras"],
          lines.map((l) => [l.consultantName, formatHours(l.overtimeHours)]),
          { alignRight: [1] },
        );
    // Mesma estrutura do builder: título da seção + tabela + subtotal.
    return joinBlocks(
      heading(label),
      table,
      keyValueList([{ label: `Subtotal ${label}`, value: formatHours(total) }]),
    );
  };
  const total = input.lines.reduce((s, l) => s + l.overtimeHours, 0);
  return {
    ...commonTemplateVars(),
    "destinatario.nome": input.recipientName,
    competencia: input.competenceLabel,
    "consultores.quantidade": String(input.lines.length),
    "horas.total": formatHours(total),
    tabela_horas_extras: joinBlocks(
      section("CLT / CLT FLEX", cltLines),
      cltLines.length && pjLines.length ? divider() : null,
      section("PJ", pjLines),
    ),
  };
}

// ---------------------------------------------------------------------------
// PROJECT_CREATED
// ---------------------------------------------------------------------------
export function projetoCriadoTemplateVars(input: {
  recipientName: string;
  projectName: string;
  clientName: string;
  managerName?: string;
  hasCommercialContract: boolean;
  projectUrl?: string;
}): TemplateVars {
  return {
    ...commonTemplateVars(),
    "destinatario.nome": input.recipientName,
    "projeto.nome": input.projectName,
    "cliente.nome": input.clientName,
    "gestor.nome": input.managerName ?? "",
    link: input.projectUrl ?? "",
    resumo: keyValueList([
      { label: "Projeto", value: input.projectName },
      { label: "Cliente", value: input.clientName },
      ...(input.managerName ? [{ label: "Gestor", value: input.managerName }] : []),
    ]),
    alerta_contrato: input.hasCommercialContract
      ? null
      : callout(
          "Este projeto ainda não tem contrato comercial vinculado. Vincule antes do primeiro faturamento.",
          "warning",
        ),
  };
}

// ---------------------------------------------------------------------------
// INVOICING_OVERDUE
// ---------------------------------------------------------------------------
export function faturamentoPendenteTemplateVars(input: {
  recipientName: string;
  lines: FaturamentoPendenteLine[];
  appUrl?: string;
}): TemplateVars {
  const total = input.lines.reduce((s, l) => s + l.amount, 0);
  return {
    ...commonTemplateVars(),
    "destinatario.nome": input.recipientName,
    "valor.total": formatCurrency(total),
    "fechamentos.quantidade": String(input.lines.length),
    link: input.appUrl ?? "",
    kpi_total: kpi("Total pendente de faturamento", formatCurrency(total), "warning"),
    tabela_fechamentos: dataTable(
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
  };
}

// ---------------------------------------------------------------------------
// COMMERCIAL_CONTRACT_MISSING (varredura)
// ---------------------------------------------------------------------------
export function contratosAusentesTemplateVars(input: {
  recipientName: string;
  projects: Array<{ projectName: string; clientName: string }>;
  appUrl?: string;
}): TemplateVars {
  return {
    ...commonTemplateVars(),
    "destinatario.nome": input.recipientName,
    "projetos.quantidade": String(input.projects.length),
    link: input.appUrl ?? "",
    tabela_projetos: dataTable(
      ["Projeto", "Cliente"],
      input.projects.map((p) => [p.projectName, p.clientName]),
    ),
  };
}

// ---------------------------------------------------------------------------
// OPERATION_CLOSED
// ---------------------------------------------------------------------------
export function fechamentoOperacaoTemplateVars(input: {
  recipientName: string;
  projectName: string;
  clientName: string;
  periodLabel: string;
  lines: FechamentoOperacaoLine[];
  totalHours: number;
  closedByName?: string;
  reviewUrl?: string;
}): TemplateVars {
  return {
    ...commonTemplateVars(),
    "destinatario.nome": input.recipientName,
    "projeto.nome": input.projectName,
    "cliente.nome": input.clientName,
    competencia: input.periodLabel,
    "consultores.quantidade": String(input.lines.length),
    "horas.total": formatHours(input.totalHours),
    "fechado_por.nome": input.closedByName ?? "",
    link: input.reviewUrl ?? "",
    resumo: keyValueList([
      { label: "Projeto", value: input.projectName },
      { label: "Cliente", value: input.clientName },
      { label: "Competência", value: input.periodLabel },
      { label: "Consultores", value: String(input.lines.length) },
      { label: "Total de horas", value: formatHours(input.totalHours) },
      ...(input.closedByName ? [{ label: "Fechado por", value: input.closedByName }] : []),
    ]),
    tabela_consultores:
      input.lines.length > 0
        ? dataTable(
            ["Consultor", "Horas"],
            input.lines.map((l) => [l.consultantName, formatHours(l.hours)]),
            { alignRight: [1] },
          )
        : null,
  };
}

// ---------------------------------------------------------------------------
// FEED_POST_REPLIED / FEED_CONTENT_REACTED / FEED_MENTIONED
// ---------------------------------------------------------------------------
function describeFeedItem(item: FeedDigestItem): string {
  if (item.kind === "mention") {
    return `${item.actorName} mencionou você em ${item.target === "post" ? "um post" : "um comentário"}`;
  }
  const targetLabel = item.target === "post" ? "seu post" : "seu comentário";
  if (item.kind === "reply") return `${item.actorName} respondeu ${targetLabel}`;
  return `${item.actorName} reagiu${item.emoji ? ` ${item.emoji}` : ""} a ${targetLabel}`;
}

export function feedDigestTemplateVars(input: {
  recipientName: string;
  items: FeedDigestItem[];
  feedUrl?: string;
}): TemplateVars {
  const count = input.items.length;
  const n = (kind: FeedDigestItem["kind"]) => input.items.filter((i) => i.kind === kind).length;
  const parts: string[] = [];
  const replies = n("reply");
  const reactions = n("reaction");
  const mentions = n("mention");
  if (replies) parts.push(`${replies} ${replies === 1 ? "resposta" : "respostas"}`);
  if (reactions) parts.push(`${reactions} ${reactions === 1 ? "reação" : "reações"}`);
  if (mentions) parts.push(`${mentions} ${mentions === 1 ? "menção" : "menções"}`);
  return {
    ...commonTemplateVars(),
    "destinatario.nome": input.recipientName,
    "interacoes.quantidade": String(count),
    "interacoes.descricao": `${count} ${count === 1 ? "interação" : "interações"}`,
    "interacoes.resumo": parts.join(" e "),
    link: input.feedUrl ?? "",
    tabela_interacoes: dataTable(
      ["Interação"],
      input.items.map((i) => [describeFeedItem(i)]),
    ),
  };
}

// ---------------------------------------------------------------------------
// HOLIDAY_UPCOMING
// ---------------------------------------------------------------------------
export function feriadoProximoTemplateVars(input: {
  recipientName: string;
  holidays: FeriadoProximoLine[];
  daysAhead?: number;
  appUrl?: string;
}): TemplateVars {
  const count = input.holidays.length;
  const single = count === 1;
  const first = input.holidays[0];
  const showScope = input.holidays.some((h) => h.scopeLabel);
  const janela = input.daysAhead ? ` nos próximos ${input.daysAhead} dias` : "";
  return {
    ...commonTemplateVars(),
    "destinatario.nome": input.recipientName,
    "feriados.quantidade": String(count),
    "feriados.titulo": single ? "Feriado próximo" : "Feriados próximos",
    "feriados.descricao": single
      ? `Feriado próximo — ${first?.name ?? ""} (${first?.dateLabel ?? ""})`
      : `${count} feriados próximos`,
    "feriados.aviso": single
      ? `há um feriado se aproximando${janela}`
      : `há ${count} feriados se aproximando${janela}`,
    "feriado.nome": first?.name ?? "",
    "feriado.data": first?.dateLabel ?? "",
    "janela.dias": input.daysAhead ? String(input.daysAhead) : "",
    link: input.appUrl ?? "",
    tabela_feriados: dataTable(
      showScope ? ["Data", "Feriado", "Abrangência"] : ["Data", "Feriado"],
      input.holidays.map((h) =>
        showScope ? [h.dateLabel, h.name, h.scopeLabel ?? "—"] : [h.dateLabel, h.name],
      ),
    ),
  };
}

// ---------------------------------------------------------------------------
// MISSING_TIMESHEET_REPORT
// ---------------------------------------------------------------------------
function formatUtcDate(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

export function missingTimesheetTemplateVars(input: {
  periodStart: Date;
  periodEnd: Date;
  rowCount: number;
}): TemplateVars {
  const periodo = `${formatUtcDate(input.periodStart)} a ${formatUtcDate(input.periodEnd)}`;
  return {
    ...commonTemplateVars(),
    periodo,
    "registros.quantidade": String(input.rowCount),
    resumo: keyValueList([
      { label: "Período", value: periodo },
      { label: "Registros", value: String(input.rowCount) },
    ]),
  };
}

// ---------------------------------------------------------------------------
// ACCESS_INVITE (convite novo e regeneração de link)
// ---------------------------------------------------------------------------
export function accessInviteTemplateVars(input: {
  link: string;
  regenerated?: boolean;
  recipientName?: string;
}): TemplateVars {
  const app = appConfig.name;
  const regen = input.regenerated ?? false;
  return {
    ...commonTemplateVars(),
    "destinatario.nome": input.recipientName ?? "",
    saudacao: input.recipientName ? `Olá, ${input.recipientName}.` : "Olá.",
    link: input.link,
    "convite.assunto": regen ? "Novo link de acesso" : "Convite de acesso",
    "convite.mensagem": regen
      ? `Seu link de acesso ao ${app} foi regenerado. Use o botão abaixo para definir seu acesso.`
      : `Você foi convidado(a) a acessar o ${app}. Use o botão abaixo para definir seu acesso.`,
    "convite.aviso": regen
      ? "O link anterior não funciona mais. Se não reconhece esta mensagem, ignore-a."
      : "O link expira em breve. Se não reconhece este convite, ignore esta mensagem.",
  };
}

// ---------------------------------------------------------------------------
// PRE_INVOICE_ISSUED
// ---------------------------------------------------------------------------
export function preInvoiceTemplateVars(input: {
  preInvoice: PreInvoice;
  contactName?: string;
}): TemplateVars {
  const p = input.preInvoice;
  return {
    ...commonTemplateVars(),
    saudacao: input.contactName ? `Prezado(a) ${input.contactName},` : "Prezado(a),",
    "contato.nome": input.contactName ?? "",
    "cliente.nome": p.clientName,
    competencia: p.competence,
    "valor.subtotal": formatCurrency(p.servicesSubtotal),
    "valor.total": formatCurrency(p.total),
    tabela_projetos: dataTable(
      ["Projeto", "Horas", "Valor unit.", "Valor"],
      p.lines.map((l) => [
        l.projectName,
        formatHours(l.hours),
        formatCurrency(l.unitRate),
        formatCurrency(l.amount),
      ]),
      { alignRight: [1, 2, 3] },
    ),
    totais: keyValueList([
      { label: "Subtotal de serviços", value: formatCurrency(p.servicesSubtotal) },
      ...(p.adjustmentAmount
        ? [{ label: "Ajuste", value: formatCurrency(p.adjustmentAmount) }]
        : []),
      { label: "Total faturável", value: formatCurrency(p.total) },
      ...(p.estimatedIss
        ? [{ label: `ISS estimado (${p.issRate}%)`, value: formatCurrency(p.estimatedIss) }]
        : []),
    ]),
  };
}

// ---------------------------------------------------------------------------
// NFSE_ISSUED
// ---------------------------------------------------------------------------
export function nfseTemplateVars(input: {
  clientName: string;
  competenceLabel: string;
  invoiceNumber?: string | null;
  protocol?: string | null;
  contactName?: string;
}): TemplateVars {
  return {
    ...commonTemplateVars(),
    saudacao: input.contactName ? `Prezado(a) ${input.contactName},` : "Prezado(a),",
    "contato.nome": input.contactName ?? "",
    "cliente.nome": input.clientName,
    competencia: input.competenceLabel,
    "nfse.numero": input.invoiceNumber ?? "",
    "nfse.protocolo": input.protocol ?? "",
    resumo: keyValueList([
      ...(input.invoiceNumber ? [{ label: "Número da NFS-e", value: input.invoiceNumber }] : []),
      ...(input.protocol ? [{ label: "Protocolo", value: input.protocol }] : []),
      { label: "Competência", value: input.competenceLabel },
    ]),
  };
}

// ---------------------------------------------------------------------------
// PAYMENT_FORECAST
// ---------------------------------------------------------------------------
export function paymentForecastTemplateVars(input: {
  consultantName: string;
  month: number;
  year: number;
  totalAmount: number;
  expectedPaymentAt: string;
  responseDeadlineAt: string;
  projectLines?: Array<{ projectName: string; hours: number; unitRate: number; amount: number }>;
}): TemplateVars {
  const lines = input.projectLines ?? [];
  return {
    ...commonTemplateVars(),
    "consultor.nome": input.consultantName,
    "destinatario.nome": input.consultantName,
    competencia: competenceMMYYYY(input.month, input.year),
    "valor.total": formatCurrency(input.totalAmount),
    "pagamento.data_prevista": formatDate(input.expectedPaymentAt),
    "pagamento.prazo_retorno": formatDate(input.responseDeadlineAt),
    kpi_total: kpi("Total previsto", formatCurrency(input.totalAmount), "info"),
    tabela_projetos:
      lines.length > 0
        ? dataTable(
            ["Projeto", "Horas", "Valor unit.", "Valor"],
            lines.map((l) => [
              l.projectName,
              formatHours(l.hours),
              formatCurrency(l.unitRate),
              formatCurrency(l.amount),
            ]),
            { alignRight: [1, 2, 3] },
          )
        : null,
    datas: keyValueList([
      { label: "Data prevista de pagamento", value: formatDate(input.expectedPaymentAt) },
      { label: "Prazo para retorno", value: formatDate(input.responseDeadlineAt) },
    ]),
  };
}

// ---------------------------------------------------------------------------
// CONSULTANT_INVOICE_REQUEST
// ---------------------------------------------------------------------------
/** Mesmo input do builder `buildConsultantInvoiceRequestEmail`. */
export function consultantInvoiceRequestTemplateVars(input: {
  consultantName: string;
  month: number;
  year: number;
  expectedAmount: number;
  notasUrl?: string;
  projects?: Array<{ projectName: string; clientName: string; hours: number; amount: number }>;
  projectAmountsProportional?: boolean;
}): TemplateVars {
  const competencia = competenceMMYYYY(input.month, input.year);
  const projects = input.projects ?? [];
  const onePerProject = projects.length > 1;
  return {
    ...commonTemplateVars(),
    "consultor.nome": input.consultantName,
    "destinatario.nome": input.consultantName,
    competencia,
    "valor.previsto": formatCurrency(input.expectedAmount),
    "projetos.quantidade": String(projects.length),
    "nf.solicitacao": onePerProject
      ? "das suas notas fiscais (NF)"
      : "da sua nota fiscal (NF)",
    "nf.instrucao": onePerProject
      ? 'Anexe os arquivos (PDF ou XML) na plataforma, em "Minhas Notas". Caso haja divergência de valor, responda a este e-mail antes de emitir.'
      : 'Emita a NF com o valor previsto acima e anexe o arquivo (PDF ou XML) na plataforma, em "Minhas Notas". Caso haja divergência de valor, responda a este e-mail antes de emitir.',
    link: input.notasUrl ?? "",
    kpi_valor: kpi("Valor previsto", formatCurrency(input.expectedAmount), "info"),
    resumo: keyValueList([{ label: "Competência", value: competencia }]),
    // Tabela por projeto + nota de rateio + aviso de "uma NF por projeto",
    // exatamente como o builder (vazio quando não há projetos).
    tabela_projetos:
      projects.length > 0
        ? joinBlocks(
            dataTable(
              ["Projeto", "Cliente", "Horas", "Valor"],
              projects.map((p) => [
                p.projectName,
                p.clientName,
                formatHours(p.hours),
                formatCurrency(p.amount),
              ]),
              { alignRight: [2, 3] },
            ),
            input.projectAmountsProportional
              ? paragraph(
                  "Os valores por projeto foram rateados proporcionalmente às horas aprovadas de cada projeto.",
                )
              : null,
            onePerProject
              ? callout(
                  `Você atuou em ${projects.length} projetos nesta competência: emita UMA NF por projeto, com o valor indicado na tabela acima, e anexe todas em "Minhas Notas".`,
                  "info",
                )
              : null,
          )
        : null,
  };
}
