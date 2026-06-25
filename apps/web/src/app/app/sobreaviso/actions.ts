"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@jumpflow/database";
import { z, type ZodType } from "zod";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import { requireRole, requireUser } from "@/lib/auth/guards";
import type { AppUser } from "@/lib/auth/types";
import { buildAuditEventData, recordAuditEvent } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { getConsultantForUser } from "@/lib/db/timesheet";
import { resolveDbUser } from "@/lib/db/users";
import {
  getOnCallAttachmentStorageProvider,
  isStorageConfigured,
  ONCALL_APPROVALS_BUCKET,
} from "@/lib/storage/provider";
import { safeFileName, validateReceiptFile } from "@/lib/storage/file-validation";
import { parseIsoDateUtc } from "@/lib/timesheet/week";

/**
 * Server actions for Sobreaviso (on-call) — Onda 3 item 3.1.
 *
 * A consultant records their own on-call (PENDING), optionally attaching the
 * responsible's "ok". A manager (ADMIN/AREA_MANAGER/PROJECT_MANAGER) approves or
 * rejects — never their own. Sensitive transitions emit AuditEvent.
 */
const ROUTE = "/app/sobreaviso";
const APPROVER_ROLES = ["ADMIN", "AREA_MANAGER", "PROJECT_MANAGER"] as const;
/** Who may view the "ok" attachment: approvers + Finance (reviews liberação). */
const ATTACHMENT_VIEW_ROLES = [
  "ADMIN",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "FINANCE",
] as const;

class ActionError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function ensureDatabase(): void {
  if (!isDatabaseConfigured()) {
    throw new ActionError("NO_DATABASE", "Banco de dados não configurado.");
  }
}

async function requireConsultant(user: AppUser) {
  const consultant = await getConsultantForUser(user);
  if (!consultant) {
    throw new ActionError(
      "NO_CONSULTANT",
      "Seu usuário não está vinculado a um consultor. Contate um administrador.",
    );
  }
  return consultant;
}

function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ActionError(
      "INVALID_INPUT",
      result.error.issues[0]?.message ?? "Dados inválidos.",
    );
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
  console.error("[sobreaviso] unexpected action error", error);
  return { ok: false, error: "UNEXPECTED", message: "Erro inesperado." };
}

// --- Create / delete -------------------------------------------------------

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  hours: z.coerce.number().positive("Informe as horas.").max(24, "Máximo 24h."),
  multiplier: z.coerce.number().min(0).max(10).default(1),
  projectId: z.string().min(1).nullable().optional(),
  note: z.string().trim().max(500).optional(),
});

export type CreateOnCallInput = z.infer<typeof createSchema>;

export async function createOnCallEntry(
  input: CreateOnCallInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const consultant = await requireConsultant(user);
    const parsed = parseInput(createSchema, input);
    const date = parseIsoDateUtc(parsed.date);
    if (!date) throw new ActionError("INVALID_INPUT", "Data inválida.");
    const dbUser = await resolveDbUser(user);

    const created = await prisma.onCallEntry.create({
      data: {
        consultantId: consultant.id,
        projectId: parsed.projectId ?? null,
        date,
        hours: parsed.hours,
        multiplier: parsed.multiplier,
        note: parsed.note || null,
        createdByUserId: dbUser?.id ?? null,
      },
      select: { id: true },
    });
    await recordAuditEvent({
      actorUserId: dbUser?.id ?? null,
      entityType: "OnCallEntry",
      entityId: created.id,
      action: "ONCALL_CREATED",
      after: { hours: parsed.hours, multiplier: parsed.multiplier, date: parsed.date },
    });
    revalidatePath(ROUTE);
    return { ok: true, data: created };
  } catch (error) {
    return toFailure(error);
  }
}

const idSchema = z.object({ id: z.string().min(1) });

export async function deleteOnCallEntry(
  input: z.infer<typeof idSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const consultant = await requireConsultant(user);
    const parsed = parseInput(idSchema, input);

    const entry = await prisma.onCallEntry.findUnique({
      where: { id: parsed.id },
      select: {
        consultantId: true,
        status: true,
        attachment: { select: { storageKey: true, storageBucket: true } },
      },
    });
    if (!entry) throw new ActionError("NOT_FOUND", "Sobreaviso não encontrado.");
    if (entry.consultantId !== consultant.id) {
      throw new ActionError("FORBIDDEN", "Você não pode remover este lançamento.");
    }
    if (entry.status !== "PENDING") {
      throw new ActionError("NOT_EDITABLE", "Sobreaviso já decidido não pode ser removido.");
    }

    await prisma.onCallEntry.delete({ where: { id: parsed.id } });
    if (entry.attachment) {
      const provider = getOnCallAttachmentStorageProvider();
      try {
        await provider?.delete(entry.attachment.storageKey);
      } catch (e) {
        console.error("[sobreaviso] failed to delete attachment object", e);
      }
    }
    revalidatePath(ROUTE);
    return { ok: true, data: parsed };
  } catch (error) {
    return toFailure(error);
  }
}

// --- Approve / reject (manager) --------------------------------------------

const decideSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["APPROVE", "REJECT"]),
});

