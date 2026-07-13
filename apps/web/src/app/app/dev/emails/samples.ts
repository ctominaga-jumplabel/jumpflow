/**
 * Sample payloads for the dev email preview/test tool (`/app/dev/emails`).
 * Shared by the preview page and the send-test action so what you SEE is what
 * you SEND. Pure data — no DB, safe to import on server.
 */
import {
  buildAccessInviteEmail,
  buildAlertaHoraExtraEmail,
  buildApuracaoClienteEmail,
  buildContratoAusenteEmail,
  buildFaturamentoPendenteEmail,
  buildFechamentoOperacaoEmail,
  buildLiberacaoEmail,
  buildMissingTimesheetEmail,
  buildNfseEmail,
  buildPaymentForecastEmail,
  buildPreInvoiceEmail,
  buildProjetoCriadoEmail,
  type BuiltEmail,
} from "@/lib/automation/email/templates";

export interface SampleEmail {
  key: string;
  label: string;
  build: (recipientName: string) => BuiltEmail;
}

export const SAMPLE_EMAILS: SampleEmail[] = [
  {
    key: "liberacao",
    label: "Liberação de horas",
    build: (name) =>
      buildLiberacaoEmail({
        recipientName: name,
        projectName: "Portal de Atendimento",
        clientName: "ACME S.A.",
        periodLabel: "junho/2026",
        totalHours: 186,
        consultantsCount: 4,
        exceptions: [
          "Hora extra: 4h — João Pereira (PJ)",
          "Sobreaviso: 2h — Maria Lima (CLT)",
        ],
        reviewUrl: "https://jumpflow.example/app/aprovacoes",
      }),
  },
  {
    key: "apuracao",
    label: "Apuração ao cliente",
    build: () =>
      buildApuracaoClienteEmail({
        clientContactName: "Sr. Roberto",
        clientName: "ACME S.A.",
        projectName: "Portal de Atendimento",
        competenceLabel: "junho/2026",
        lines: [
          { consultantName: "João Pereira", hours: 64, amount: 19200 },
          { consultantName: "Maria Lima", hours: 72, amount: 21600 },
          { consultantName: "Carla Souza", hours: 50, amount: 15000 },
        ],
        totalHours: 186,
        totalAmount: 55800,
        showValues: true,
      }),
  },
  {
    key: "alerta-he",
    label: "Alerta de hora extra",
    build: (name) =>
      buildAlertaHoraExtraEmail({
        recipientName: name,
        competenceLabel: "junho/2026",
        lines: [
          {
            consultantName: "Maria Lima",
            contractType: "CLT",
            projectName: "Portal de Atendimento",
            overtimeHours: 6,
          },
          {
            consultantName: "Carla Souza",
            contractType: "CLT_FLEX",
            projectName: "App Mobile",
            overtimeHours: 3,
          },
          {
            consultantName: "João Pereira",
            contractType: "PJ",
            projectName: "Portal de Atendimento",
            overtimeHours: 8,
          },
        ],
      }),
  },
  {
    key: "projeto-criado",
    label: "Novo projeto",
    build: (name) =>
      buildProjetoCriadoEmail({
        recipientName: name,
        projectName: "Data Lake Corporativo",
        clientName: "Banco Beta",
        managerName: "Fernanda Alves",
        hasCommercialContract: false,
        projectUrl: "https://jumpflow.example/app/projetos/123",
      }),
  },
  {
    key: "fechamento-operacao",
    label: "Fechamento operacional (DP)",
    build: (name) =>
      buildFechamentoOperacaoEmail({
        recipientName: name,
        projectName: "Portal de Atendimento",
        clientName: "ACME S.A.",
        periodLabel: "junho/2026",
        lines: [
          { consultantName: "João Pereira", hours: 168 },
          { consultantName: "Maria Lima", hours: 176 },
          { consultantName: "Carla Souza", hours: 152 },
        ],
        totalHours: 496,
        closedByName: "Fernanda Alves",
        reviewUrl: "https://jumpflow.example/app/operacao/fechamento",
      }),
  },
  {
    key: "faturamento-pendente",
    label: "Faturamento pendente",
    build: (name) =>
      buildFaturamentoPendenteEmail({
        recipientName: name,
        lines: [
          {
            projectName: "Portal de Atendimento",
            clientName: "ACME S.A.",
            competenceLabel: "maio/2026",
            amount: 55800,
            daysOpen: 18,
          },
          {
            projectName: "App Mobile",
            clientName: "Loja Gama",
            competenceLabel: "maio/2026",
            amount: 32000,
            daysOpen: 25,
          },
        ],
        appUrl: "https://jumpflow.example/app/financeiro",
      }),
  },
  {
    key: "contrato-ausente",
    label: "Contrato comercial ausente",
    build: (name) =>
      buildContratoAusenteEmail({
        recipientName: name,
        projectName: "Data Lake Corporativo",
        clientName: "Banco Beta",
        projectUrl: "https://jumpflow.example/app/comercial/123",
      }),
  },
  {
    key: "ausencia-lancamento",
    label: "Ausência de lançamento (relatório)",
    build: () =>
      buildMissingTimesheetEmail({
        periodStart: new Date("2026-07-06T00:00:00Z"),
        periodEnd: new Date("2026-07-13T00:00:00Z"),
        rowCount: 6,
      }),
  },
  {
    key: "convite-acesso",
    label: "Convite de acesso",
    build: (name) =>
      buildAccessInviteEmail({
        link: "https://jumpflow.example/convite/abc123",
        recipientName: name,
      }),
  },
  {
    key: "pre-fatura",
    label: "Pré-fatura (cliente · Jump)",
    build: () =>
      buildPreInvoiceEmail({
        contactName: "Sr. Roberto",
        preInvoice: {
          closingId: "seed-closing-1",
          competence: "junho/2026",
          clientName: "ACME S.A.",
          clientDocument: "12.345.678/0001-90",
          municipality: "São Paulo",
          issRate: 5,
          lines: [
            {
              projectId: "p1",
              projectName: "Portal de Atendimento",
              hours: 120,
              unitRate: 300,
              amount: 36000,
            },
            {
              projectId: "p2",
              projectName: "App Mobile",
              hours: 66,
              unitRate: 300,
              amount: 19800,
            },
          ],
          servicesSubtotal: 55800,
          adjustmentAmount: 0,
          netServices: 55800,
          estimatedIss: 2790,
          total: 55800,
          generatedAt: "2026-07-01",
        },
      }),
  },
  {
    key: "nfse-emitida",
    label: "NFS-e emitida (cliente · Jump)",
    build: () =>
      buildNfseEmail({
        clientName: "ACME S.A.",
        competenceLabel: "06/2026",
        invoiceNumber: "2026/000123",
        protocol: "SP-987654321",
        contactName: "Sr. Roberto",
      }),
  },
  {
    key: "previsao-pagamento",
    label: "Previsão de pagamento (consultor)",
    build: (name) =>
      buildPaymentForecastEmail({
        consultantName: name,
        month: 6,
        year: 2026,
        totalAmount: 21600,
        expectedPaymentAt: "2026-07-05",
        responseDeadlineAt: "2026-07-02",
        projectLines: [
          {
            projectName: "Portal de Atendimento",
            hours: 72,
            unitRate: 300,
            amount: 21600,
          },
        ],
      }),
  },
];

export function findSample(key: string): SampleEmail | undefined {
  return SAMPLE_EMAILS.find((s) => s.key === key);
}
