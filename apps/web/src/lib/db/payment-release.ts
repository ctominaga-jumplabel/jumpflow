/**
 * Governança do Fluxo de Horas — etapa DP/People no pagamento de consultores.
 *
 *   OPEN ("Aguardando DP")
 *     → DP/People libera (PAGAMENTOS_LIBERACAO_DP)        → PEOPLE_RELEASED
 *     → Financeiro envia a solicitação de NF (PAGAMENTOS_ENVIO_NF)
 *                                                          → WAITING_FOR_INVOICE
 *   Reabrir a liberação (PAGAMENTOS_REABRIR_LIBERACAO, só Financeiro):
 *     PEOPLE_RELEASED / WAITING_FOR_INVOICE → OPEN, enquanto nenhuma NF chegou.
 *
 * RBAC é responsabilidade das server actions (Matriz de Permissões); aqui ficam
 * as mutações condicionais por status (à prova de corrida), a auditoria e as
 * notificações. Fonte de verdade dos valores: o próprio ConsultantPayment
 * (gerado no fechamento operacional) — esta etapa NÃO recalcula valores.
 */
import { createHash } from "node:crypto";
import { prisma, type Prisma } from "@jumpflow/database";
import { appConfig } from "@/config/app";
import {
  button,
  dataTable,
  paragraph,
} from "@/lib/automation/email/layout";
import { emitNotification } from "@/lib/automation/notifications/emit";
import { buildAuditEventData } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { createInAppNotifications } from "@/lib/db/notifications";
import {
  sendConsultantInvoiceRequest,
  type ConsultantInvoiceRequestResult,
} from "@/lib/db/payments";
import { formatMonth } from "@/lib/format";
import {
  canReopenPeopleRelease,
  consultantPaymentTransitions,
  PEOPLE_RELEASED_OR_BEYOND,
  type ConsultantPaymentStatus,
} from "@/lib/payments/state-machine";

/**
 * Mesmo recorte da tela de Pagamentos (P18): as ações EM MASSA por competência
 * só alcançam o que está na tela (PJ/CLT_FLEX). Ids explícitos não sofrem o
 * recorte (o status ainda é checado).
 */
const BULK_CONTRACT_TYPES = ["PJ", "CLT_FLEX"] as const;

const contractLabels: Record<string, string> = {
  CLT: "CLT",
  PJ: "PJ",
  CLT_FLEX: "CLT Flex",
};

export class PaymentReleaseError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "INVALID_STATE",
    message: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Liberação pelo DP/People
// ---------------------------------------------------------------------------

export interface PeopleReleaseInput {
  /** Ids explícitos (linha única ou seleção). Tem precedência sobre o mês. */
  paymentIds?: string[];
  /** Competência inteira (todos os Aguardando DP de PJ/CLT_FLEX). */
  month?: number;
  year?: number;
  actorUserId: string | null;
  actorName?: string | null;
}

export interface PeopleReleaseResult {
  released: number;
  /** Encontrados mas fora de "Aguardando DP" (já liberados, cancelados...). */
  skipped: number;
  /** Ids pedidos que não existem. */
  notFound: number;
  /**
   * Em "Aguardando DP" mas com projeto cujo fechamento operacional da
   * competência NÃO está fechado — o DP só libera o que a Operação fechou.
   */
  waitingOperationClosing: number;
  /** Projetos (nomes) que seguram a liberação — para a mensagem da tela. */
  waitingProjects: string[];
  /** Liberados que já tinham NF anexada e foram direto para NF recebida. */
  invoiceAlreadyReceived: number;
  releasedIds: string[];
}

const EMPTY_RELEASE_RESULT: PeopleReleaseResult = {
  released: 0,
  skipped: 0,
  notFound: 0,
  waitingOperationClosing: 0,
  waitingProjects: [],
  invoiceAlreadyReceived: 0,
  releasedIds: [],
};

