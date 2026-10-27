/**
 * Registro dos templates de e-mail editáveis, um por NotificationEvent (ITEM 3).
 *
 * Para cada evento: rótulo, grupo, descrição, assunto/corpo PADRÃO (espelham o
 * e-mail hoje gerado pelo builder em `templates.ts`), variáveis disponíveis e
 * dados de exemplo para a pré-visualização e o "Enviar teste".
 *
 * Importante: sem template personalizado no banco, o envio usa o BUILDER (o
 * e-mail original, inalterado). O padrão daqui é o ponto de partida do editor e
 * o que "Restaurar padrão" devolve. O teste `template-registry.test.ts` garante
 * que todo evento do enum Prisma está aqui e que o padrão só usa variáveis
 * conhecidas.
 *
 * Puro (sem I/O). Eventos sem envio de e-mail ficam com `sendsEmail: false` e o
 * motivo — a tela os mostra como "Sem e-mail" em vez de fingir um template.
 */
import {
  button,
  callout,
  dataTable,
  keyValueList,
  paragraph,
  type EmailBrand,
} from "./layout";
import type { TemplateVars } from "./template-renderer";
import {
  accessInviteTemplateVars,
  commonTemplateVars,
  joinBlocks,
  apuracaoClienteTemplateVars,
  consultantInvoiceRequestTemplateVars,
  contratosAusentesTemplateVars,
  faturamentoPendenteTemplateVars,
  feedDigestTemplateVars,
  fechamentoOperacaoTemplateVars,
  feriadoProximoTemplateVars,
  horaExtraTemplateVars,
  liberacaoTemplateVars,
  missingTimesheetTemplateVars,
  nfseTemplateVars,
  paymentForecastTemplateVars,
  preInvoiceTemplateVars,
  projetoCriadoTemplateVars,
} from "./template-vars";

/** Espelho do enum Prisma `NotificationEvent` (o teste confere com o schema). */
export const NOTIFICATION_EVENTS = [
  "HOURS_RELEASED",
  "CLIENT_BILLING_SUMMARY",
  "OVERTIME_ALERT",
  "PROJECT_CREATED",
  "INVOICING_OVERDUE",
  "COMMERCIAL_CONTRACT_MISSING",
  "OPERATION_CLOSED",
  "FEED_POST_REPLIED",
  "FEED_CONTENT_REACTED",
  "FEED_MENTIONED",
  "HOLIDAY_UPCOMING",
  "MISSING_TIMESHEET_REPORT",
  "ACCESS_INVITE",
  "PRE_INVOICE_ISSUED",
  "NFSE_ISSUED",
  "PAYMENT_FORECAST",
  "CONSULTANT_INVOICE_REQUEST",
  "PAYMENT_RELEASED_BY_PEOPLE",
  "SLA_DEADLINE_APPROACHING",
  "SLA_OVERDUE",
] as const;

export type NotificationEventName = (typeof NOTIFICATION_EVENTS)[number];

export function isNotificationEventName(value: string): value is NotificationEventName {
  return (NOTIFICATION_EVENTS as readonly string[]).includes(value);
}

export const TEMPLATE_GROUPS = [
  "Horas e operação",
  "Faturamento e cliente",
  "Projetos e comercial",
  "Pagamentos",
  "Acesso",
  "Feed",
  "SLA",
] as const;
export type TemplateGroup = (typeof TEMPLATE_GROUPS)[number];

export interface TemplateVariableDef {
  key: string;
  label: string;
  /** Bloco pronto (tabela/resumo): deve ficar sozinho numa linha do corpo. */
  block: boolean;
}

interface BaseDefinition {
  event: NotificationEventName;
  label: string;
  group: TemplateGroup;
  description: string;
  /** Quem recebe por natureza (antes das regras de notificação). */
  audience: string;
}

export interface EmailTemplateDefinition extends BaseDefinition {
  sendsEmail: true;
  /** "company" = e-mail ao cliente com a marca Jump. */
  brand: EmailBrand;
  defaultTitle: string;
  defaultSubject: string;
  defaultBody: string;
  variables: TemplateVariableDef[];
  /** Valores de exemplo (mesma função usada no envio real). */
  sampleVars: () => TemplateVars;
  /**
   * true: o ponto de envio não fornece variáveis específicas; o motor usa
   * {{titulo}} + {{conteudo}} (blocos prontos do fragmento).
   */
  genericContent?: boolean;
}

export interface NoEmailDefinition extends BaseDefinition {
  sendsEmail: false;
  /** Por que não há e-mail editável para o evento. */
  reason: string;
}

export type TemplateDefinition = EmailTemplateDefinition | NoEmailDefinition;

