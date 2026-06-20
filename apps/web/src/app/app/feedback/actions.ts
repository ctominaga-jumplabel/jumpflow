"use server";

import { revalidatePath } from "next/cache";
import { Prisma, prisma } from "@jumpflow/database";
import type { ZodType } from "zod";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { recordAuditEvent } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { canTargetConsultant } from "@/lib/db/feedback";
import { resolveDbUser } from "@/lib/db/users";
import {
  FEEDBACK_WRITE_ROLES,
  canManageFeedback,
} from "@/lib/feedback/visibility";
import {
  feedbackCreateSchema,
  feedbackUpdateSchema,
  feedbackVisibilitySchema,
  type FeedbackCreateInput,
  type FeedbackUpdateInput,
  type FeedbackVisibilityInput,
} from "@/lib/feedback/schemas";

const FEEDBACK_PATH = "/app/feedback";

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
    throw new ActionError(
      "NO_DATABASE",
      "Banco de dados nao configurado para feedback.",
    );
  }
}

function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ActionError("INVALID_INPUT", "Revise os campos informados.");
  }
  return result.data;
}

function toFailure(error: unknown): ActionResult<never> {
  // Never swallow framework control-flow (redirect/notFound) thrown by guards.
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
  console.error("[feedback action] unexpected error", error);
  return {
    ok: false,
    error: "UNEXPECTED",
    message: "Nao foi possivel concluir a acao.",
  };
}

/** Máx. de caracteres do corpo expostos no AuditEvent (LGPD: não logar tudo). */
const AUDIT_BODY_PREVIEW_CHARS = 40;

/**
 * Resumo não sensível do corpo do feedback para o AuditEvent: tamanho e um
 * prefixo curto. Nunca registramos o corpo por extenso (LGPD). `key` permite
 * distinguir antes/depois (ex.: "previousBody") sem expor o texto completo.
 */
function summarizeBody(
  body: string,
  key: "body" | "previousBody" = "body",
): Record<string, number | string> {
  return {
    [`${key}Length`]: body.length,
    [`${key}Preview`]:
      body.length > AUDIT_BODY_PREVIEW_CHARS
        ? `${body.slice(0, AUDIT_BODY_PREVIEW_CHARS)}…`
        : body,
  };
}

async function audit(
  entityId: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  const user = await requireUser();
  const dbUser = await resolveDbUser(user);
  await recordAuditEvent({
    actorUserId: dbUser?.id ?? null,
    entityType: "Feedback",
    entityId,
    action,
    before,
    after,
  });
}

/**
 * Validate that an optional related project/client is coherent: the project (if
 * given) must exist; if both are given the client must be the project's client
 * (US15.01). Returns the resolved clientId to persist (derived from the project
 * when only the project was informed).
 */
async function resolveRelations(
  relatedProjectId?: string,
  relatedClientId?: string,
): Promise<{ projectId: string | null; clientId: string | null }> {
  let projectId: string | null = null;
  let clientId: string | null = relatedClientId ?? null;

  if (relatedProjectId) {
    const project = await prisma.project.findUnique({
      where: { id: relatedProjectId },
      select: { id: true, clientId: true },
    });
    if (!project) {
      throw new ActionError("NOT_FOUND", "Projeto relacionado nao encontrado.");
    }
    projectId = project.id;
    if (clientId && clientId !== project.clientId) {
      throw new ActionError(
        "INVALID_INPUT",
        "O cliente informado nao corresponde ao cliente do projeto.",
      );
    }
    // Coerência: o cliente do feedback é sempre o cliente do projeto.
    clientId = project.clientId;
  } else if (clientId) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });
    if (!client) {
      throw new ActionError("NOT_FOUND", "Cliente relacionado nao encontrado.");
    }
  }

  return { projectId, clientId };
}

/**
 * US15.01 — Registrar feedback sobre um consultor.
 * RBAC: papel de escrita (gestores) + escopo por consultor-alvo no servidor.
 */
