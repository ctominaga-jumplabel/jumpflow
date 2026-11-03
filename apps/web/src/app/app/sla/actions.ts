"use server";

import { revalidatePath } from "next/cache";
import { Prisma, prisma } from "@jumpflow/database";
import type { ActionResult } from "@/lib/actions/result";
import { requirePermission } from "@/lib/auth/guards";
import { FLOW_PERMISSION_CODES } from "@/lib/auth/permission-codes";
import { buildAuditEventData } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { loadSlaCalendar, loadSlaConfig } from "@/lib/db/sla";
import { resolveDbUser } from "@/lib/db/users";
import { isoDateInSaoPaulo, competenceOf, shiftCompetence } from "@/lib/sla/business-days";
import {
  slaConfigUpdateSchema,
  slaProjectRuleSchema,
  stageOrderWarnings,
} from "@/lib/sla/schemas";
import {
  buildInvoiceWindows,
  invoiceWindowWarnings,
} from "@/lib/sla/invoice-windows";
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
      ...before,
      settings: { ...data.settings },
      invoiceTiers: data.invoiceTiers
        ? data.invoiceTiers.map((tier, index) => ({ ...tier, sortOrder: index }))
        : before.invoiceTiers,
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
      // Janelas de NF: a lista enviada substitui as atuais (poucas linhas, sem
      // referencias externas). O before/after do AuditEvent guarda a trilha.
      if (data.invoiceTiers) await tx.slaInvoiceTier.deleteMany({});
      if (data.invoiceTiers && after.invoiceTiers.length > 0) {
        await tx.slaInvoiceTier.createMany({
          data: after.invoiceTiers.map((tier) => ({
            label: tier.label,
            receiptKind: tier.receipt.kind,
            receiptValue: tier.receipt.value,
            receiptMonthOffset: tier.receipt.monthOffset,
            paymentKind: tier.payment.kind,
            paymentValue: tier.payment.value,
            paymentMonthOffset: tier.payment.monthOffset,
            sortOrder: tier.sortOrder,
            active: tier.active,
            updatedByUserId: dbUser?.id ?? null,
          })),
        });
      }
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "SlaConfig",
          entityId: "default",
          action: "SLA_CONFIG_UPDATED",
          // projectRules tem CRUD e auditoria proprios.
          before: { ...before, projectRules: undefined },
          after: { ...after, projectRules: undefined },
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
    const warnings = [
      ...stageOrderWarnings(after, competences, calendar),
      ...new Set(
        competences.flatMap((c) => invoiceWindowWarnings(buildInvoiceWindows(after, c, calendar))),
      ),
    ];
    return { ok: true, data: { warnings } };
  } catch (error) {
    console.error("[sla] save config failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Não foi possível salvar a configuração." };
  }
}

/**
 * Cria/atualiza o SLA de um projeto para uma etapa do processo Horas ->
 * Faturamento. Gate: SLA_PROJETOS create (novo) / edit (existente). Um projeto
 * tem no maximo uma regra por etapa (unique projectId+stageKey). Auditado
 * (SLA_PROJECT_RULE_UPSERTED, before/after).
 */
export async function saveSlaProjectRuleAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  // Autoriza antes de validar: create (novo) ou edit (com id).
  const isUpdate =
    typeof input === "object" && input !== null && typeof (input as { id?: unknown }).id === "string";
  const user = await requirePermission(
    FLOW_PERMISSION_CODES.slaProjects,
    isUpdate ? "edit" : "create",
  );
  const parsed = slaProjectRuleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: parsed.error.issues[0]?.message ?? "Regra inválida.",
    };
  }
  const data = parsed.data;
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "NO_DATABASE", message: "Banco de dados não configurado." };
  }
  try {
    const dbUser = await resolveDbUser(user);
    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
      select: { id: true },
    });
    if (!project) {
      return { ok: false, error: "NOT_FOUND", message: "Projeto não encontrado." };
    }
    const before = data.id
      ? await prisma.slaProjectRule.findUnique({ where: { id: data.id } })
      : await prisma.slaProjectRule.findUnique({
          where: { projectId_stageKey: { projectId: data.projectId, stageKey: data.stageKey } },
        });
    if (data.id && !before) {
      return { ok: false, error: "NOT_FOUND", message: "Regra não encontrada." };
    }
    if (!data.id && before) {
      return {
        ok: false,
        error: "DUPLICATE_ENTRY",
        message: "Este projeto já tem SLA para essa etapa. Edite a regra existente.",
      };
    }
    const fields = {
      projectId: data.projectId,
      stageKey: data.stageKey,
      mode: data.mode,
      businessDays: data.businessDays,
      fixedDay: data.fixedDay,
      monthOffset: data.monthOffset,
      warningBusinessDays: data.warningBusinessDays,
      active: data.active,
      notes: data.notes,
      updatedByUserId: dbUser?.id ?? null,
    };
    const saved = await prisma.$transaction(async (tx) => {
      const row = before
        ? await tx.slaProjectRule.update({ where: { id: before.id }, data: fields })
        : await tx.slaProjectRule.create({ data: fields });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "SlaProjectRule",
          entityId: row.id,
          action: "SLA_PROJECT_RULE_UPSERTED",
          before,
          after: row,
        }),
      });
      return row;
    });
    revalidatePath(SLA_PATH);
    return { ok: true, data: { id: saved.id } };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        error: "DUPLICATE_ENTRY",
        message: "Este projeto já tem SLA para essa etapa.",
      };
    }
    console.error("[sla] save project rule failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Não foi possível salvar o SLA do projeto." };
  }
}

/** Remove o SLA de um projeto (volta ao prazo global). Gate: SLA_PROJETOS delete. */
export async function deleteSlaProjectRuleAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const user = await requirePermission(FLOW_PERMISSION_CODES.slaProjects, "delete");
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "NO_DATABASE", message: "Banco de dados não configurado." };
  }
  const id = typeof input === "object" && input !== null ? (input as { id?: unknown }).id : null;
  if (typeof id !== "string" || id.length === 0) {
    return { ok: false, error: "INVALID_INPUT", message: "Regra inválida." };
  }
  try {
    const dbUser = await resolveDbUser(user);
    const before = await prisma.slaProjectRule.findUnique({ where: { id } });
    if (!before) return { ok: false, error: "NOT_FOUND", message: "Regra não encontrada." };
    await prisma.$transaction(async (tx) => {
      await tx.slaProjectRule.delete({ where: { id } });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "SlaProjectRule",
          entityId: id,
          action: "SLA_PROJECT_RULE_DELETED",
          before,
          after: null,
        }),
      });
    });
    revalidatePath(SLA_PATH);
    return { ok: true, data: null };
  } catch (error) {
    console.error("[sla] delete project rule failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Não foi possível remover o SLA do projeto." };
  }
}
