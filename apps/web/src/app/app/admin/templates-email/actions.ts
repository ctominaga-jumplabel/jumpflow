"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { requirePermission } from "@/lib/auth/guards";
import { FLOW_PERMISSION_CODES } from "@/lib/auth/permission-codes";
import { invalidateEmailTemplateCache } from "@/lib/automation/email/apply-template";
import { getEmailTransport } from "@/lib/automation/email-transport";
import { inlinePreviewHtml } from "@/lib/automation/email/inline-assets";
import {
  NOTIFICATION_EVENTS,
  blockKeysOf,
  getEmailTemplateDefinition,
  variableKeysOf,
  type EmailTemplateDefinition,
} from "@/lib/automation/email/template-registry";
import {
  TEMPLATE_LIMITS,
  renderTemplateEmail,
  templateHash,
  validateEmailTemplate,
  type TemplateValidationIssue,
} from "@/lib/automation/email/template-renderer";
import { recordAuditEvent } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { resolveDbUser } from "@/lib/db/users";

/**
 * Server actions da tela de templates de e-mail (`/app/admin/templates-email`).
 * Leitura: CONFIGURACOES_TEMPLATES_EMAIL.view; escrita/teste: .edit. Toda
 * criação/alteração/restauração é auditada (assunto + corpo antes/depois).
 */
const ROUTE = "/app/admin/templates-email";
const CODE = FLOW_PERMISSION_CODES.emailTemplates;

const eventSchema = z.enum(NOTIFICATION_EVENTS);

const draftSchema = z.object({
  event: eventSchema,
  subject: z.string().max(TEMPLATE_LIMITS.subjectMax + 50),
  body: z.string().max(TEMPLATE_LIMITS.bodyMax + 1000),
});

const saveSchema = draftSchema.extend({ active: z.boolean() });

export type EmailTemplateDraft = z.infer<typeof draftSchema>;

function definitionOr(event: string): EmailTemplateDefinition | null {
  return getEmailTemplateDefinition(event);
}

function validateDraft(def: EmailTemplateDefinition, subject: string, body: string) {
  return validateEmailTemplate({
    subject,
    body,
    knownKeys: variableKeysOf(def),
    blockKeys: blockKeysOf(def),
  });
}

function renderDraft(def: EmailTemplateDefinition, subject: string, body: string) {
  return renderTemplateEmail({
    subject,
    body,
    vars: def.sampleVars(),
    blockKeys: blockKeysOf(def),
    defaultTitle: def.defaultTitle,
    brand: def.brand,
  });
}

// ---------------------------------------------------------------------------
// Pré-visualização (sem efeitos)
// ---------------------------------------------------------------------------
export interface EmailTemplatePreview {
  subject: string;
  html: string;
  issues: TemplateValidationIssue[];
}

export async function previewEmailTemplate(
  input: EmailTemplateDraft,
): Promise<ActionResult<EmailTemplatePreview>> {
  await requirePermission(CODE, "view");
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "INVALID_INPUT", message: "Dados inválidos." };
  }
  const def = definitionOr(parsed.data.event);
  if (!def) {
    return { ok: false, error: "NOT_FOUND", message: "Este evento não envia e-mail." };
  }
  try {
    const validation = validateDraft(def, parsed.data.subject, parsed.data.body);
    const rendered = renderDraft(def, parsed.data.subject, parsed.data.body);
    return {
      ok: true,
      data: {
        subject: rendered.subject,
        html: inlinePreviewHtml(rendered.html),
        issues: validation.issues,
      },
    };
  } catch (error) {
    console.error("[templates-email] preview failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Falha ao gerar a pré-visualização." };
  }
}

