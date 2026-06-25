"use server";

import { revalidatePath } from "next/cache";
import { Prisma, prisma } from "@jumpflow/database";
import { z, type ZodType } from "zod";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import { requireRole } from "@/lib/auth/guards";
import { FINANCIAL_ROLES } from "@/lib/auth/route-permissions";
import {
  notifyClientBillingSummary,
  notifyHoursReleased,
} from "@/lib/automation/notifications/events";
import { buildAuditEventData } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  generateRevenueClosings,
  getRevenueClosingForPreInvoice,
  revenueClosingTransitions,
  type RevenueClosingAdvanceAction,
} from "@/lib/db/revenue";
import { resolveDbUser } from "@/lib/db/users";
import { getNfseProvider } from "@/lib/nfse/provider";
import { NFSE_BUCKET } from "@/lib/nfse/config";
import {
  nfseEmailReferenceKey,
  nfseIdempotencyKey,
  nfsePdfStorageKey,
  nfseXmlStorageKey,
} from "@/lib/nfse/references";
import {
  buildPreInvoice,
  preInvoiceReferenceKey,
  preInvoiceStorageKey,
  renderPreInvoiceHtml,
  renderPreInvoiceText,
} from "@/lib/billing/pre-invoice";
import {
  getStorageProvider,
  isStorageConfigured,
} from "@/lib/storage/provider";
import { getEmailTransport } from "@/lib/automation/email-transport";

const FINANCEIRO_PATH = "/app/financeiro";

class ActionError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const monthInputSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
});

const advanceInputSchema = z.object({
  id: z.string().min(1),
  action: z.enum([
    "SUBMIT_REVIEW",
    "MARK_READY",
    "CLOSE",
    "MARK_INVOICED",
    "CANCEL",
  ]),
});

const closingIdInputSchema = z.object({
  closingId: z.string().min(1),
});

function ensureDatabase(): void {
  if (!isDatabaseConfigured()) {
    throw new ActionError("NO_DATABASE", "Banco de dados nao configurado.");
  }
}

function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ActionError("INVALID_INPUT", "Revise os dados informados.");
  }
  return result.data;
}

function toFailure(error: unknown): ActionResult<never> {
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_")
  ) {
    throw error;
  }
  if (error instanceof ActionError) {
    return { ok: false, error: error.code, message: error.message };
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: "Ja existe documento fiscal para esses dados.",
    };
  }
  console.error("[financeiro] unexpected action error", error);
  return {
    ok: false,
    error: "UNEXPECTED",
    message: "Nao foi possivel concluir a acao.",
  };
}

export async function generateMonthlyRevenueClosings(input: {
  month: number;
  year: number;
}): Promise<ActionResult<{ generated: number; skippedClosed: number }>> {
  try {
    ensureDatabase();
    const user = await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(monthInputSchema, input);
    const dbUser = await resolveDbUser(user);
    const result = await generateRevenueClosings({
      ...parsed,
      audit: {
        actorUserId: dbUser?.id ?? null,
        entityId: `${parsed.year}-${String(parsed.month).padStart(2, "0")}`,
        action: "REVENUE_CLOSINGS_GENERATED",
      },
    });
    revalidatePath(FINANCEIRO_PATH);
    return { ok: true, data: result };
  } catch (error) {
    return toFailure(error);
  }
}