export async function releasePaymentsByPeople(
  input: PeopleReleaseInput,
): Promise<PeopleReleaseResult> {
  const transition = consultantPaymentTransitions.RELEASE_BY_PEOPLE;
  const byIds = input.paymentIds && input.paymentIds.length > 0;
  if (!byIds && (!input.month || !input.year)) {
    return { ...EMPTY_RELEASE_RESULT, waitingProjects: [] };
  }
  const rows = await prisma.consultantPayment.findMany({
    where: byIds
      ? { id: { in: input.paymentIds } }
      : {
          month: input.month,
          year: input.year,
          contractType: { in: [...BULK_CONTRACT_TYPES] },
        },
    select: {
      id: true,
      status: true,
      month: true,
      year: true,
      contractType: true,
      consultant: { select: { name: true } },
      lines: {
        select: { projectId: true, project: { select: { name: true } } },
      },
      _count: { select: { invoiceAttachments: true } },
    },
  });

  const now = new Date();
  const released: typeof rows = [];
  let skipped = 0;
  let waitingOperationClosing = 0;
  let invoiceAlreadyReceived = 0;
  const waitingProjects = new Set<string>();
  for (const row of rows) {
    if (!transition.expected.includes(row.status)) {
      skipped += 1;
      continue;
    }
    const projects = new Map<string, string>();
    for (const line of row.lines) {
      if (line.projectId) {
        projects.set(line.projectId, line.project?.name ?? "Projeto");
      }
    }
    const projectIds = [...projects.keys()];
    // NF já anexada (consultor adiantou, ainda em Aguardando DP): a liberação
    // leva direto para NF recebida — sem pedir de novo a NF (só PJ/CLT_FLEX).
    const invoiceAttached =
      row.contractType !== "CLT" && row._count.invoiceAttachments > 0;
    const nextStatus = invoiceAttached ? "INVOICE_RECEIVED" : transition.next;

    const outcome = await prisma.$transaction(async (tx) => {
      // Gate do fechamento operacional + TRAVA de linha: o updateMany nos
      // OperationClosing CLOSED do(s) projeto(s) bloqueia um `reopenOperation`
      // concorrente até este commit (e vice-versa: se a reabertura vier
      // antes, o status já não é CLOSED e a contagem não bate). À prova de
      // corrida em READ COMMITTED.
      if (projectIds.length > 0) {
        const locked = await tx.operationClosing.updateMany({
          where: {
            projectId: { in: projectIds },
            month: row.month,
            year: row.year,
            status: "CLOSED",
          },
          data: { updatedAt: now },
        });
        if (locked.count !== projectIds.length) {
          const closed = await tx.operationClosing.findMany({
            where: {
              projectId: { in: projectIds },
              month: row.month,
              year: row.year,
              status: "CLOSED",
            },
            select: { projectId: true },
          });
          const closedIds = new Set(closed.map((c) => c.projectId));
          return {
            kind: "WAITING" as const,
            projects: projectIds
              .filter((id) => !closedIds.has(id))
              .map((id) => projects.get(id) ?? "Projeto"),
          };
        }
      }
      const updated = await tx.consultantPayment.updateMany({
        where: { id: row.id, status: { in: [...transition.expected] } },
        data: {
          status: nextStatus,
          peopleReleasedAt: now,
          peopleReleasedByUserId: input.actorUserId,
          ...(invoiceAttached ? { invoiceReceivedAt: now } : {}),
        },
      });
      if (updated.count !== 1) return { kind: "SKIPPED" as const };
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: input.actorUserId,
          entityType: "ConsultantPayment",
          entityId: row.id,
          action: transition.auditAction,
          before: { status: row.status },
          after: {
            status: nextStatus,
            peopleReleasedAt: now.toISOString(),
            month: row.month,
            year: row.year,
            bulk: !byIds || (input.paymentIds?.length ?? 0) > 1,
            ...(invoiceAttached
              ? {
                  invoiceAlreadyAttached: true,
                  invoiceReceivedAt: now.toISOString(),
                }
              : {}),
          },
        }),
      });
      return { kind: "RELEASED" as const };
    });
    if (outcome.kind === "RELEASED") {
      released.push(row);
      if (invoiceAttached) invoiceAlreadyReceived += 1;
    } else if (outcome.kind === "WAITING") {
      waitingOperationClosing += 1;
      for (const name of outcome.projects) waitingProjects.add(name);
    } else {
      skipped += 1;
    }
  }

  const notFound = byIds
    ? Math.max(0, new Set(input.paymentIds).size - rows.length)
    : 0;

  if (released.length > 0) {
    // UM e-mail agregado por ação (não um por pagamento).
    await notifyPaymentsReleasedByPeople({
      releasedAt: now,
      actorName: input.actorName ?? null,
      payments: released.map((row) => ({
        id: row.id,
        consultantName: row.consultant.name,
        contractType: row.contractType,
        month: row.month,
        year: row.year,
      })),
    });
  }

  return {
    released: released.length,
    skipped,
    notFound,
    waitingOperationClosing,
    waitingProjects: [...waitingProjects].sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    ),
    invoiceAlreadyReceived,
    releasedIds: released.map((row) => row.id),
  };
}

