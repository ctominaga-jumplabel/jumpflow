"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@jumpflow/database";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { requirePermission } from "@/lib/auth/guards";
import { FLOW_PERMISSION_CODES } from "@/lib/auth/permission-codes";
import { replyRecipientsSchema } from "@/lib/automation/email/reply-routing-core";
import { NOTIFICATION_EVENTS } from "@/lib/automation/email/template-registry";
import { buildAuditEventData } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { resolveDbUser } from "@/lib/db/users";

const ROUTE = "/app/admin/templates-email";

const saveSchema = z.object({
  event: z.enum(NOTIFICATION_EVENTS),
  active: z.boolean(),
  recipients: replyRecipientsSchema,
});

/**
 * Salva para onde vão as respostas aos e-mails de um evento (e-mails e/ou
 * perfis). Gate: CONFIGURACOES_RESPOSTAS_EMAIL edit. Zod no servidor; auditado
 * (EMAIL_REPLY_ROUTE_UPDATED, before/after). Lista vazia remove a rota (volta
 * ao Reply-To padrão do remetente).
 */
export async function saveEmailReplyRouteAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const user = await requirePermission(FLOW_PERMISSION_CODES.emailReplyRoutes, "edit");
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "NO_DATABASE", message: "Banco de dados não configurado." };
  }
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: parsed.error.issues[0]?.message ?? "Destinatários inválidos.",
    };
  }
  const { event, active, recipients } = parsed.data;
  try {
    const dbUser = await resolveDbUser(user);
    const before = await prisma.emailReplyRoute.findUnique({ where: { event } });
    await prisma.$transaction(async (tx) => {
      let after = null;
      if (recipients.length === 0) {
        await tx.emailReplyRoute.deleteMany({ where: { event } });
      } else {
        after = await tx.emailReplyRoute.upsert({
          where: { event },
          create: { event, active, recipients, updatedByUserId: dbUser?.id ?? null },
          update: { active, recipients, updatedByUserId: dbUser?.id ?? null },
        });
      }
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "EmailReplyRoute",
          entityId: event,
          action: "EMAIL_REPLY_ROUTE_UPDATED",
          before,
          after,
        }),
      });
    });
    revalidatePath(ROUTE);
    return { ok: true, data: null };
  } catch (error) {
    console.error("[templates-email] save reply route failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Não foi possível salvar o destino das respostas." };
  }
}
