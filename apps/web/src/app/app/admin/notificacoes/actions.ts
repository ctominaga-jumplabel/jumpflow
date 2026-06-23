"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { requireRole } from "@/lib/auth/guards";
import { recordAuditEvent } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { resolveDbUser } from "@/lib/db/users";

/**
 * Server actions for the notification rules admin screen
 * (`/app/admin/notificacoes`). ADMIN-only; every change is audited. Drives the
 * notification engine (lib/automation/notifications).
 */
const ROUTE = "/app/admin/notificacoes";

const noDatabase = (): ActionResult<never> => ({
  ok: false,
  error: "NO_DATABASE",
  message: "Banco de dados não configurado.",
});

const eventEnum = z.enum([
  "HOURS_RELEASED",
  "CLIENT_BILLING_SUMMARY",
  "OVERTIME_ALERT",
  "PROJECT_CREATED",
  "INVOICING_OVERDUE",
  "COMMERCIAL_CONTRACT_MISSING",
]);
const scopeEnum = z.enum(["GLOBAL", "PROJECT", "ALLOCATION"]);
const channelEnum = z.enum(["EMAIL", "TEAMS"]);
const recipientTypeEnum = z.enum([
  "STATIC",
  "ROLE",
  "PROJECT_MANAGER",
  "CLIENT_CONTACT",
]);

const createRuleSchema = z
  .object({
    event: eventEnum,
    scope: scopeEnum,
    scopeId: z.string().min(1).nullable().optional(),
    channel: channelEnum,
    groupByRecipient: z.boolean(),
  })
  .refine((v) => v.scope === "GLOBAL" || Boolean(v.scopeId), {
    message: "Selecione o alvo do escopo.",
    path: ["scopeId"],
  });

export type CreateRuleFormInput = z.infer<typeof createRuleSchema>;

async function adminActor() {
  const user = await requireRole(["ADMIN"]);
  const actor = await resolveDbUser(user);
  return actor;
}

export async function createRule(
  input: CreateRuleFormInput,
): Promise<ActionResult<{ id: string }>> {
  const actor = await adminActor();
  if (!isDatabaseConfigured()) return noDatabase();
  const parsed = createRuleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }
  try {
    const { createNotificationRule } = await import("@/lib/db/notification-rules");
    const created = await createNotificationRule(parsed.data);
    await recordAuditEvent({
      actorUserId: actor?.id ?? null,
      entityType: "NotificationRule",
      entityId: created.id,
      action: "NOTIFICATION_RULE_CREATED",
      after: parsed.data,
    });
    revalidatePath(ROUTE);
    return { ok: true, data: created };
  } catch (error) {
    console.error("[notificacoes] createRule failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Falha ao criar regra." };
  }
}

const toggleSchema = z.object({ id: z.string().min(1), active: z.boolean() });

export async function toggleRuleActive(
  input: z.infer<typeof toggleSchema>,
): Promise<ActionResult<{ id: string; active: boolean }>> {
  const actor = await adminActor();
  if (!isDatabaseConfigured()) return noDatabase();
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "INVALID_INPUT", message: "Dados inválidos." };
  }
  try {
    const { setNotificationRuleActive } = await import("@/lib/db/notification-rules");
    await setNotificationRuleActive(parsed.data.id, parsed.data.active);
    await recordAuditEvent({
      actorUserId: actor?.id ?? null,
      entityType: "NotificationRule",
      entityId: parsed.data.id,
      action: parsed.data.active ? "NOTIFICATION_RULE_ENABLED" : "NOTIFICATION_RULE_DISABLED",
      after: { active: parsed.data.active },
    });
    revalidatePath(ROUTE);
    return { ok: true, data: parsed.data };
  } catch (error) {
    console.error("[notificacoes] toggleRuleActive failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Falha ao alterar a regra." };
  }
}

const idSchema = z.object({ id: z.string().min(1) });

export async function deleteRule(
  input: z.infer<typeof idSchema>,
): Promise<ActionResult<{ id: string }>> {
  const actor = await adminActor();
  if (!isDatabaseConfigured()) return noDatabase();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "INVALID_INPUT", message: "Dados inválidos." };
  }
  try {
    const { deleteNotificationRule } = await import("@/lib/db/notification-rules");
    await deleteNotificationRule(parsed.data.id);
    await recordAuditEvent({
      actorUserId: actor?.id ?? null,
      entityType: "NotificationRule",
      entityId: parsed.data.id,
      action: "NOTIFICATION_RULE_DELETED",
    });
    revalidatePath(ROUTE);
    return { ok: true, data: parsed.data };
  } catch (error) {
    console.error("[notificacoes] deleteRule failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Falha ao remover a regra." };
  }
}

const addRecipientSchema = z
  .object({
    ruleId: z.string().min(1),
    type: recipientTypeEnum,
    channel: channelEnum,
    address: z.string().trim().min(1).optional(),
    name: z.string().trim().optional(),
  })
  .refine((v) => v.type === "PROJECT_MANAGER" || v.type === "CLIENT_CONTACT" || Boolean(v.address), {
    message: "Informe o e-mail, URL ou papel.",
    path: ["address"],
  });

export type AddRecipientFormInput = z.infer<typeof addRecipientSchema>;

export async function addRecipient(
  input: AddRecipientFormInput,
): Promise<ActionResult<{ id: string }>> {
  const actor = await adminActor();
  if (!isDatabaseConfigured()) return noDatabase();
  const parsed = addRecipientSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }
  try {
    const { addNotificationRecipient } = await import("@/lib/db/notification-rules");
    const created = await addNotificationRecipient(parsed.data);
    await recordAuditEvent({
      actorUserId: actor?.id ?? null,
      entityType: "NotificationRecipient",
      entityId: created.id,
      action: "NOTIFICATION_RECIPIENT_ADDED",
      after: { ruleId: parsed.data.ruleId, type: parsed.data.type, channel: parsed.data.channel },
    });
    revalidatePath(ROUTE);
    return { ok: true, data: created };
  } catch (error) {
    console.error("[notificacoes] addRecipient failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Falha ao adicionar destinatário." };
  }
}

export async function removeRecipient(
  input: z.infer<typeof idSchema>,
): Promise<ActionResult<{ id: string }>> {
  const actor = await adminActor();
  if (!isDatabaseConfigured()) return noDatabase();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "INVALID_INPUT", message: "Dados inválidos." };
  }
  try {
    const { removeNotificationRecipient } = await import("@/lib/db/notification-rules");
    await removeNotificationRecipient(parsed.data.id);
    await recordAuditEvent({
      actorUserId: actor?.id ?? null,
      entityType: "NotificationRecipient",
      entityId: parsed.data.id,
      action: "NOTIFICATION_RECIPIENT_REMOVED",
    });
    revalidatePath(ROUTE);
    return { ok: true, data: parsed.data };
  } catch (error) {
    console.error("[notificacoes] removeRecipient failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Falha ao remover destinatário." };
  }
}