/**
 * PAYMENT_RELEASED_BY_PEOPLE → Financeiro (regra padrão ROLE FINANCE). Um
 * único fragmento por destinatário com a lista de pagamentos liberados. O
 * e-mail NÃO carrega valores em R$ (só consultor/contratação/competência): o
 * Financeiro confere os valores na tela, com RBAC. Best-effort (emit engole).
 */
export async function notifyPaymentsReleasedByPeople(input: {
  releasedAt: Date;
  actorName: string | null;
  payments: Array<{
    id: string;
    consultantName: string;
    contractType: string;
    month: number;
    year: number;
  }>;
}): Promise<void> {
  if (input.payments.length === 0) return;
  const competences = [
    ...new Set(input.payments.map((p) => formatMonth(p.month, p.year))),
  ];
  const first = input.payments[0];
  const link = appConfig.url
    ? `${appConfig.url}/app/pagamentos?status=PEOPLE_RELEASED&month=${first.month}&year=${first.year}`
    : null;
  const count = input.payments.length;
  const title = `DP liberou ${count} pagamento(s) — ${competences.join(", ")}`;
  const idsHash = createHash("sha1")
    .update(
      input.payments
        .map((p) => p.id)
        .sort()
        .join(","),
    )
    .digest("hex")
    .slice(0, 12);

  await emitNotification({
    event: "PAYMENT_RELEASED_BY_PEOPLE",
    scope: { type: "GLOBAL" },
    context: {},
    dedupeKey: `${input.releasedAt.toISOString()}:${idsHash}`,
    buildFragment: (recipient) => ({
      recipient,
      title,
      blocks: [
        paragraph(`Olá, ${recipient.name ?? "equipe"}.`),
        paragraph(
          `${input.actorName ? `${input.actorName} (DP)` : "O DP"} liberou ${count} pagamento(s) de consultores. O próximo passo é do Financeiro: enviar a solicitação de NF aos consultores PJ.`,
        ),
        dataTable(
          ["Consultor", "Contratação", "Competência"],
          input.payments.map((p) => [
            p.consultantName,
            contractLabels[p.contractType] ?? p.contractType,
            formatMonth(p.month, p.year),
          ]),
        ),
        ...(link ? [button("Abrir Pagamentos", link)] : []),
      ],
      teamsText: title,
    }),
  });
}

// ---------------------------------------------------------------------------
// Reabertura da liberação (só Financeiro)
// ---------------------------------------------------------------------------