// ---------------------------------------------------------------------------
// Salvar (cria/atualiza)
// ---------------------------------------------------------------------------
export async function saveEmailTemplate(
  input: z.infer<typeof saveSchema>,
): Promise<ActionResult<{ event: string; created: boolean }>> {
  const user = await requirePermission(CODE, "edit");
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "NO_DATABASE", message: "Banco de dados não configurado." };
  }
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "INVALID_INPUT", message: "Dados inválidos." };
  }
  const { event, active } = parsed.data;
  const subject = parsed.data.subject.trim();
  const body = parsed.data.body.replace(/\r\n?/g, "\n").trimEnd();
  const def = definitionOr(event);
  if (!def) {
    return { ok: false, error: "NOT_FOUND", message: "Este evento não envia e-mail." };
  }
  const validation = validateDraft(def, subject, body);
  if (!validation.ok) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: validation.issues[0]?.message ?? "Template inválido.",
    };
  }

  try {
    const actor = await resolveDbUser(user);
    const { getEmailTemplate, upsertEmailTemplate } = await import("@/lib/db/email-templates");
    const before = await getEmailTemplate(event);
    const saved = await upsertEmailTemplate({
      event,
      subject,
      body,
      active,
      updatedByUserId: actor?.id ?? null,
    });
    await recordAuditEvent({
      actorUserId: actor?.id ?? null,
      entityType: "EmailTemplate",
      entityId: saved.id,
      action: before ? "EMAIL_TEMPLATE_UPDATED" : "EMAIL_TEMPLATE_CREATED",
      before: before
        ? {
            event,
            subject: before.subject,
            body: before.body,
            bodyHash: templateHash(before.body),
            active: before.active,
          }
        : null,
      after: { event, subject, body, bodyHash: templateHash(body), active },
    });
    invalidateEmailTemplateCache(event);
    revalidatePath(ROUTE);
    return { ok: true, data: { event, created: !before } };
  } catch (error) {
    console.error("[templates-email] save failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Falha ao salvar o template." };
  }
}

// ---------------------------------------------------------------------------
// Restaurar padrão (remove a personalização)
// ---------------------------------------------------------------------------
export async function restoreEmailTemplateDefault(input: {
  event: string;
}): Promise<ActionResult<{ event: string; removed: boolean }>> {
  const user = await requirePermission(CODE, "edit");
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "NO_DATABASE", message: "Banco de dados não configurado." };
  }
  const parsed = z.object({ event: eventSchema }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "INVALID_INPUT", message: "Dados inválidos." };
  }
  const { event } = parsed.data;
  try {
    const actor = await resolveDbUser(user);
    const { getEmailTemplate, deleteEmailTemplate } = await import("@/lib/db/email-templates");
    const before = await getEmailTemplate(event);
    if (!before) return { ok: true, data: { event, removed: false } };
    await deleteEmailTemplate(event);
    await recordAuditEvent({
      actorUserId: actor?.id ?? null,
      entityType: "EmailTemplate",
      entityId: before.id,
      action: "EMAIL_TEMPLATE_RESTORED_DEFAULT",
      before: {
        event,
        subject: before.subject,
        body: before.body,
        bodyHash: templateHash(before.body),
        active: before.active,
      },
      after: null,
    });
    invalidateEmailTemplateCache(event);
    revalidatePath(ROUTE);
    return { ok: true, data: { event, removed: true } };
  } catch (error) {
    console.error("[templates-email] restore failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Falha ao restaurar o padrão." };
  }
}

// ---------------------------------------------------------------------------
// Enviar teste para o próprio usuário (dados de exemplo, assunto [TESTE])
// ---------------------------------------------------------------------------
export async function sendEmailTemplateTest(
  input: EmailTemplateDraft,
): Promise<ActionResult<{ to: string; provider: string }>> {
  const user = await requirePermission(CODE, "edit");
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "INVALID_INPUT", message: "Dados inválidos." };
  }
  const def = definitionOr(parsed.data.event);
  if (!def) {
    return { ok: false, error: "NOT_FOUND", message: "Este evento não envia e-mail." };
  }
  const to = (user.email ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return { ok: false, error: "NO_EMAIL", message: "Seu usuário não tem e-mail válido." };
  }
  const validation = validateDraft(def, parsed.data.subject, parsed.data.body);
  if (!validation.ok) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: validation.issues[0]?.message ?? "Template inválido.",
    };
  }
  try {
    const rendered = renderDraft(def, parsed.data.subject, parsed.data.body);
    const sent = await getEmailTransport().send({
      to: [to],
      subject: `[TESTE] ${rendered.subject}`,
      text: rendered.text,
      html: rendered.html,
    });
    console.info("[templates-email] test sent", {
      event: def.event,
      userId: user.id,
      provider: sent.provider,
      messageId: sent.id,
    });
    return { ok: true, data: { to, provider: sent.provider } };
  } catch (error) {
    console.error("[templates-email] test send failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Falha ao enviar o e-mail de teste." };
  }
}