// ---------------------------------------------------------------------------
// Rótulos das variáveis (compartilhados entre eventos)
// ---------------------------------------------------------------------------
const VARIABLE_LABELS: Record<string, string> = {
  "app.nome": "Nome da plataforma",
  "empresa.nome": "Nome da empresa",
  "destinatario.nome": "Nome do destinatário",
  saudacao: "Saudação pronta",
  "contato.nome": "Contato do cliente",
  "consultor.nome": "Nome do consultor",
  "projeto.nome": "Projeto",
  "cliente.nome": "Cliente",
  "gestor.nome": "Gestor do projeto",
  "fechado_por.nome": "Quem fechou",
  competencia: "Competência",
  periodo: "Período",
  "horas.total": "Total de horas",
  "consultores.quantidade": "Qtd. de consultores",
  "valor.total": "Valor total",
  "valor.subtotal": "Subtotal de serviços",
  "valor.previsto": "Valor previsto",
  "fechamentos.quantidade": "Qtd. de fechamentos",
  "projetos.quantidade": "Qtd. de projetos",
  "registros.quantidade": "Qtd. de registros",
  "interacoes.quantidade": "Qtd. de interações",
  "interacoes.descricao": "Interações (com plural)",
  "interacoes.resumo": "Resumo das interações",
  "feriados.quantidade": "Qtd. de feriados",
  "feriados.titulo": "Título (singular/plural)",
  "feriados.descricao": "Descrição curta",
  "feriados.aviso": "Aviso da janela",
  "feriado.nome": "1º feriado",
  "feriado.data": "Data do 1º feriado",
  "janela.dias": "Janela (dias)",
  "nfse.numero": "Número da NFS-e",
  "nfse.protocolo": "Protocolo",
  "pagamento.data_prevista": "Data prevista",
  "pagamento.prazo_retorno": "Prazo de retorno",
  "convite.assunto": "Tipo de convite",
  "convite.mensagem": "Mensagem do convite",
  "convite.aviso": "Aviso de validade",
  "nf.solicitacao": "Pedido (1 NF ou várias)",
  "nf.instrucao": "Instrução de envio da NF",
  link: "Link (botão)",
  titulo: "Título original",
  conteudo: "Bloco: conteúdo do aviso",
  // blocos
  resumo: "Bloco: resumo",
  excecoes: "Bloco: exceções",
  totais: "Bloco: totais",
  datas: "Bloco: datas",
  alerta_contrato: "Bloco: alerta de contrato",
  kpi_total: "Bloco: destaque do total",
  kpi_valor: "Bloco: destaque do valor",
  tabela_consultores: "Bloco: tabela por consultor",
  tabela_horas_extras: "Bloco: tabelas de hora extra",
  tabela_fechamentos: "Bloco: tabela de fechamentos",
  tabela_projetos: "Bloco: tabela de projetos",
  tabela_interacoes: "Bloco: tabela de interações",
  tabela_feriados: "Bloco: tabela de feriados",
};

function vars(scalars: string[], blocks: string[] = []): TemplateVariableDef[] {
  const common = ["app.nome", "empresa.nome"];
  return [
    ...[...scalars, ...common.filter((c) => !scalars.includes(c))].map((key) => ({
      key,
      label: VARIABLE_LABELS[key] ?? key,
      block: false,
    })),
    ...blocks.map((key) => ({ key, label: VARIABLE_LABELS[key] ?? key, block: true })),
  ];
}

const SAMPLE_URL = "https://flow.jump.tec.br/app";
const SAMPLE_NAME = "Ana Souza";

/** Corpo multilinha sem indentação acidental. */
const body = (...lines: string[]) => lines.join("\n");

// ---------------------------------------------------------------------------
// Feed (3 eventos, mesmo e-mail de resumo)
// ---------------------------------------------------------------------------
function feedDefinition(
  event: "FEED_POST_REPLIED" | "FEED_CONTENT_REACTED" | "FEED_MENTIONED",
  label: string,
  description: string,
  kind: "reply" | "reaction" | "mention",
): EmailTemplateDefinition {
  return {
    event,
    label,
    group: "Feed",
    description,
    audience: "Autor do post/comentário (ou a pessoa mencionada)",
    sendsEmail: true,
    brand: "product",
    defaultTitle: "Novidades no seu Feed",
    defaultSubject: "{{app.nome}} · Você tem {{interacoes.descricao}} no Feed",
    defaultBody: body(
      "# Novidades no seu Feed",
      "",
      "Olá, {{destinatario.nome}}.",
      "",
      "Você tem {{interacoes.resumo}} no Feed. Veja o que rolou:",
      "",
      "{{tabela_interacoes}}",
      "",
      "[Abrir o Feed]({{link}})",
      "",
      "Equipe {{app.nome}}",
    ),
    variables: vars(
      ["destinatario.nome", "interacoes.quantidade", "interacoes.descricao", "interacoes.resumo", "link"],
      ["tabela_interacoes"],
    ),
    sampleVars: () =>
      feedDigestTemplateVars({
        recipientName: SAMPLE_NAME,
        items: [
          { actorName: "Bruno Lima", kind, emoji: "👍", target: "post" },
        ],
        feedUrl: `${SAMPLE_URL}/feed`,
      }),
  };
}