export async function reopenPeopleRelease(input: {
  paymentId: string;
  justification: string;
  actorUserId: string | null;
  actorName?: string | null;
}): Promise<{ id: string; status: ConsultantPaymentStatus }> {
  const transition = consultantPaymentTransitions.REOPEN_RELEASE;
  const payment = await prisma.consultantPayment.findUnique({
    where: { id: input.paymentId },
    select: {
      id: true,
      status: true,
      month: true,
      year: true,
      invoiceReceivedAt: true,
      peopleReleasedAt: true,
      peopleReleasedByUserId: true,
      invoiceRequestSentAt: true,
      consultant: { select: { name: true } },
    },
  });
  if (!payment) {
    throw new PaymentReleaseError("NOT_FOUND", "Pagamento nao encontrado.");
  }
  if (!canReopenPeopleRelease(payment)) {
    throw new PaymentReleaseError(
      "INVALID_STATE",
      "Só é possível reabrir a liberação antes do recebimento da NF (Liberado pelo DP ou Aguardando NF).",
    );
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.consultantPayment.updateMany({
      where: {
        id: payment.id,
        status: { in: [...transition.expected] },
        invoiceReceivedAt: null,
      },
      data: {
        status: transition.next,
        peopleReleasedAt: null,
        peopleReleasedByUserId: null,
        invoiceRequestSentAt: null,
      },
    });
    if (updated.count !== 1) {
      throw new PaymentReleaseError(
        "INVALID_STATE",
        "O pagamento mudou de status; atualize a tela e tente novamente.",
      );
    }
    await tx.auditEvent.create({
      data: buildAuditEventData({
        actorUserId: input.actorUserId,
        entityType: "ConsultantPayment",
        entityId: payment.id,
        action: transition.auditAction,
        before: {
          status: payment.status,
          peopleReleasedAt: payment.peopleReleasedAt?.toISOString() ?? null,
          peopleReleasedByUserId: payment.peopleReleasedByUserId,
          invoiceRequestSentAt:
            payment.invoiceRequestSentAt?.toISOString() ?? null,
        },
        after: { status: transition.next, justification: input.justification },
      }),
    });
  });

  await notifyPeopleOfReleaseReopened({
    releasedByUserId: payment.peopleReleasedByUserId,
    consultantName: payment.consultant.name,
    month: payment.month,
    year: payment.year,
    justification: input.justification,
    actorName: input.actorName ?? null,
  });

  return { id: payment.id, status: transition.next };
}

/** Usuários ATIVOS do DP/People (+ quem liberou), para avisos in-app. */
async function peopleRecipientIds(extra: (string | null)[] = []) {
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      roles: { some: { role: { name: "PEOPLE" } } },
    },
    select: { id: true },
  });
  const ids = new Set(users.map((u) => u.id));
  for (const id of extra) if (id) ids.add(id);
  return [...ids];
}

/**
 * Aviso IN-APP ao DP/People de que o Financeiro reabriu uma liberação. Sem
 * evento/regra próprios (schema fechado): reusa PAYMENT_RELEASED_BY_PEOPLE
 * (mesmo domínio). Best-effort: nunca lança.
 */
async function notifyPeopleOfReleaseReopened(input: {
  releasedByUserId: string | null;
  consultantName: string;
  month: number;
  year: number;
  justification: string;
  actorName: string | null;
}): Promise<void> {
  if (!isDatabaseConfigured()) return;
  try {
    const userIds = await peopleRecipientIds([input.releasedByUserId]);
    if (userIds.length === 0) return;
    const period = formatMonth(input.month, input.year);
    await createInAppNotifications(
      userIds.map((userId) => ({
        userId,
        event: "PAYMENT_RELEASED_BY_PEOPLE",
        title: `Liberação reaberta — ${input.consultantName} (${period})`,
        body: `O Financeiro${input.actorName ? ` (${input.actorName})` : ""} devolveu a liberação do pagamento de ${input.consultantName} (${period}) para "Aguardando DP".\nJustificativa: ${input.justification}`,
        href: `/app/pagamentos?status=OPEN&month=${input.month}&year=${input.year}`,
      })),
    );
  } catch (error) {
    console.error("[pagamentos] reopen release notification failed", error);
  }
}

// ---------------------------------------------------------------------------
// Solicitação de NF (Financeiro)
// ---------------------------------------------------------------------------

export type InvoiceRequestOutcome =
  | ConsultantInvoiceRequestResult["status"]
  /** Ainda em "Aguardando DP": o DP precisa liberar antes. */
  | "NOT_RELEASED"
  /** CLT_FLEX: solicitação registrada (status avançou) sem e-mail (só PJ). */
  | "REQUESTED_NO_EMAIL"
  /** A NF já estava anexada: foi direto para NF recebida, sem e-mail. */
  | "INVOICE_ALREADY_RECEIVED";

/**
 * Envia a solicitação de NF de UM pagamento. Em "Liberado pelo DP" faz a
 * transição REQUEST_INVOICE (→ Aguardando NF, `invoiceRequestSentAt`) e, se
 * PJ, dispara o e-mail (force: novo ciclo após uma eventual reabertura). Em
 * "Aguardando NF" apenas reenvia (idempotente). Antes da liberação do DP:
 * NOT_RELEASED, sem efeito.
 */