export async function advanceRevenueClosing(input: {
  id: string;
  action: RevenueClosingAdvanceAction;
}): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(advanceInputSchema, input);
    const transition = revenueClosingTransitions[parsed.action];
    const dbUser = await resolveDbUser(user);

    const closing = await prisma.revenueClosing.findUnique({
      where: { id: parsed.id },
      select: { id: true, status: true, totalAmount: true },
    });
    if (!closing) {
      throw new ActionError("NOT_FOUND", "Fechamento nao encontrado.");
    }
    if (parsed.action === "MARK_INVOICED") {
      const fiscalDocument = await prisma.fiscalDocument.findFirst({
        where: { revenueClosingId: parsed.id, status: "ISSUED" },
        select: { id: true },
      });
      if (!fiscalDocument) {
        throw new ActionError(
          "INVALID_INPUT",
          "Emita ou registre a NFS-e antes de marcar como faturado.",
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      const updateData: Prisma.RevenueClosingUpdateManyMutationInput = {
        status: transition.next,
      };
      if (parsed.action === "CLOSE") {
        updateData.closedAt = new Date();
      }
      const updated = await tx.revenueClosing.updateMany({
        where: { id: parsed.id, status: transition.expected },
        data: updateData,
      });
      if (updated.count !== 1) {
        throw new ActionError(
          "ALREADY_DECIDED",
          "O fechamento nao esta no status esperado para esta acao.",
        );
      }
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "RevenueClosing",
          entityId: parsed.id,
          action: transition.auditAction,
          before: { status: closing.status },
          after: { status: transition.next, totalAmount: Number(closing.totalAmount) },
        }),
      });
    });

    // Liberação: notify on CLOSE (READY_TO_CLOSE → CLOSED). Best-effort.
    if (parsed.action === "CLOSE") {
      await notifyHoursReleased(parsed.id);
    }

    revalidatePath(FINANCEIRO_PATH);
    return { ok: true, data: { id: parsed.id, status: transition.next } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Send the per-consultant billing summary (apuração) to the client contact.
 * Explicit, Finance-triggered action (not automatic on a status change) since
 * it is an outward, client-facing email. Idempotent per closing + recipient.
 */
export async function sendClientBillingSummary(input: {
  closingId: string;
}): Promise<ActionResult<{ ok: true }>> {
  try {
    ensureDatabase();
    await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(closingIdInputSchema, input);
    await notifyClientBillingSummary(parsed.closingId);
    revalidatePath(FINANCEIRO_PATH);
    return { ok: true, data: { ok: true } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function createFiscalDocumentDraft(input: {
  closingId: string;
}): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(closingIdInputSchema, input);
    const dbUser = await resolveDbUser(user);

    const closing = await prisma.revenueClosing.findUnique({
      where: { id: parsed.closingId },
      select: { id: true, clientId: true, status: true, totalAmount: true },
    });
    if (!closing) {
      throw new ActionError("NOT_FOUND", "Fechamento nao encontrado.");
    }
    if (closing.status !== "CLOSED") {
      throw new ActionError(
        "INVALID_INPUT",
        "A NFS-e so pode ser preparada para fechamento fechado.",
      );
    }
    const existing = await prisma.fiscalDocument.findFirst({
      where: {
        revenueClosingId: closing.id,
        kind: "NFSE",
        status: { not: "CANCELLED" },
      },
      select: { id: true, status: true },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      return {
        ok: true,
        data: { id: existing.id, status: existing.status },
      };
    }

    const document = await prisma.$transaction(async (tx) => {
      const fiscalDocument = await tx.fiscalDocument.create({
        data: {
          kind: "NFSE",
          status: "DRAFT",
          clientId: closing.clientId,
          revenueClosingId: closing.id,
          provider: "SAO_PAULO_NFSE",
        },
      });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "FiscalDocument",
          entityId: fiscalDocument.id,
          action: "FISCAL_DOCUMENT_DRAFT_CREATED",
          after: { revenueClosingId: closing.id, amount: Number(closing.totalAmount) },
        }),
      });
      return fiscalDocument;
    });

    revalidatePath(FINANCEIRO_PATH);
    return { ok: true, data: { id: document.id, status: document.status } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Request NFS-e issuance for a CLOSED revenue closing's fiscal document
 * (Fase H). Pipeline + honest degrade:
 *
 *  - Builds the RPS from the normalized pre-invoice data (client + lines + ISS).
 *  - Calls the configured NfseProvider. When NO provider is configured the
 *    disabled provider returns an error and the document stays DRAFT/FAILED —
 *    we NEVER fake an emission.
 *  - On success: REQUESTED -> ISSUED with invoiceNumber + protocol + issuedAt;
 *    stores the request (and response/PDF when present) XML in the private
 *    `nfse` bucket and records the *StorageBucket/Key.
 *  - On failure: -> FAILED + errorMessage (retry allowed from FAILED).
 *  - Records an IntegrationEvent (idempotencyKey stable per
 *    fiscalDocument+competence) and audits the transition.
 */
export async function requestFiscalDocumentIssue(input: {
  closingId: string;
}): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(closingIdInputSchema, input);
    const dbUser = await resolveDbUser(user);
    const document = await prisma.fiscalDocument.findFirst({
      where: { revenueClosingId: parsed.closingId },
      include: { revenueClosing: { select: { totalAmount: true, clientId: true } } },
      orderBy: { createdAt: "desc" },
    });
    if (!document || !document.revenueClosing) {
      throw new ActionError(
        "NOT_FOUND",
        "Crie um rascunho de NFS-e antes de solicitar emissao.",
      );
    }
    if (document.status !== "DRAFT" && document.status !== "FAILED") {
      throw new ActionError(
        "ALREADY_DECIDED",
        "Documento fiscal nao esta pronto para solicitacao.",
      );
    }

    // Normalized service data (reuses the Fase G pre-invoice source of truth).
    const closingData = await getRevenueClosingForPreInvoice(parsed.closingId);
    if (!closingData) {
      throw new ActionError("NOT_FOUND", "Fechamento nao encontrado.");
    }
    const competence = {
      fiscalDocumentId: document.id,
      year: closingData.closing.year,
      month: closingData.closing.month,
    };
    const idempotencyKey = nfseIdempotencyKey(competence);
    const issRate = closingData.client.issRate ?? 0;

    const providerResult = await getNfseProvider().requestIssue({
      fiscalDocumentId: document.id,
      revenueClosingId: parsed.closingId,
      clientId: document.revenueClosing.clientId,
      amount: Number(document.revenueClosing.totalAmount),
      issRate,
      tomador: {
        document: closingData.client.document,
        name: closingData.client.name,
        municipality: closingData.client.municipality,
        email: closingData.client.contactEmail,
      },
      lines: closingData.lines.map((line) => ({
        description: line.projectName,
        amount: line.amount,
      })),
    });

    // Record the integration attempt regardless of outcome (idempotent per
    // fiscalDocument+competence). Secrets/credentials never enter the metadata.
    await upsertNfseIntegrationEvent({
      idempotencyKey,
      fiscalDocumentId: document.id,
      success: providerResult.ok,
      error: providerResult.ok ? null : providerResult.message,
    });

    if (!providerResult.ok) {
      await prisma.$transaction(async (tx) => {
        await tx.fiscalDocument.update({
          where: { id: document.id },
          data: { status: "FAILED", errorMessage: providerResult.message },
        });
        await tx.auditEvent.create({
          data: buildAuditEventData({
            actorUserId: dbUser?.id ?? null,
            entityType: "FiscalDocument",
            entityId: document.id,
            action: "FISCAL_DOCUMENT_ISSUE_FAILED",
            before: { status: document.status },
            after: { status: "FAILED", error: providerResult.message },
          }),
        });
      });
      revalidatePath(FINANCEIRO_PATH);
      // Surface the honest error to the caller (e.g. provider not configured).
      return providerResult;
    }

    // Persist XML/PDF to the private `nfse` bucket (degrade honesto: when
    // storage is unconfigured we still issue, just without stored artifacts).
    let xmlStorage: { bucket: string; key: string } | null = null;
    let pdfStorage: { bucket: string; key: string } | null = null;
    if (isStorageConfigured() && providerResult.data.requestXml) {
      const storage = getStorageProvider(NFSE_BUCKET);
      if (storage) {
        const xmlTarget = nfseXmlStorageKey(competence);
        const xmlContent =
          providerResult.data.responseXml ?? providerResult.data.requestXml;
        await storage.upload(
          xmlTarget.key,
          new TextEncoder().encode(xmlContent),
          "application/xml; charset=utf-8",
        );
        xmlStorage = xmlTarget;
        if (providerResult.data.pdfBase64) {
          const pdfTarget = nfsePdfStorageKey(competence);
          await storage.upload(
            pdfTarget.key,
            Buffer.from(providerResult.data.pdfBase64, "base64"),
            "application/pdf",
          );
          pdfStorage = pdfTarget;
        }
      }
    }

    const issuedAt = new Date();
    await prisma.$transaction(async (tx) => {
      // REQUESTED -> ISSUED in a single hop after a successful provider call.
      await tx.fiscalDocument.update({
        where: { id: document.id },
        data: {
          status: "ISSUED",
          invoiceNumber: providerResult.data.invoiceNumber ?? null,
          protocol: providerResult.data.protocol ?? null,
          xmlStorageBucket: xmlStorage?.bucket ?? null,
          xmlStorageKey: xmlStorage?.key ?? null,
          pdfStorageBucket: pdfStorage?.bucket ?? null,
          pdfStorageKey: pdfStorage?.key ?? null,
          errorMessage: null,
          issuedAt,
        },
      });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "FiscalDocument",
          entityId: document.id,
          action: "FISCAL_DOCUMENT_ISSUED",
          before: { status: document.status },
          after: {
            status: "ISSUED",
            invoiceNumber: providerResult.data.invoiceNumber ?? null,
            protocol: providerResult.data.protocol ?? null,
            stored: xmlStorage != null,
            xmlStorageKey: xmlStorage?.key ?? null,
          },
        }),
      });
    });
    revalidatePath(FINANCEIRO_PATH);
    return { ok: true, data: { id: document.id, status: "ISSUED" } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Idempotent IntegrationEvent writer for an NFS-e issue attempt. Keyed by
 * @@unique([provider, idempotencyKey]); a repeated attempt updates the same row
 * (retry) instead of creating a duplicate. Secrets are NEVER persisted here.
 */
async function upsertNfseIntegrationEvent(input: {
  idempotencyKey: string;
  fiscalDocumentId: string;
  success: boolean;
  error: string | null;
}): Promise<void> {
  const now = new Date();
  await prisma.integrationEvent.upsert({
    where: {
      provider_idempotencyKey: {
        provider: "SAO_PAULO_NFSE",
        idempotencyKey: input.idempotencyKey,
      },
    },
    create: {
      provider: "SAO_PAULO_NFSE",
      operation: "ISSUE_NFSE",
      status: input.success ? "SUCCESS" : "FAILED",
      entityType: "FiscalDocument",
      entityId: input.fiscalDocumentId,
      idempotencyKey: input.idempotencyKey,
      error: input.error,
      attemptedAt: now,
      completedAt: now,
    },
    update: {
      status: input.success ? "SUCCESS" : "FAILED",
      error: input.error,
      attemptedAt: now,
      completedAt: now,
    },
  });
}

export interface PreInvoiceArtifact {
  /** HTML content (always returned so the UI can preview even when stored). */
  html: string;
  /** Where it was persisted, when storage is configured; null = degrade. */
  storageBucket: string | null;
  storageKey: string | null;
  /** Short-lived signed URL to download the stored artifact, when available. */
  downloadUrl: string | null;
  /** Whether the artifact was persisted to storage (false = on-screen only). */
  stored: boolean;
}

const PRE_INVOICES_BUCKET = "pre-invoices";

/**
 * Generate (and, when storage is configured, persist) the pre-invoice for a
 * CLOSED revenue closing. This is the FINANCIAL VALIDATION step before fiscal
 * issuance (NFS-e is Fase H). Gated to CLOSED + FINANCIAL_ROLES, audited.
 *
 * Degrade honesto: without storage configured, the HTML is still computed and
 * returned for on-screen display (no fake upload).
 */
export async function generatePreInvoice(input: {
  closingId: string;
}): Promise<ActionResult<PreInvoiceArtifact>> {
  try {
    ensureDatabase();
    const user = await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(closingIdInputSchema, input);
    const dbUser = await resolveDbUser(user);

    const data = await getRevenueClosingForPreInvoice(parsed.closingId);
    if (!data) {
      throw new ActionError("NOT_FOUND", "Fechamento nao encontrado.");
    }
    if (data.closing.status !== "CLOSED") {
      throw new ActionError(
        "INVALID_INPUT",
        "A pre-fatura so pode ser gerada para fechamento fechado.",
      );
    }

    const preInvoice = buildPreInvoice({
      closing: {
        id: data.closing.id,
        month: data.closing.month,
        year: data.closing.year,
        adjustmentAmount: data.closing.adjustmentAmount,
      },
      client: {
        id: data.client.id,
        name: data.client.name,
        document: data.client.document,
        municipality: data.client.municipality,
        issRate: data.client.issRate,
      },
      lines: data.lines,
      generatedAt: new Date(),
    });
    const html = renderPreInvoiceHtml(preInvoice);

    let storageBucket: string | null = null;
    let storageKey: string | null = null;
    let downloadUrl: string | null = null;
    if (isStorageConfigured()) {
      const provider = getStorageProvider(PRE_INVOICES_BUCKET);
      if (provider) {
        const key = preInvoiceStorageKey(data.closing);
        await provider.upload(
          key,
          new TextEncoder().encode(html),
          "text/html; charset=utf-8",
        );
        storageBucket = PRE_INVOICES_BUCKET;
        storageKey = key;
        downloadUrl = await provider.getSignedUrl(key, 600);
      }
    }

    await prisma.auditEvent.create({
      data: buildAuditEventData({
        actorUserId: dbUser?.id ?? null,
        entityType: "RevenueClosing",
        entityId: data.closing.id,
        action: "REVENUE_PRE_INVOICE_GENERATED",
        after: {
          competence: preInvoice.competence,
          servicesSubtotal: preInvoice.servicesSubtotal,
          estimatedIss: preInvoice.estimatedIss,
          total: preInvoice.total,
          stored: storageBucket != null,
          storageBucket,
          storageKey,
        },
      }),
    });

    return {
      ok: true,
      data: {
        html,
        storageBucket,
        storageKey,
        downloadUrl,
        stored: storageBucket != null,
      },
    };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Send the pre-invoice to the client's contactEmail (Fase G3). Idempotent per
 * closing+competence via AutomationEmailLog (type PRE_INVOICE, stable
 * referenceKey): a SENT log short-circuits re-sends; a FAILED log is retried.
 *
 * Degrade honesto: without a client contactEmail, fail with NO_CONTACT_EMAIL
 * (never fake a send). Gated to CLOSED + FINANCIAL_ROLES, audited.
 */
export async function sendPreInvoiceEmail(input: {
  closingId: string;
}): Promise<ActionResult<{ emailed: boolean; alreadySent: boolean }>> {
  try {
    ensureDatabase();
    const user = await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(closingIdInputSchema, input);
    const dbUser = await resolveDbUser(user);

    const data = await getRevenueClosingForPreInvoice(parsed.closingId);
    if (!data) {
      throw new ActionError("NOT_FOUND", "Fechamento nao encontrado.");
    }
    if (data.closing.status !== "CLOSED") {
      throw new ActionError(
        "INVALID_INPUT",
        "A pre-fatura so pode ser enviada para fechamento fechado.",
      );
    }
    const contactEmail = data.client.contactEmail?.trim();
    if (!contactEmail) {
      throw new ActionError(
        "NO_CONTACT_EMAIL",
        "Cliente sem e-mail de contato. Cadastre o e-mail antes de enviar a pre-fatura.",
      );
    }

    const referenceKey = preInvoiceReferenceKey(data.closing);
    const existing = await prisma.automationEmailLog.findUnique({
      where: {
        type_referenceKey: { type: "PRE_INVOICE", referenceKey },
      },
      select: { status: true },
    });
    if (existing?.status === "SENT") {
      return { ok: true, data: { emailed: false, alreadySent: true } };
    }

    const preInvoice = buildPreInvoice({
      closing: {
        id: data.closing.id,
        month: data.closing.month,
        year: data.closing.year,
        adjustmentAmount: data.closing.adjustmentAmount,
      },
      client: {
        id: data.client.id,
        name: data.client.name,
        document: data.client.document,
        municipality: data.client.municipality,
        issRate: data.client.issRate,
      },
      lines: data.lines,
      generatedAt: new Date(),
    });
    const body = renderPreInvoiceText(preInvoice);
    const subject = `Pre-fatura ${data.client.name} — ${preInvoice.competence}`;

    let status: "SENT" | "FAILED" = "SENT";
    let error: string | null = null;
    let messageId: string | null = null;
    let provider: string | null = null;
    try {
      const sent = await getEmailTransport().send({
        to: [contactEmail],
        subject,
        text: body,
      });
      messageId = sent.id;
      provider = sent.provider;
    } catch (e) {
      status = "FAILED";
      error = e instanceof Error ? e.message : String(e);
    }

    // Upsert keeps idempotency: a prior FAILED is promoted to SENT on retry,
    // and a fresh send creates the SENT log. We never overwrite a SENT row
    // (short-circuited above).
    await prisma.automationEmailLog.upsert({
      where: { type_referenceKey: { type: "PRE_INVOICE", referenceKey } },
      create: {
        type: "PRE_INVOICE",
        referenceKey,
        recipient: contactEmail,
        status,
        error,
        meta: { messageId, provider, competence: preInvoice.competence },
      },
      update: {
        recipient: contactEmail,
        status,
        error,
        meta: { messageId, provider, competence: preInvoice.competence },
      },
    });

    await prisma.auditEvent.create({
      data: buildAuditEventData({
        actorUserId: dbUser?.id ?? null,
        entityType: "RevenueClosing",
        entityId: data.closing.id,
        action: "REVENUE_PRE_INVOICE_EMAILED",
        after: {
          recipient: contactEmail,
          competence: preInvoice.competence,
          status,
          provider,
        },
      }),
    });

    if (status === "FAILED") {
      throw new ActionError(
        "UNEXPECTED",
        "Falha ao enviar a pre-fatura. Tente novamente.",
      );
    }

    revalidatePath(FINANCEIRO_PATH);
    return { ok: true, data: { emailed: true, alreadySent: false } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Send the ISSUED NFS-e notification to the client's contactEmail (Fase H).
 * Idempotent per fiscal document + competence via AutomationEmailLog (type
 * NFSE_ISSUED): a SENT log short-circuits re-sends; a FAILED log is retried.
 *
 * Degrade honesto: only sends for an ISSUED document; without a client
 * contactEmail it fails with NO_CONTACT_EMAIL (never fakes a send). The XML/PDF
 * are NOT attached (private artifacts served by signed URL); the e-mail carries
 * the invoice number + protocol only. Gated to FINANCIAL_ROLES, audited.
 */
export async function sendNfseIssuedEmail(input: {
  closingId: string;
}): Promise<ActionResult<{ emailed: boolean; alreadySent: boolean }>> {
  try {
    ensureDatabase();
    const user = await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(closingIdInputSchema, input);
    const dbUser = await resolveDbUser(user);

    const document = await prisma.fiscalDocument.findFirst({
      where: { revenueClosingId: parsed.closingId, status: "ISSUED" },
      include: {
        client: { select: { name: true, contactEmail: true } },
        revenueClosing: { select: { id: true, month: true, year: true } },
      },
      orderBy: { issuedAt: "desc" },
    });
    if (!document || !document.revenueClosing) {
      throw new ActionError(
        "NOT_FOUND",
        "Nenhuma NFS-e emitida encontrada para este fechamento.",
      );
    }
    const contactEmail = document.client.contactEmail?.trim();
    if (!contactEmail) {
      throw new ActionError(
        "NO_CONTACT_EMAIL",
        "Cliente sem e-mail de contato. Cadastre o e-mail antes de enviar a NFS-e.",
      );
    }

    const competence = {
      fiscalDocumentId: document.id,
      year: document.revenueClosing.year,
      month: document.revenueClosing.month,
    };
    const referenceKey = nfseEmailReferenceKey(competence);
    const existing = await prisma.automationEmailLog.findUnique({
      where: { type_referenceKey: { type: "NFSE_ISSUED", referenceKey } },
      select: { status: true },
    });
    if (existing?.status === "SENT") {
      return { ok: true, data: { emailed: false, alreadySent: true } };
    }

    const competenceLabel = `${String(document.revenueClosing.month).padStart(2, "0")}/${document.revenueClosing.year}`;
    const subject = `NFS-e ${document.client.name} — ${competenceLabel}`;
    const bodyLines = [
      `Ola,`,
      ``,
      `A NFS-e referente a competencia ${competenceLabel} foi emitida.`,
      document.invoiceNumber ? `Numero da NFS-e: ${document.invoiceNumber}` : "",
      document.protocol ? `Protocolo: ${document.protocol}` : "",
      ``,
      `Os documentos (XML/PDF) ficam disponiveis na plataforma.`,
    ].filter((line) => line.length > 0 || line === "");
    const body = bodyLines.join("\n");

    let status: "SENT" | "FAILED" = "SENT";
    let error: string | null = null;
    let messageId: string | null = null;
    let provider: string | null = null;
    try {
      const sent = await getEmailTransport().send({
        to: [contactEmail],
        subject,
        text: body,
      });
      messageId = sent.id;
      provider = sent.provider;
    } catch (e) {
      status = "FAILED";
      error = e instanceof Error ? e.message : String(e);
    }

    await prisma.automationEmailLog.upsert({
      where: { type_referenceKey: { type: "NFSE_ISSUED", referenceKey } },
      create: {
        type: "NFSE_ISSUED",
        referenceKey,
        recipient: contactEmail,
        status,
        error,
        meta: { messageId, provider, invoiceNumber: document.invoiceNumber },
      },
      update: {
        recipient: contactEmail,
        status,
        error,
        meta: { messageId, provider, invoiceNumber: document.invoiceNumber },
      },
    });

    await prisma.auditEvent.create({
      data: buildAuditEventData({
        actorUserId: dbUser?.id ?? null,
        entityType: "FiscalDocument",
        entityId: document.id,
        action: "FISCAL_DOCUMENT_EMAILED",
        after: {
          recipient: contactEmail,
          invoiceNumber: document.invoiceNumber,
          status,
          provider,
        },
      }),
    });

    if (status === "FAILED") {
      throw new ActionError(
        "UNEXPECTED",
        "Falha ao enviar a NFS-e. Tente novamente.",
      );
    }

    revalidatePath(FINANCEIRO_PATH);
    return { ok: true, data: { emailed: true, alreadySent: false } };
  } catch (error) {
    return toFailure(error);
  }
}