// ---------------------------------------------------------------------------
// Eventos de conteúdo genérico: o ponto de envio monta blocos prontos (sem
// builder em templates.ts). O template personaliza assunto e texto ao redor do
// conteúdo: {{titulo}} (o título original) e {{conteudo}} (os blocos). O padrão
// reproduz exatamente o e-mail atual (título + blocos, sem assinatura).
// ---------------------------------------------------------------------------
function genericDefinition(input: {
  event: NotificationEventName;
  label: string;
  group: TemplateGroup;
  description: string;
  audience: string;
  sample: () => { titulo: string; conteudo: TemplateVars[string] };
}): EmailTemplateDefinition {
  return {
    event: input.event,
    label: input.label,
    group: input.group,
    description: input.description,
    audience: input.audience,
    sendsEmail: true,
    genericContent: true,
    brand: "product",
    defaultTitle: "{{titulo}}",
    defaultSubject: "{{titulo}}",
    defaultBody: body("# {{titulo}}", "", "{{conteudo}}"),
    variables: vars(["titulo", "destinatario.nome"], ["conteudo"]),
    sampleVars: () => {
      const s = input.sample();
      return {
        ...commonTemplateVars(),
        "destinatario.nome": SAMPLE_NAME,
        titulo: s.titulo,
        conteudo: s.conteudo,
      };
    },
  };
}

function slaSampleContent(tone: "warning" | "error", message: string) {
  return joinBlocks(
    callout(message, tone),
    keyValueList([
      { label: "Processo", value: "Horas → faturamento" },
      { label: "Competência", value: "junho/2026" },
      { label: "Área responsável", value: "Gestão de área" },
      { label: "Prazo", value: "03/07" },
      { label: "Concluído", value: "5 de 8" },
    ]),
    dataTable(
      ["Item", "Contexto", "Responsável", "Pendência"],
      [["Portal de Atendimento", "ACME S.A.", "Carla Souza", "3 lançamentos aguardando aprovação"]],
    ),
    button("Abrir acompanhamento de SLA", `${SAMPLE_URL}/sla`),
  );
}