export async function requestInvoiceForPayment(input: {
  paymentId: string;
  actorUserId: string | null;
}): Promise<{ status: InvoiceRequestOutcome; transitioned: boolean }> {
  const transition = consultantPaymentTransitions.REQUEST_INVOICE;
  const payment = await prisma.consultantPayment.findUnique({
    where: { id: input.paymentId },
    select: {
      id: true,
      status: true,
      contractType: true,
      _count: { select: { invoiceAttachments: true } },
    },
  });
  if (!payment) return { status: "NOT_FOUND", transitioned: false };
  if (payment.contractType === "CLT") {
    return { status: "NOT_PJ", transitioned: false };
  }
  if (payment.status === "OPEN") {
    return { status: "NOT_RELEASED", transitioned: false };
  }

  if (payment.status === "WAITING_FOR_INVOICE") {
    if (payment.contractType !== "PJ") {
      return { status: "NOT_PJ", transitioned: false };
    }
    const resent = await sendConsultantInvoiceRequest({
      paymentId: payment.id,
      actorUserId: input.actorUserId,
    });
    return { status: resent.status, transitioned: false };
  }

  if (!transition.expected.includes(payment.status)) {
    return { status: "NOT_ELIGIBLE", transitioned: false };
  }

  const now = new Date();
  // NF já anexada: não pede de novo — vai direto para NF recebida.
  if (payment._count.invoiceAttachments > 0) {
    const received = await prisma.$transaction(async (tx) => {
      const updated = await tx.consultantPayment.updateMany({
        where: { id: payment.id, status: { in: [...transition.expected] } },
        data: { status: "INVOICE_RECEIVED", invoiceReceivedAt: now },
      });
      if (updated.count !== 1) return false;
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: input.actorUserId,
          entityType: "ConsultantPayment",
          entityId: payment.id,
          action: "CONSULTANT_PAYMENT_INVOICE_RECEIVED",
          before: { status: payment.status },
          after: {
            status: "INVOICE_RECEIVED",
            invoiceReceivedAt: now.toISOString(),
            invoiceAlreadyAttached: true,
          },
        }),
      });
      return true;
    });
    return received
      ? { status: "INVOICE_ALREADY_RECEIVED", transitioned: true }
      : { status: "NOT_ELIGIBLE", transitioned: false };
  }

  const moved = await prisma.$transaction(async (tx) => {
    const updated = await tx.consultantPayment.updateMany({
      where: { id: payment.id, status: { in: [...transition.expected] } },
      data: { status: transition.next, invoiceRequestSentAt: now },
    });
    if (updated.count !== 1) return false;
    await tx.auditEvent.create({
      data: buildAuditEventData({
        actorUserId: input.actorUserId,
        entityType: "ConsultantPayment",
        entityId: payment.id,
        action: transition.auditAction,
        before: { status: payment.status },
        after: { status: transition.next, invoiceRequestSentAt: now.toISOString() },
      }),
    });
    return true;
  });
  if (!moved) return { status: "NOT_ELIGIBLE", transitioned: false };

  if (payment.contractType !== "PJ") {
    return { status: "REQUESTED_NO_EMAIL", transitioned: true };
  }
  try {
    const sent = await sendConsultantInvoiceRequest({
      paymentId: payment.id,
      actorUserId: input.actorUserId,
      force: true,
    });
    return { status: sent.status, transitioned: true };
  } catch (error) {
    // A transição já foi commitada; o reenvio fica disponível na tela.
    console.error("[pagamentos] failed to send invoice request email", error);
    return { status: "SKIPPED_NO_RULE", transitioned: true };
  }
}

export interface RequestInvoicesResult {
  /** Pagamentos Liberados pelo DP processados. */
  eligible: number;
  /** E-mails enviados (PJ) + solicitações registradas sem e-mail (CLT_FLEX). */
  sent: number;
  /** Liberados mas sem envio (sem regra, falha, já enviado). */
  skipped: number;
  /** Ainda em "Aguardando DP" — o DP precisa liberar antes. */
  notReleased: number;
  /** Já além da solicitação (Aguardando NF ou depois) / cancelados. */
  alreadyRequested: number;
  /** Liberados que já tinham NF anexada: foram para NF recebida sem e-mail. */
  invoiceAlreadyReceived: number;
}

/**
 * Massa: "Enviar solicitação de NF" do mês (ou de uma seleção). SÓ pagamentos
 * Liberados pelo DP; os demais são pulados e contados.
 */
