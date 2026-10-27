"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@jumpflow/database";
import type { ActionResult } from "@/lib/actions/result";
import { requirePermission } from "@/lib/auth/guards";
import { FLOW_PERMISSION_CODES } from "@/lib/auth/permission-codes";
import { buildAuditEventData } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { loadSlaCalendar, loadSlaConfig } from "@/lib/db/sla";
import { resolveDbUser } from "@/lib/db/users";
import { isoDateInSaoPaulo, competenceOf, shiftCompetence } from "@/lib/sla/business-days";
import { slaConfigUpdateSchema, stageOrderWarnings } from "@/lib/sla/schemas";
import type { SlaConfig } from "@/lib/sla/types";

const SLA_PATH = "/app/sla";

/**
 * Salva a configuracao de SLA (dia de pagamento, feriados estaduais e, por
 * etapa: nome, dias uteis, aviso e ativo). Gate: SLA_CONFIGURACAO edit (seed:
 * ADMIN + FINANCE). Zod no servidor; area/ancora/ordem NAO sao editaveis aqui
 * (definem o fluxo). Grava tudo numa transacao com um AuditEvent
 * SLA_CONFIG_UPDATED (before/after). Avisos de ordem dos prazos nao bloqueiam:
 * voltam para a tela.
 */
export async function saveSlaConfigAction(
  input: unknown,
): Promise<ActionResult<{ warnings: string[] }>> {
  const user = await requirePermission(FLOW_PERMISSION_CODES.slaSettings, "edit");
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "NO_DATABASE", message: "Banco de dados não configurado." };
  }
  const parsed = slaConfigUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: parsed.error.issues[0]?.message ?? "Configuração inválida.",
    };
  }
  try {
    const dbUser = await resolveDbUser(user);
    const before = await loadSlaConfig();
    const data = parsed.data;
    const byKey = new Map(data.stages.map((s) => [`${s.process}:${s.stageKey}`, s]));
    const after: SlaConfig = {
      settings: { ...data.settings },
      stages: before.stages.map((stage) => {
        const update = byKey.get(`${stage.process}:${stage.stageKey}`);
        return update
          ? {
              ...stage,
              label: update.label,
              businessDays: update.businessDays,
              warningBusinessDays: update.warningBusinessDays,
              active: update.active,
            }
          : stage;
      }),
    };

    await prisma.$transaction(async (tx) => {
      await tx.slaSettings.upsert({
        where: { id: "default" },
        create: { id: "default", ...data.settings, updatedByUserId: dbUser?.id ?? null },
        update: { ...data.settings, updatedByUserId: dbUser?.id ?? null },
      });
      for (const stage of after.stages) {
        const fields = {
          label: stage.label,
          businessDays: stage.businessDays,
          warningBusinessDays: stage.warningBusinessDays,
          active: stage.active,
          updatedByUserId: dbUser?.id ?? null,
        };
        await tx.slaStage.upsert({
          where: { process_stageKey: { process: stage.process, stageKey: stage.stageKey } },
          create: {
            process: stage.process,
            stageKey: stage.stageKey,
            area: stage.area,
            anchor: stage.anchor,
            sortOrder: stage.sortOrder,
            ...fields,
          },
          update: fields,
        });
      }
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "SlaConfig",
          entityId: "default",
          action: "SLA_CONFIG_UPDATED",
          before,
          after,
        }),
      });
    });

    const start = competenceOf(isoDateInSaoPaulo(new Date()));
    const competences = [0, 1, 2].map((i) => shiftCompetence(start, i));
    const { calendar } = await loadSlaCalendar(
      competences[0],
      competences[2],
      after.settings.considerStateHolidays,
    );
    revalidatePath(SLA_PATH);
    return { ok: true, data: { warnings: stageOrderWarnings(after, competences, calendar) } };
  } catch (error) {
    console.error("[sla] save config failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Não foi possível salvar a configuração." };
  }
}