// ---------------------------------------------------------------------------
// Definições
// ---------------------------------------------------------------------------
const DEFINITIONS: Record<NotificationEventName, TemplateDefinition> = {
  HOURS_RELEASED: {
    event: "HOURS_RELEASED",
    label: "Liberação de horas",
    group: "Horas e operação",
    description: "Enviado quando o faturamento de um projeto/competência é liberado.",
    audience: "Destinatários da regra (ex.: Financeiro, gestor do projeto)",
    sendsEmail: true,
    brand: "product",
    defaultTitle: "Horas liberadas",
    defaultSubject: "{{app.nome}} · Liberação de horas — {{projeto.nome}} ({{competencia}})",
    defaultBody: body(
      "# Horas liberadas",
      "",
      "Olá, {{destinatario.nome}}.",
      "",
      "As horas do projeto {{projeto.nome}} ({{cliente.nome}}) referentes à competência de {{competencia}} foram liberadas e estão prontas para a próxima etapa.",
      "",
      "{{resumo}}",
      "",
      "{{excecoes}}",
      "",
      "[Abrir liberação]({{link}})",
      "",
      "Equipe {{app.nome}}",
    ),
    variables: vars(
      ["destinatario.nome", "projeto.nome", "cliente.nome", "competencia", "horas.total", "consultores.quantidade", "link"],
      ["resumo", "excecoes"],
    ),
    sampleVars: () =>
      liberacaoTemplateVars({
        recipientName: SAMPLE_NAME,
        projectName: "Portal de Atendimento",
        clientName: "ACME S.A.",
        periodLabel: "junho/2026",
        totalHours: 186,
        consultantsCount: 4,
        exceptions: ["Hora extra: 4h — João Pereira (PJ)"],
        reviewUrl: `${SAMPLE_URL}/financeiro`,
      }),
  },

  CLIENT_BILLING_SUMMARY: {
    event: "CLIENT_BILLING_SUMMARY",
    label: "Apuração ao cliente",
    group: "Faturamento e cliente",
    description: "Apuração de horas por consultor enviada ao contato do cliente (marca Jump).",
    audience: "Contato de cobrança do cliente",
    sendsEmail: true,
    brand: "company",
    defaultTitle: "Apuração de horas — {{competencia}}",
    defaultSubject: "{{empresa.nome}} · Apuração de horas {{competencia}} — {{projeto.nome}}",
    defaultBody: body(
      "# Apuração de horas — {{competencia}}",
      "",
      "Prezado(a) {{contato.nome}},",
      "",
      "Segue a apuração de horas do projeto {{projeto.nome}} referente à competência de {{competencia}}, detalhada por consultor.",
      "",
      "{{tabela_consultores}}",
      "",
      "{{totais}}",
      "",
      "Em caso de divergência, responda a este e-mail para que possamos revisar antes do faturamento.",
      "",
      "Atenciosamente,",
      "Equipe {{empresa.nome}}",
    ),
    variables: vars(
      ["contato.nome", "destinatario.nome", "cliente.nome", "projeto.nome", "competencia", "horas.total", "valor.total"],
      ["tabela_consultores", "totais"],
    ),
    sampleVars: () =>
      apuracaoClienteTemplateVars({
        clientContactName: "Sr. Roberto",
        clientName: "ACME S.A.",
        projectName: "Portal de Atendimento",
        competenceLabel: "junho/2026",
        lines: [
          { consultantName: "João Pereira", hours: 64, amount: 19200 },
          { consultantName: "Maria Lima", hours: 72, amount: 21600 },
        ],
        totalHours: 136,
        totalAmount: 40800,
        showValues: true,
      }),
  },

  OVERTIME_ALERT: {
    event: "OVERTIME_ALERT",
    label: "Alerta de hora extra",
    group: "Horas e operação",
    description: "Job mensal: horas extras da competência separadas por vínculo (CLT/PJ).",
    audience: "Destinatários da regra",
    sendsEmail: true,
    brand: "product",
    defaultTitle: "Alerta de hora extra",
    defaultSubject: "{{app.nome}} · Alerta de hora extra — {{competencia}}",
    defaultBody: body(
      "# Alerta de hora extra",
      "",
      "Olá, {{destinatario.nome}}.",
      "",
      ">! Foram identificadas horas extras na competência de {{competencia}}. Avalie o impacto em cobrança e remuneração.",
      "",
      "{{tabela_horas_extras}}",
      "",
      "Equipe {{app.nome}}",
    ),
    variables: vars(
      ["destinatario.nome", "competencia", "consultores.quantidade", "horas.total"],
      ["tabela_horas_extras"],
    ),
    sampleVars: () =>
      horaExtraTemplateVars({
        recipientName: SAMPLE_NAME,
        competenceLabel: "junho/2026",
        lines: [
          { consultantName: "Maria Lima", contractType: "CLT", overtimeHours: 6 },
          { consultantName: "João Pereira", contractType: "PJ", overtimeHours: 4 },
        ],
      }),
  },

  PROJECT_CREATED: {
    event: "PROJECT_CREATED",
    label: "Novo projeto",
    group: "Projetos e comercial",
    description: "Aviso ao Financeiro/comercial quando um projeto é cadastrado.",
    audience: "Destinatários da regra",
    sendsEmail: true,
    brand: "product",
    defaultTitle: "Novo projeto cadastrado",
    defaultSubject: "{{app.nome}} · Novo projeto — {{projeto.nome}}",
    defaultBody: body(
      "# Novo projeto cadastrado",
      "",
      "Olá, {{destinatario.nome}}.",
      "",
      "Um novo projeto foi cadastrado no {{app.nome}} e precisa da sua atenção para configuração financeira e comercial.",
      "",
      "{{resumo}}",
      "",
      "{{alerta_contrato}}",
      "",
      "[Abrir projeto]({{link}})",
      "",
      "Equipe {{app.nome}}",
    ),
    variables: vars(
      ["destinatario.nome", "projeto.nome", "cliente.nome", "gestor.nome", "link"],
      ["resumo", "alerta_contrato"],
    ),
    sampleVars: () =>
      projetoCriadoTemplateVars({
        recipientName: SAMPLE_NAME,
        projectName: "Portal de Atendimento",
        clientName: "ACME S.A.",
        managerName: "Carla Souza",
        hasCommercialContract: false,
        projectUrl: `${SAMPLE_URL}/projetos`,
      }),
  },

  INVOICING_OVERDUE: {
    event: "INVOICING_OVERDUE",
    label: "Faturamento pendente",
    group: "Faturamento e cliente",
    description: "Job periódico: fechamentos prontos que ainda não foram faturados.",
    audience: "Destinatários da regra",
    sendsEmail: true,
    brand: "product",
    defaultTitle: "Faturamento pendente",
    defaultSubject: "{{app.nome}} · Faturamento pendente ({{valor.total}})",
    defaultBody: body(
      "# Faturamento pendente",
      "",
      "Olá, {{destinatario.nome}}.",
      "",
      "Existem fechamentos prontos que ainda não foram faturados. Quanto mais tempo abertos, maior o impacto no caixa.",
      "",
      "{{kpi_total}}",
      "",
      "{{tabela_fechamentos}}",
      "",
      "[Ver fechamentos]({{link}})",
      "",
      "Equipe {{app.nome}}",
    ),
    variables: vars(
      ["destinatario.nome", "valor.total", "fechamentos.quantidade", "link"],
      ["kpi_total", "tabela_fechamentos"],
    ),
    sampleVars: () =>
      faturamentoPendenteTemplateVars({
        recipientName: SAMPLE_NAME,
        lines: [
          {
            projectName: "Portal de Atendimento",
            clientName: "ACME S.A.",
            competenceLabel: "maio/2026",
            amount: 55800,
            daysOpen: 12,
          },
        ],
        appUrl: `${SAMPLE_URL}/financeiro`,
      }),
  },

  COMMERCIAL_CONTRACT_MISSING: {
    event: "COMMERCIAL_CONTRACT_MISSING",
    label: "Contrato ausente",
    group: "Projetos e comercial",
    description: "Varredura de projetos ativos sem contrato comercial vinculado.",
    audience: "Destinatários da regra",
    sendsEmail: true,
    brand: "product",
    defaultTitle: "Contratos comerciais ausentes",
    defaultSubject: "{{app.nome}} · Contratos comerciais ausentes ({{projetos.quantidade}})",
    defaultBody: body(
      "# Contratos comerciais ausentes",
      "",
      "Olá, {{destinatario.nome}}.",
      "",
      ">! Existem {{projetos.quantidade}} projeto(s) ativo(s) sem contrato comercial vinculado.",
      "",
      "{{tabela_projetos}}",
      "",
      "Vincule o contrato comercial de cada projeto para liberar faturamento com a base de cobrança correta.",
      "",
      "[Abrir comercial]({{link}})",
      "",
      "Equipe {{app.nome}}",
    ),
    variables: vars(["destinatario.nome", "projetos.quantidade", "link"], ["tabela_projetos"]),
    sampleVars: () =>
      contratosAusentesTemplateVars({
        recipientName: SAMPLE_NAME,
        projects: [
          { projectName: "Portal de Atendimento", clientName: "ACME S.A." },
          { projectName: "App Mobile", clientName: "Globex" },
        ],
        appUrl: `${SAMPLE_URL}/comercial`,
      }),
  },

  OPERATION_CLOSED: {
    event: "OPERATION_CLOSED",
    label: "Fechamento operacional (DP)",
    group: "Horas e operação",
    description: "Toda a equipe do projeto lançou e teve as horas aprovadas no mês.",
    audience: "Destinatários da regra (ex.: DP/People)",
    sendsEmail: true,
    brand: "product",
    defaultTitle: "Operação fechada para o DP",
    defaultSubject: "{{app.nome}} · Operação fechada — {{projeto.nome}} ({{competencia}})",
    defaultBody: body(
      "# Operação fechada para o DP",
      "",
      "Olá, {{destinatario.nome}}.",
      "",
      "A operação do projeto {{projeto.nome}} ({{cliente.nome}}) referente a {{competencia}} foi fechada: todos os consultores alocados lançaram e tiveram as horas aprovadas. O DP já pode seguir com folha e pagamento.",
      "",
      "{{resumo}}",
      "",
      "{{tabela_consultores}}",
      "",
      "[Abrir fechamento operacional]({{link}})",
      "",
      "Equipe {{app.nome}}",
    ),
    variables: vars(
      ["destinatario.nome", "projeto.nome", "cliente.nome", "competencia", "consultores.quantidade", "horas.total", "fechado_por.nome", "link"],
      ["resumo", "tabela_consultores"],
    ),
    sampleVars: () =>
      fechamentoOperacaoTemplateVars({
        recipientName: SAMPLE_NAME,
        projectName: "Portal de Atendimento",
        clientName: "ACME S.A.",
        periodLabel: "junho/2026",
        lines: [
          { consultantName: "João Pereira", hours: 64 },
          { consultantName: "Maria Lima", hours: 72 },
        ],
        totalHours: 136,
        closedByName: "Carla Souza",
        reviewUrl: `${SAMPLE_URL}/operacao/fechamento`,
      }),
  },

  FEED_POST_REPLIED: feedDefinition(
    "FEED_POST_REPLIED",
    "Feed: resposta ao seu post",
    "Alguém respondeu um post seu no Feed.",
    "reply",
  ),
  FEED_CONTENT_REACTED: feedDefinition(
    "FEED_CONTENT_REACTED",
    "Feed: reação ao seu conteúdo",
    "Alguém reagiu a um post/comentário seu no Feed.",
    "reaction",
  ),
  FEED_MENTIONED: feedDefinition(
    "FEED_MENTIONED",
    "Feed: você foi mencionado",
    "Alguém mencionou você (@) num post/comentário.",
    "mention",
  ),

  HOLIDAY_UPCOMING: {
    event: "HOLIDAY_UPCOMING",
    label: "Feriado próximo",
    group: "Horas e operação",
    description: "Job agendado: feriados que se aproximam no calendário.",
    audience: "Destinatários da regra (global ou por projeto)",
    sendsEmail: true,
    brand: "product",
    defaultTitle: "{{feriados.titulo}}",
    defaultSubject: "{{app.nome}} · {{feriados.descricao}}",
    defaultBody: body(
      "# {{feriados.titulo}}",
      "",
      "Olá, {{destinatario.nome}}.",
      "",
      "> Atenção: {{feriados.aviso}}. Planeje escalas, apontamento de horas e prazos.",
      "",
      "{{tabela_feriados}}",
      "",
      "[Abrir calendário]({{link}})",
      "",
      "Equipe {{app.nome}}",
    ),
    variables: vars(
      ["destinatario.nome", "feriados.quantidade", "feriados.titulo", "feriados.descricao", "feriados.aviso", "feriado.nome", "feriado.data", "janela.dias", "link"],
      ["tabela_feriados"],
    ),
    sampleVars: () =>
      feriadoProximoTemplateVars({
        recipientName: SAMPLE_NAME,
        holidays: [{ dateLabel: "07/09/2026", name: "Independência do Brasil", scopeLabel: "Nacional" }],
        daysAhead: 7,
        appUrl: `${SAMPLE_URL}/ausencias`,
      }),
  },

  MISSING_TIMESHEET_REPORT: {
    event: "MISSING_TIMESHEET_REPORT",
    label: "Ausência de lançamento (relatório)",
    group: "Horas e operação",
    description: "Relatório semanal de ausência de lançamento; o CSV segue sempre em anexo.",
    audience: "Lista de destinatários do relatório + regra",
    sendsEmail: true,
    brand: "product",
    defaultTitle: "Ausência de lançamento por projeto",
    defaultSubject: "{{app.nome}} · Ausência de lançamento por projeto ({{periodo}})",
    defaultBody: body(
      "# Ausência de lançamento por projeto",
      "",
      "Segue o relatório semanal de ausência de lançamento de horas por projeto.",
      "",
      ">! Foram identificados {{registros.quantidade}} registro(s) de ausência de lançamento no período.",
      "",
      "{{resumo}}",
      "",
      "O detalhamento por consultor e projeto está na planilha CSV em anexo.",
      "",
      "Equipe {{app.nome}}",
    ),
    variables: vars(["periodo", "registros.quantidade"], ["resumo"]),
    sampleVars: () =>
      missingTimesheetTemplateVars({
        periodStart: new Date(Date.UTC(2026, 5, 22)),
        periodEnd: new Date(Date.UTC(2026, 5, 26)),
        rowCount: 7,
      }),
  },

  ACCESS_INVITE: {
    event: "ACCESS_INVITE",
    label: "Convite de acesso",
    group: "Acesso",
    description: "Convite a um novo usuário e regeneração do link de acesso (mesmo template).",
    audience: "Pessoa convidada",
    sendsEmail: true,
    brand: "product",
    defaultTitle: "{{convite.assunto}}",
    defaultSubject: "{{app.nome}} · {{convite.assunto}}",
    defaultBody: body(
      "# {{convite.assunto}}",
      "",
      "{{saudacao}}",
      "",
      "{{convite.mensagem}}",
      "",
      "[Definir acesso]({{link}})",
      "",
      "{{convite.aviso}}",
      "",
      "Equipe {{app.nome}}",
    ),
    variables: vars([
      "saudacao",
      "destinatario.nome",
      "convite.assunto",
      "convite.mensagem",
      "convite.aviso",
      "link",
    ]),
    sampleVars: () =>
      accessInviteTemplateVars({
        link: "https://flow.jump.tec.br/convite/exemplo",
        recipientName: SAMPLE_NAME,
      }),
  },

  PRE_INVOICE_ISSUED: {
    event: "PRE_INVOICE_ISSUED",
    label: "Pré-fatura (cliente)",
    group: "Faturamento e cliente",
    description: "Pré-fatura de serviços enviada ao contato de cobrança do cliente (marca Jump).",
    audience: "Contatos de cobrança do cliente",
    sendsEmail: true,
    brand: "company",
    defaultTitle: "Pré-fatura — {{competencia}}",
    defaultSubject: "{{empresa.nome}} · Pré-fatura {{competencia}} — {{cliente.nome}}",
    defaultBody: body(
      "# Pré-fatura — {{competencia}}",
      "",
      "{{saudacao}}",
      "",
      "Segue a pré-fatura de serviços referente à competência de {{competencia}}.",
      "",
      "{{tabela_projetos}}",
      "",
      "{{totais}}",
      "",
      "Em caso de divergência, responda a este e-mail antes da emissão da nota fiscal.",
      "",
      "Atenciosamente,",
      "Equipe {{empresa.nome}}",
    ),
    variables: vars(
      ["saudacao", "contato.nome", "cliente.nome", "competencia", "valor.subtotal", "valor.total"],
      ["tabela_projetos", "totais"],
    ),
    sampleVars: () =>
      preInvoiceTemplateVars({
        contactName: "Sr. Roberto",
        preInvoice: {
          closingId: "exemplo",
          competence: "junho/2026",
          clientName: "ACME S.A.",
          clientDocument: "12.345.678/0001-90",
          municipality: "São Paulo",
          issRate: 5,
          lines: [
            { projectId: "p1", projectName: "Portal de Atendimento", hours: 120, unitRate: 300, amount: 36000 },
          ],
          servicesSubtotal: 36000,
          adjustmentAmount: 0,
          netServices: 36000,
          estimatedIss: 1800,
          total: 36000,
          generatedAt: "2026-07-01",
        },
      }),
  },

  NFSE_ISSUED: {
    event: "NFSE_ISSUED",
    label: "NFS-e emitida (cliente)",
    group: "Faturamento e cliente",
    description: "Aviso de NFS-e emitida enviado ao contato do cliente (marca Jump).",
    audience: "Contato do cliente",
    sendsEmail: true,
    brand: "company",
    defaultTitle: "NFS-e emitida — {{competencia}}",
    defaultSubject: "{{empresa.nome}} · NFS-e {{competencia}} — {{cliente.nome}}",
    defaultBody: body(
      "# NFS-e emitida — {{competencia}}",
      "",
      "{{saudacao}}",
      "",
      "A NFS-e referente à competência de {{competencia}} foi emitida.",
      "",
      "{{resumo}}",
      "",
      "Os documentos (XML e PDF) ficam disponíveis na plataforma.",
      "",
      "Atenciosamente,",
      "Equipe {{empresa.nome}}",
    ),
    variables: vars(
      ["saudacao", "contato.nome", "cliente.nome", "competencia", "nfse.numero", "nfse.protocolo"],
      ["resumo"],
    ),
    sampleVars: () =>
      nfseTemplateVars({
        clientName: "ACME S.A.",
        competenceLabel: "06/2026",
        invoiceNumber: "2026/000123",
        protocol: "SP-987654321",
        contactName: "Sr. Roberto",
      }),
  },

  PAYMENT_FORECAST: {
    event: "PAYMENT_FORECAST",
    label: "Previsão de pagamento (consultor)",
    group: "Pagamentos",
    description: "Previsão de pagamento da competência enviada ao consultor.",
    audience: "Consultor",
    sendsEmail: true,
    brand: "product",
    defaultTitle: "Previsão de pagamento",
    defaultSubject: "{{app.nome}} · Previsão de pagamento — {{competencia}}",
    defaultBody: body(
      "# Previsão de pagamento",
      "",
      "Olá, {{consultor.nome}}.",
      "",
      "Segue a previsão de pagamento referente à competência {{competencia}}.",
      "",
      "{{kpi_total}}",
      "",
      "{{tabela_projetos}}",
      "",
      "{{datas}}",
      "",
      "Responda a este e-mail caso haja divergência nos valores.",
      "",
      "Equipe {{app.nome}}",
    ),
    variables: vars(
      ["consultor.nome", "destinatario.nome", "competencia", "valor.total", "pagamento.data_prevista", "pagamento.prazo_retorno"],
      ["kpi_total", "tabela_projetos", "datas"],
    ),
    sampleVars: () =>
      paymentForecastTemplateVars({
        consultantName: SAMPLE_NAME,
        month: 6,
        year: 2026,
        totalAmount: 21600,
        expectedPaymentAt: "2026-07-05",
        responseDeadlineAt: "2026-07-02",
        projectLines: [{ projectName: "Portal de Atendimento", hours: 72, unitRate: 300, amount: 21600 }],
      }),
  },

  CONSULTANT_INVOICE_REQUEST: {
    event: "CONSULTANT_INVOICE_REQUEST",
    label: "Solicitação de NF (consultor)",
    group: "Pagamentos",
    description: "O Financeiro pede a nota fiscal do consultor PJ para seguir com o pagamento.",
    audience: "Consultor PJ",
    sendsEmail: true,
    brand: "product",
    defaultTitle: "Solicitação de nota fiscal",
    defaultSubject: "{{app.nome}} · Envie sua NF — competência {{competencia}}",
    defaultBody: body(
      "# Solicitação de nota fiscal",
      "",
      "Olá, {{consultor.nome}}.",
      "",
      "Para seguirmos com o seu pagamento referente à competência {{competencia}}, precisamos {{nf.solicitacao}}.",
      "",
      "{{kpi_valor}}",
      "",
      "{{resumo}}",
      "",
      "{{tabela_projetos}}",
      "",
      "{{nf.instrucao}}",
      "",
      "[Abrir Minhas Notas]({{link}})",
      "",
      "Equipe {{app.nome}}",
    ),
    variables: vars(
      ["consultor.nome", "destinatario.nome", "competencia", "valor.previsto", "projetos.quantidade", "nf.solicitacao", "nf.instrucao", "link"],
      ["kpi_valor", "resumo", "tabela_projetos"],
    ),
    sampleVars: () =>
      consultantInvoiceRequestTemplateVars({
        consultantName: SAMPLE_NAME,
        month: 6,
        year: 2026,
        expectedAmount: 21600,
        notasUrl: `${SAMPLE_URL}/minhas-notas`,
        projects: [
          { projectName: "Portal de Atendimento", clientName: "ACME S.A.", hours: 40, amount: 12000 },
          { projectName: "App Mobile", clientName: "Globex", hours: 32, amount: 9600 },
        ],
      }),
  },

  PAYMENT_RELEASED_BY_PEOPLE: genericDefinition({
    event: "PAYMENT_RELEASED_BY_PEOPLE",
    label: "Pagamentos liberados pelo DP (Financeiro)",
    group: "Pagamentos",
    description:
      "DP/People liberou pagamentos e o Financeiro é avisado (lista de consultores, sem valores).",
    audience: "Destinatários da regra (padrão: papel FINANCE)",
    sample: () => ({
      titulo: "DP liberou 2 pagamento(s) — junho/2026",
      conteudo: joinBlocks(
        paragraph(`Olá, ${SAMPLE_NAME}.`),
        paragraph(
          "Carla Souza (DP) liberou 2 pagamento(s) de consultores. O próximo passo é do Financeiro: enviar a solicitação de NF aos consultores PJ.",
        ),
        dataTable(
          ["Consultor", "Contratação", "Competência"],
          [
            ["João Pereira", "PJ", "junho/2026"],
            ["Maria Lima", "CLT FLEX", "junho/2026"],
          ],
        ),
        button("Abrir Pagamentos", `${SAMPLE_URL}/pagamentos`),
      ),
    }),
  }),
  SLA_DEADLINE_APPROACHING: genericDefinition({
    event: "SLA_DEADLINE_APPROACHING",
    label: "SLA: prazo de etapa se aproximando",
    group: "SLA",
    description: "Job diário de SLA: etapa do fluxo de horas perto do prazo, com as pendências.",
    audience: "Destinatários da regra (padrão: AREA_MANAGER, PEOPLE, FINANCE)",
    sample: () => ({
      titulo: "SLA: Aprovação de horas — faltam 2 dias úteis (prazo 03/07)",
      conteudo: slaSampleContent("warning", "Prazo se aproximando com 3 pendência(s)."),
    }),
  }),
  SLA_OVERDUE: genericDefinition({
    event: "SLA_OVERDUE",
    label: "SLA: etapa com prazo vencido",
    group: "SLA",
    description: "Job diário de SLA: etapa com prazo vencido (cobrança diária até concluir).",
    audience: "Destinatários da regra (padrão: AREA_MANAGER, PEOPLE, FINANCE)",
    sample: () => ({
      titulo: "SLA atrasado: Aprovação de horas — 1 dia útil (prazo 03/07)",
      conteudo: slaSampleContent(
        "error",
        "Etapa com prazo vencido e 3 pendência(s). Priorize a regularização.",
      ),
    }),
  }),
};

export function getTemplateDefinition(event: NotificationEventName): TemplateDefinition {
  return DEFINITIONS[event];
}

export function getEmailTemplateDefinition(
  event: string,
): EmailTemplateDefinition | null {
  if (!isNotificationEventName(event)) return null;
  const def = DEFINITIONS[event];
  return def.sendsEmail ? def : null;
}

export function listTemplateDefinitions(): TemplateDefinition[] {
  return NOTIFICATION_EVENTS.map((e) => DEFINITIONS[e]);
}

export function blockKeysOf(def: EmailTemplateDefinition): string[] {
  return def.variables.filter((v) => v.block).map((v) => v.key);
}

export function variableKeysOf(def: EmailTemplateDefinition): string[] {
  return def.variables.map((v) => v.key);
}