export async function requestConsultantInvoices(input: {
  month: number;
  year: number;
  paymentIds?: string[];
  actorUserId: string | null;
}): Promise<RequestInvoicesResult> {
  const rows = await prisma.consultantPayment.findMany({
    where: {
      month: input.month,
      year: input.year,
      contractType: { in: [...BULK_CONTRACT_TYPES] },
      ...(input.paymentIds && input.paymentIds.length > 0
        ? { id: { in: input.paymentIds } }
        : {}),
    },
    select: { id: true, status: true },
  });

  const result: RequestInvoicesResult = {
    eligible: 0,
    sent: 0,
    skipped: 0,
    notReleased: 0,
    alreadyRequested: 0,
    invoiceAlreadyReceived: 0,
  };
  for (const row of rows) {
    if (row.status === "OPEN") {
      result.notReleased += 1;
      continue;
    }
    if (row.status !== "PEOPLE_RELEASED") {
      result.alreadyRequested += 1;
      continue;
    }
    result.eligible += 1;
    const outcome = await requestInvoiceForPayment({
      paymentId: row.id,
      actorUserId: input.actorUserId,
    });
    if (outcome.status === "SENT" || outcome.status === "REQUESTED_NO_EMAIL") {
      result.sent += 1;
    } else if (outcome.status === "INVOICE_ALREADY_RECEIVED") {
      result.invoiceAlreadyReceived += 1;
    } else {
      result.skipped += 1;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Fechamento operacional ↔ pagamentos
// ---------------------------------------------------------------------------

/**
 * Pagamentos do projeto/competência que JÁ passaram pela liberação do DP (ou
 * além). Enquanto houver algum, o fechamento operacional não pode ser reaberto:
 * só a etapa a jusante devolve (Financeiro reabre a liberação primeiro).
 */
export async function findReleasedPaymentsForProjectMonth(
  input: {
    projectId: string;
    month: number;
    year: number;
  },
  /** Cliente transacional (para checar DENTRO da transação de reabertura). */
  client: Pick<Prisma.TransactionClient, "consultantPayment"> = prisma,
): Promise<
  { id: string; consultantName: string; status: ConsultantPaymentStatus }[]
> {
  const rows = await client.consultantPayment.findMany({
    where: {
      month: input.month,
      year: input.year,
      status: { in: [...PEOPLE_RELEASED_OR_BEYOND] },
      lines: { some: { projectId: input.projectId } },
    },
    select: { id: true, status: true, consultant: { select: { name: true } } },
    orderBy: [{ consultant: { name: "asc" } }],
  });
  return rows.map((row) => ({
    id: row.id,
    consultantName: row.consultant.name,
    status: row.status,
  }));
}

/**
 * Aviso IN-APP ao DP/People de que um fechamento operacional foi reaberto (os
 * pagamentos "Aguardando DP" daquele projeto serão recalculados no próximo
 * fechamento). Reusa o evento OPERATION_CLOSED (mesmo domínio; sem schema
 * novo). Best-effort: nunca lança.
 */
export async function notifyPeopleOfOperationReopened(input: {
  projectId: string;
  month: number;
  year: number;
  justification: string;
  actorName: string | null;
}): Promise<void> {
  if (!isDatabaseConfigured()) return;
  try {
    const userIds = await peopleRecipientIds();
    if (userIds.length === 0) return;
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: { name: true, client: { select: { name: true } } },
    });
    const period = formatMonth(input.month, input.year);
    const projectName = project?.name ?? "Projeto";
    await createInAppNotifications(
      userIds.map((userId) => ({
        userId,
        event: "OPERATION_CLOSED",
        title: `Fechamento reaberto — ${projectName} (${period})`,
        body: `${input.actorName ?? "A Operação"} reabriu o fechamento operacional de ${projectName}${project?.client?.name ? ` · ${project.client.name}` : ""} (${period}). Os pagamentos "Aguardando DP" desse projeto serão recalculados no próximo fechamento — aguarde antes de liberar.\nJustificativa: ${input.justification}`,
        href: `/app/pagamentos?month=${input.month}&year=${input.year}`,
      })),
    );
  } catch (error) {
    console.error("[operacao] reopen DP notification failed", error);
  }
}