export async function createFeedback(
  input: FeedbackCreateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole(FEEDBACK_WRITE_ROLES);
    const parsed = parseInput(feedbackCreateSchema, input);

    if (!(await canTargetConsultant(user, parsed.subjectConsultantId))) {
      throw new ActionError(
        "FORBIDDEN",
        "Voce nao pode registrar feedback para este consultor.",
      );
    }

    const { projectId, clientId } = await resolveRelations(
      parsed.relatedProjectId,
      parsed.relatedClientId,
    );

    const dbUser = await resolveDbUser(user);

    const data = {
      subjectConsultantId: parsed.subjectConsultantId,
      authorUserId: dbUser?.id ?? null,
      type: parsed.type,
      source: parsed.source,
      visibility: parsed.visibility,
      body: parsed.body,
      relatedProjectId: projectId,
      relatedClientId: clientId,
    };
    const created = await prisma.feedback.create({ data });
    // LGPD: nunca logar o corpo cru por extenso no AuditEvent. Guardamos só
    // metadados não sensíveis (tamanho + prefixo curto) para rastrear a mudança.
    const { body, ...dataWithoutBody } = data;
    await audit(created.id, "FEEDBACK_CREATED", null, {
      ...dataWithoutBody,
      ...summarizeBody(body),
    });
    revalidatePath(FEEDBACK_PATH);
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return {
        ok: false,
        error: "NOT_FOUND",
        message: "Consultor, projeto ou cliente informado nao existe.",
      };
    }
    return toFailure(error);
  }
}

/** Shared guard: load the row and assert the caller may manage it (US15.03). */
async function loadManageable(id: string) {
  const user = await requireUser();
  const dbUser = await resolveDbUser(user);
  const row = await prisma.feedback.findUnique({
    where: { id },
    select: {
      id: true,
      authorUserId: true,
      visibility: true,
      body: true,
    },
  });
  if (!row) throw new ActionError("NOT_FOUND", "Feedback nao encontrado.");
  const viewer = { roles: user.roles, userId: dbUser?.id ?? null };
  if (!canManageFeedback(viewer, row.authorUserId)) {
    throw new ActionError(
      "FORBIDDEN",
      "Apenas o autor, PEOPLE ou ADMIN podem alterar este feedback.",
    );
  }
  return row;
}

/**
 * US15.03 — Editar conteúdo e/ou visibilidade. Mudança gera AuditEvent
 * (before/after) com motivo opcional. Apenas autor/PEOPLE/ADMIN.
 */
export async function updateFeedback(
  input: FeedbackUpdateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const parsed = parseInput(feedbackUpdateSchema, input);
    const previous = await loadManageable(parsed.id);
    const after = { visibility: parsed.visibility, body: parsed.body };
    await prisma.feedback.update({
      where: { id: parsed.id },
      data: after,
    });
    // LGPD: auditar a mudança sem registrar o corpo cru (antes/depois) — só
    // visibilidade + metadados não sensíveis do corpo (tamanho + prefixo).
    await audit(
      parsed.id,
      "FEEDBACK_UPDATED",
      {
        visibility: previous.visibility,
        ...summarizeBody(previous.body, "previousBody"),
      },
      {
        visibility: parsed.visibility,
        ...summarizeBody(parsed.body),
        reason: parsed.reason ?? null,
      },
    );
    revalidatePath(FEEDBACK_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * US15.03 — Alterar visibilidade (PRIVATE↔SHARED) sem reabrir o corpo.
 * Mudança de visibilidade é o ponto sensível de LGPD: sempre auditada.
 */
export async function setFeedbackVisibility(
  input: FeedbackVisibilityInput,
): Promise<ActionResult<{ visibility: "PRIVATE" | "SHARED" }>> {
  try {
    ensureDatabase();
    const parsed = parseInput(feedbackVisibilitySchema, input);
    const previous = await loadManageable(parsed.id);
    if (previous.visibility === parsed.visibility) {
      return { ok: true, data: { visibility: parsed.visibility } };
    }
    await prisma.feedback.update({
      where: { id: parsed.id },
      data: { visibility: parsed.visibility },
    });
    await audit(
      parsed.id,
      "FEEDBACK_VISIBILITY_CHANGED",
      { visibility: previous.visibility },
      { visibility: parsed.visibility, reason: parsed.reason ?? null },
    );
    revalidatePath(FEEDBACK_PATH);
    return { ok: true, data: { visibility: parsed.visibility } };
  } catch (error) {
    return toFailure(error);
  }
}