export async function decideOnCall(
  input: z.infer<typeof decideSchema>,
): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole([...APPROVER_ROLES]);
    const parsed = parseInput(decideSchema, input);
    const dbUser = await resolveDbUser(user);

    const entry = await prisma.onCallEntry.findUnique({
      where: { id: parsed.id },
      select: { status: true, consultant: { select: { userId: true } } },
    });
    if (!entry) throw new ActionError("NOT_FOUND", "Sobreaviso não encontrado.");
    // Segregation of duties: never approve your own on-call.
    if (entry.consultant.userId && entry.consultant.userId === user.id) {
      throw new ActionError("SELF_APPROVAL", "Você não pode decidir o próprio sobreaviso.");
    }
    const next = parsed.decision === "APPROVE" ? "APPROVED" : "REJECTED";

    const guard = await prisma.onCallEntry.updateMany({
      where: { id: parsed.id, status: "PENDING" },
      data: {
        status: next,
        approvedByUserId: dbUser?.id ?? null,
        approvedAt: new Date(),
      },
    });
    if (guard.count !== 1) {
      throw new ActionError("ALREADY_DECIDED", "Sobreaviso já foi decidido.");
    }
    await recordAuditEvent({
      actorUserId: dbUser?.id ?? null,
      entityType: "OnCallEntry",
      entityId: parsed.id,
      action: next === "APPROVED" ? "ONCALL_APPROVED" : "ONCALL_REJECTED",
    });
    revalidatePath(ROUTE);
    return { ok: true, data: { id: parsed.id, status: next } };
  } catch (error) {
    return toFailure(error);
  }
}

// --- Attachment (the responsible's "ok") -----------------------------------

function buildOnCallStorageKey(entryId: string, fileName: string): string {
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  return `oncall/${entryId}/${ts}-${safeFileName(fileName)}`;
}

export async function attachOnCallApproval(
  formData: FormData,
): Promise<ActionResult<{ fileName: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    if (!isStorageConfigured()) {
      throw new ActionError("NO_STORAGE", "Anexos indisponíveis: storage não configurado.");
    }
    const consultant = await requireConsultant(user);
    const parsed = parseInput(idSchema, { id: formData.get("id") });

    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new ActionError("INVALID_FILE", "Nenhum arquivo enviado.");
    }
    const invalid = validateReceiptFile({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (invalid) throw new ActionError(invalid.code, invalid.message);

    const entry = await prisma.onCallEntry.findUnique({
      where: { id: parsed.id },
      select: {
        consultantId: true,
        status: true,
        attachment: { select: { storageKey: true } },
      },
    });
    if (!entry) throw new ActionError("NOT_FOUND", "Sobreaviso não encontrado.");
    if (entry.consultantId !== consultant.id) {
      throw new ActionError("FORBIDDEN", "Você não pode anexar neste lançamento.");
    }
    if (entry.status !== "PENDING") {
      throw new ActionError("ATTACHMENT_LOCKED", "Sobreaviso já decidido: anexo bloqueado.");
    }
    const dbUser = await resolveDbUser(user);

    const provider = getOnCallAttachmentStorageProvider()!;
    const storageKey = buildOnCallStorageKey(parsed.id, file.name);
    await provider.upload(storageKey, await file.arrayBuffer(), file.type);

    const previousKey = entry.attachment?.storageKey ?? null;
    const data = {
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      storageBucket: ONCALL_APPROVALS_BUCKET,
      storageKey,
      uploadedByUserId: dbUser?.id ?? null,
    };
    try {
      await prisma.$transaction(async (tx) => {
        const g = await tx.onCallEntry.updateMany({
          where: { id: parsed.id, status: "PENDING" },
          data: { updatedAt: new Date() },
        });
        if (g.count !== 1) {
          throw new ActionError("ATTACHMENT_LOCKED", "Sobreaviso já decidido: anexo bloqueado.");
        }
        await tx.onCallAttachment.upsert({
          where: { onCallEntryId: parsed.id },
          update: data,
          create: { onCallEntryId: parsed.id, ...data },
        });
        await tx.auditEvent.create({
          data: buildAuditEventData({
            actorUserId: dbUser?.id ?? null,
            entityType: "OnCallEntry",
            entityId: parsed.id,
            action: "ONCALL_ATTACHMENT_ADDED",
            after: { fileName: file.name, size: file.size },
          }),
        });
      });
    } catch (error) {
      try {
        await provider.delete(storageKey);
      } catch (cleanup) {
        console.error("[sobreaviso] failed to clean up attachment", cleanup);
      }
      throw error;
    }
    if (previousKey && previousKey !== storageKey) {
      try {
        await provider.delete(previousKey);
      } catch (e) {
        console.error("[sobreaviso] failed to delete replaced attachment", e);
      }
    }

    revalidatePath(ROUTE);
    return { ok: true, data: { fileName: file.name } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function getOnCallApprovalUrl(
  input: z.infer<typeof idSchema>,
): Promise<ActionResult<{ url: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const parsed = parseInput(idSchema, input);
    const consultant = await getConsultantForUser(user);
    const isApprover = ATTACHMENT_VIEW_ROLES.some((r) => user.roles.includes(r));

    const entry = await prisma.onCallEntry.findUnique({
      where: { id: parsed.id },
      select: {
        consultantId: true,
        attachment: { select: { storageKey: true } },
      },
    });
    // Anti-enumeration: same response for missing entry and no access.
    const allowed =
      entry &&
      (isApprover || (consultant && entry.consultantId === consultant.id));
    if (!entry || !allowed || !entry.attachment) {
      throw new ActionError("NOT_FOUND", "Anexo não encontrado.");
    }
    const provider = getOnCallAttachmentStorageProvider();
    if (!provider) {
      throw new ActionError("NO_STORAGE", "Storage não configurado.");
    }
    const url = await provider.getSignedUrl(entry.attachment.storageKey, 300);
    return { ok: true, data: { url } };
  } catch (error) {
    return toFailure(error);
  }
}
