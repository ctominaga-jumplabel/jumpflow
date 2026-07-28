"use server";

import { prisma } from "@jumpflow/database";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { recordAuditEvent } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  createInAppNotifications,
  type NotificationEventValue,
} from "@/lib/db/notifications";
import { getConsultantForUser } from "@/lib/db/timesheet";
import { resolveDbUser } from "@/lib/db/users";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";

/**
 * Fase 4d (Trava B — docs/proposta-cockpit-gestor-area §4.1): o consultor NÃO
 * reverte a própria aprovação (segregação de deveres). Um lançamento `APPROVED`
 * só volta a ser editável depois que o Gestor de Área reabre a aprovação
 * (`decideHours` decision `SUBMITTED`). Esta action é o pedido leve que o dono
 * do lançamento dispara pela grade de horas: NÃO altera o status da entrada;
 * apenas notifica o Gestor de Área (in-app) para que ele avalie a reabertura.
 *
 * A Trava A tem precedência: quando a competência já teve o faturamento
 * liberado, nem a reversão da aprovação reabre a edição — por isso a UI só
 * oferece o botão quando a linha está aprovada e NÃO congelada pelo Financeiro.
 * O servidor, por robustez, ainda assim só exige que a entrada seja do dono e
 * esteja `APPROVED` (o pedido é inócuo — não muda estado).
 */

const inputSchema = z.object({ entryId: z.string().min(1) });

/**
 * Evento in-app reaproveitado: não há evento próprio de "pedido de reabertura"
 * no enum `NotificationEvent` (mudar schema está fora do escopo desta fase).
 * `MISSING_TIMESHEET_REPORT` é o mais próximo em contexto — é o único evento de
 * horas cujo destino natural é a fila de aprovações — e o `href` explícito
 * abaixo garante o pouso correto. O título/corpo carregam o significado real.
 */
const REOPEN_EVENT = "MISSING_TIMESHEET_REPORT" as NotificationEventValue;

/** Fila onde o gestor reverte a aprovação (decideHours decision SUBMITTED). */
const APROVACOES_HREF = "/app/aprovacoes";

function fail(error: ErrorCode, message: string): ActionResult<never> {
  return { ok: false, error, message };
}

/** yyyy-mm-dd de um `DateTime` armazenado em UTC (competência/dia legível). */
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function requestEntryReopen(
  input: { entryId: string },
): Promise<ActionResult<{ requested: true }>> {
  try {
    if (!isDatabaseConfigured()) {
      return fail("NO_DATABASE", "Banco de dados não configurado.");
    }
    const user = await requireUser();
    const consultant = await getConsultantForUser(user);
    if (!consultant) {
      return fail(
        "NO_CONSULTANT",
        "Seu usuário não está vinculado a um consultor.",
      );
    }
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      return fail("INVALID_INPUT", "Lançamento inválido.");
    }

    const entry = await prisma.timeEntry.findUnique({
      where: { id: parsed.data.entryId },
      select: {
        id: true,
        consultantId: true,
        status: true,
        date: true,
        projectId: true,
        project: { select: { name: true, managerUserId: true } },
        consultant: { select: { name: true } },
      },
    });
    if (!entry) {
      return fail("NOT_FOUND", "Lançamento não encontrado.");
    }
    // O solicitante precisa ser o DONO do lançamento.
    if (entry.consultantId !== consultant.id) {
      return fail(
        "FORBIDDEN",
        "Você só pode solicitar a reabertura dos seus próprios lançamentos.",
      );
    }
    // Só faz sentido para lançamentos aprovados (Trava B). Fora disso, ou já é
    // editável, ou está fechado/liberado — nada a reabrir por este canal.
    if (entry.status !== "APPROVED") {
      return fail(
        "NOT_EDITABLE",
        "Este lançamento não está aprovado — não há reabertura a solicitar.",
      );
    }

    // Destinatário: o Gestor de Área designado do projeto; se não houver, cai
    // para todos os usuários ativos com papel AREA_MANAGER.
    const recipientIds = new Set<string>();
    if (entry.project.managerUserId) {
      recipientIds.add(entry.project.managerUserId);
    }
    if (recipientIds.size === 0) {
      const managers = await prisma.user.findMany({
        where: {
          status: "ACTIVE",
          roles: { some: { role: { name: "AREA_MANAGER" } } },
        },
        select: { id: true },
      });
      for (const manager of managers) recipientIds.add(manager.id);
    }

    const dateLabel = isoDay(entry.date);
    const title = `Pedido de reabertura de lançamento — ${entry.consultant.name}`;
    const body =
      `${entry.consultant.name} solicitou a reabertura de um lançamento ` +
      `APROVADO em ${entry.project.name} (${dateLabel}) para editar. ` +
      "Reverta a aprovação (para Enviado) se for o caso.";

    if (recipientIds.size > 0) {
      // Best-effort: a criação da notificação nunca deve derrubar o pedido.
      await createInAppNotifications(
        [...recipientIds].map((userId) => ({
          userId,
          event: REOPEN_EVENT,
          title,
          body,
          href: APROVACOES_HREF,
        })),
      );
    }

    // Auditoria leve (best-effort; não lança): registra o pedido do consultor.
    const dbUser = await resolveDbUser(user);
    await recordAuditEvent({
      actorUserId: dbUser?.id ?? null,
      entityType: "TimeEntry",
      entityId: entry.id,
      action: "TIME_ENTRY_REOPEN_REQUESTED",
      after: {
        projectId: entry.projectId,
        date: dateLabel,
        notifiedUserIds: [...recipientIds],
      },
    });

    return { ok: true, data: { requested: true } };
  } catch (error) {
    console.error("[horas] requestEntryReopen unexpected error", error);
    return fail("UNEXPECTED", "Erro inesperado. Tente novamente.");
  }
}
