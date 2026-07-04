"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma, prisma } from "@jumpflow/database";
import type { ZodType } from "zod";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import { requirePermission, requireUser } from "@/lib/auth/guards";
import { recordAuditEvent } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  canTargetConsultant,
  canViewCheckpointInScope,
  getCheckpointAudioSignedUrl,
} from "@/lib/db/checkpoint";
import { resolveDbUser } from "@/lib/db/users";
import { canManageCheckpoint } from "@/lib/checkpoint/visibility";
import {
  isCheckpointAiEnabled,
  isCheckpointVoiceEnabled,
} from "@/lib/checkpoint/flags";
import {
  CHECKPOINT_AUDIO_BUCKET,
  getCheckpointAudioStorageProvider,
  isStorageConfigured,
} from "@/lib/storage/provider";
import { buildCheckpointAudioKey } from "@/lib/storage/file-validation";
import {
  ALLOWED_AUDIO_MIME_TYPES,
  MAX_AUDIO_BYTES,
  transcribeAudio,
} from "@/lib/transcription/transcribe";
import { getAiTextProvider } from "@/lib/ai/provider";
import { recordAiUsage } from "@/lib/ai/log";
import {
  CHECKPOINT_EXTRACTION_MODEL,
  buildExtractionPrompt,
  mapExtraction,
  parseExtraction,
  resolveExtractionBody,
  EXTRACTION_SYSTEM_PROMPT,
} from "@/lib/checkpoint/extraction";
import {
  checkpointArchiveSchema,
  checkpointCreateSchema,
  checkpointUpdateSchema,
  checkpointVisibilitySchema,
  insightDecisionSchema,
  type CheckpointArchiveInput,
  type CheckpointCreateInput,
  type CheckpointUpdateInput,
  type CheckpointVisibilityInput,
  type InsightDecisionInput,
} from "@/lib/checkpoint/schemas";

/**
 * Server actions for Checkpoint / 1-on-1 (Melhoria #4, FATIA 2 — registro manual).
 *
 * RBAC fail-closed: `requirePermission("CHECKPOINT", <action>)` (matriz) + escopo
 * de autoria/consultor-alvo no servidor. SÓ GESTOR registra (a permissão view/
 * create/edit é semeada para ADMIN/PEOPLE/AREA_MANAGER/PROJECT_MANAGER). Voz (F3)
 * e IA (F4) NÃO entram aqui. Auditamos mudanças sensíveis SEM logar notes/
 * transcription crus (resumo/contagem só) — espelha o Feedback (LGPD/confiança).
 */

const CHECKPOINT_PATH = "/app/checkpoints";

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
      "Banco de dados nao configurado para checkpoints.",
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
  console.error("[checkpoint action] unexpected error", error);
  return {
    ok: false,
    error: "UNEXPECTED",
    message: "Nao foi possivel concluir a acao.",
  };
}

/**
 * Resumo NÃO sensível de um texto (notes/transcription) para o AuditEvent:
 * SOMENTE o comprimento + um hash curto e não reversível (sha256 do corpo, 12
 * hex chars). NUNCA expomos o corpo cru — nem um prefixo — no AuditEvent
 * (LGPD/confiança). O hash permite distinguir "mudou/não mudou" entre eventos
 * sem revelar conteúdo. `key` distingue campos/antes-depois.
 */
function summarizeText(
  text: string | null | undefined,
  key: string,
): Record<string, number | string | null> {
  if (!text) {
    return { [`${key}Length`]: 0, [`${key}Hash`]: null };
  }
  return {
    [`${key}Length`]: text.length,
    [`${key}Hash`]: createHash("sha256")
      .update(text, "utf8")
      .digest("hex")
      .slice(0, 12),
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
    entityType: "Checkpoint",
    entityId,
    action,
    before,
    after,
  });
}

/**
 * Valida um projeto relacionado opcional: se informado, deve existir. Retorna o
 * projectId a persistir (ou null). Sem cliente próprio — o checkpoint ancora no
 * consultor + projeto (não em cliente, diferente do Feedback).
 */
async function resolveProject(
  relatedProjectId?: string,
): Promise<string | null> {
  if (!relatedProjectId) return null;
  const project = await prisma.project.findUnique({
    where: { id: relatedProjectId },
    select: { id: true },
  });
  if (!project) {
    throw new ActionError("NOT_FOUND", "Projeto relacionado nao encontrado.");
  }
  return project.id;
}

/**
 * Registrar um checkpoint / 1-on-1 sobre um consultor. RBAC: permissão CHECKPOINT
 * create (gestores) + escopo por consultor-alvo no servidor. Nasce PRIVATE por
 * padrão (o consultor não vê) — o gestor pode optar por SHARED no payload.
 */
export async function createCheckpoint(
  input: CheckpointCreateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requirePermission("CHECKPOINT", "create");
    const parsed = parseInput(checkpointCreateSchema, input);

    if (!(await canTargetConsultant(user, parsed.consultantId))) {
      throw new ActionError(
        "FORBIDDEN",
        "Voce nao pode registrar checkpoint para este consultor.",
      );
    }

    const projectId = await resolveProject(parsed.relatedProjectId);
    const dbUser = await resolveDbUser(user);

    const created = await prisma.checkpoint.create({
      data: {
        consultantId: parsed.consultantId,
        managerUserId: dbUser?.id ?? null,
        relatedProjectId: projectId,
        type: parsed.type,
        occurredAt: parsed.occurredAt,
        weekStart: parsed.weekStart ?? null,
        weekEnd: parsed.weekEnd ?? null,
        title: parsed.title ?? null,
        notes: parsed.notes ?? null,
        // Estado inicial: registro manual já é "RECORDED" (texto salvo). Voz/IA
        // (F3/F4) mudam transcription/extraction depois, fora desta fatia.
        status: parsed.notes ? "RECORDED" : "DRAFT",
        visibility: parsed.visibility,
      },
      select: { id: true },
    });

    // Confiança/LGPD: nunca logar notes/transcription crus no AuditEvent — só
    // metadados não sensíveis (tamanho + prefixo) + os campos estruturais.
    await audit(created.id, "CHECKPOINT_CREATED", null, {
      consultantId: parsed.consultantId,
      managerUserId: dbUser?.id ?? null,
      relatedProjectId: projectId,
      type: parsed.type,
      visibility: parsed.visibility,
      occurredAt: parsed.occurredAt.toISOString(),
      ...summarizeText(parsed.notes, "notes"),
    });
    revalidatePath(CHECKPOINT_PATH);
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return {
        ok: false,
        error: "NOT_FOUND",
        message: "Consultor ou projeto informado nao existe.",
      };
    }
    return toFailure(error);
  }
}

/**
 * Carrega a linha e garante que o caller pode gerenciá-la (autor/PEOPLE/ADMIN).
 * `requireAction` é a permissão da matriz a exigir antes da checagem de autoria.
 */
async function loadManageable(
  id: string,
  requireAction: "edit" | "delete",
) {
  const user = await requirePermission("CHECKPOINT", requireAction);
  const dbUser = await resolveDbUser(user);
  const row = await prisma.checkpoint.findUnique({
    where: { id },
    select: {
      id: true,
      managerUserId: true,
      consultantId: true,
      relatedProjectId: true,
      type: true,
      occurredAt: true,
      weekStart: true,
      weekEnd: true,
      title: true,
      notes: true,
      audioStorageKey: true,
      transcription: true,
      transcriptionStatus: true,
      extractionStatus: true,
      extractedAt: true,
      status: true,
      visibility: true,
    },
  });
  if (!row) throw new ActionError("NOT_FOUND", "Checkpoint nao encontrado.");
  const viewer = { roles: user.roles, userId: dbUser?.id ?? null };
  if (!canManageCheckpoint(viewer, row.managerUserId)) {
    throw new ActionError(
      "FORBIDDEN",
      "Apenas o autor, PEOPLE ou ADMIN podem alterar este checkpoint.",
    );
  }
  return row;
}

/**
 * Editar conteúdo (tipo, data, projeto, título, notas, semana). Mudança gera
 * AuditEvent (before/after) SEM logar o corpo cru — só visibilidade/estruturais e
 * metadados do texto. Apenas autor/PEOPLE/ADMIN. Não mexe em visibilidade aqui.
 */
export async function updateCheckpoint(
  input: CheckpointUpdateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const parsed = parseInput(checkpointUpdateSchema, input);
    const previous = await loadManageable(parsed.id, "edit");
    if (previous.status === "ARCHIVED") {
      throw new ActionError(
        "NOT_EDITABLE",
        "Checkpoint arquivado nao pode ser editado.",
      );
    }

    const projectId =
      parsed.relatedProjectId !== undefined
        ? await resolveProject(parsed.relatedProjectId)
        : previous.relatedProjectId;

    const data: Prisma.CheckpointUpdateInput = {};
    if (parsed.type !== undefined) data.type = parsed.type;
    if (parsed.occurredAt !== undefined) data.occurredAt = parsed.occurredAt;
    if (parsed.relatedProjectId !== undefined) {
      data.relatedProject = projectId
        ? { connect: { id: projectId } }
        : { disconnect: true };
    }
    if (parsed.title !== undefined) data.title = parsed.title ?? null;
    if (parsed.notes !== undefined) data.notes = parsed.notes ?? null;
    if (parsed.weekStart !== undefined) data.weekStart = parsed.weekStart ?? null;
    if (parsed.weekEnd !== undefined) data.weekEnd = parsed.weekEnd ?? null;

    await prisma.checkpoint.update({ where: { id: parsed.id }, data });

    await audit(
      parsed.id,
      "CHECKPOINT_UPDATED",
      {
        type: previous.type,
        relatedProjectId: previous.relatedProjectId,
        occurredAt: previous.occurredAt.toISOString(),
        ...summarizeText(previous.notes, "previousNotes"),
      },
      {
        type: parsed.type ?? previous.type,
        relatedProjectId: projectId,
        ...summarizeText(parsed.notes ?? previous.notes, "notes"),
        reason: parsed.reason ?? null,
      },
    );
    revalidatePath(CHECKPOINT_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Alterar visibilidade (PRIVATE↔SHARED) sem reabrir o corpo. Ponto sensível de
 * confiança/LGPD: SHARED libera o resumo ao consultor — sempre auditado. Apenas
 * autor/PEOPLE/ADMIN. Usa a permissão `edit` da matriz.
 */
export async function setVisibility(
  input: CheckpointVisibilityInput,
): Promise<ActionResult<{ visibility: "PRIVATE" | "SHARED" }>> {
  try {
    ensureDatabase();
    const parsed = parseInput(checkpointVisibilitySchema, input);
    const previous = await loadManageable(parsed.id, "edit");
    if (previous.status === "ARCHIVED") {
      throw new ActionError(
        "NOT_EDITABLE",
        "Checkpoint arquivado nao pode mudar de visibilidade.",
      );
    }
    if (previous.visibility === parsed.visibility) {
      return { ok: true, data: { visibility: parsed.visibility } };
    }
    await prisma.checkpoint.update({
      where: { id: parsed.id },
      data: { visibility: parsed.visibility },
    });
    await audit(
      parsed.id,
      "CHECKPOINT_VISIBILITY_CHANGED",
      { visibility: previous.visibility },
      { visibility: parsed.visibility, reason: parsed.reason ?? null },
    );
    revalidatePath(CHECKPOINT_PATH);
    return { ok: true, data: { visibility: parsed.visibility } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Arquivar (soft delete operacional → status ARCHIVED). Não retrocede; o registro
 * some das listas (whereForScope oculta ARCHIVED). Apenas autor/PEOPLE/ADMIN.
 * Usa a permissão `delete` da matriz (semeada só p/ PEOPLE/ADMIN). Auditado.
 */
export async function archiveCheckpoint(
  input: CheckpointArchiveInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const parsed = parseInput(checkpointArchiveSchema, input);
    const previous = await loadManageable(parsed.id, "delete");
    if (previous.status === "ARCHIVED") {
      return { ok: true, data: { id: parsed.id } };
    }
    await prisma.checkpoint.update({
      where: { id: parsed.id },
      data: { status: "ARCHIVED" },
    });
    await audit(
      parsed.id,
      "CHECKPOINT_ARCHIVED",
      { status: previous.status },
      { status: "ARCHIVED", reason: parsed.reason ?? null },
    );
    revalidatePath(CHECKPOINT_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FATIA 3 — voz: upload de áudio + transcrição (atrás de flag, off por padrão)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tipo de MIME → extensão coerente para o áudio do checkpoint. Espelha o
 * allow-list do seam de transcrição (`ALLOWED_AUDIO_MIME_TYPES`) e amarra a
 * extensão do arquivo ao tipo declarado (anti-spoofing leve, como nos demais
 * anexos). Não é I/O — fica local à action.
 */
const AUDIO_MIME_EXTENSIONS: Record<string, readonly string[]> = {
  "audio/webm": [".webm"],
  "audio/mpeg": [".mp3", ".mpeg", ".mpga"],
  "audio/mp3": [".mp3"],
  "audio/wav": [".wav"],
  "audio/x-wav": [".wav"],
  "audio/mp4": [".mp4", ".m4a"],
  "audio/m4a": [".m4a"],
  "audio/x-m4a": [".m4a"],
  "audio/ogg": [".ogg", ".oga"],
};

/** Lowercased extension of `name` including the dot, or "" when absent. */
function audioExtensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index).toLowerCase();
}

/**
 * Valida os METADADOS do arquivo de áudio antes de qualquer upload. A validação
 * do BUFFER (mimetype + tamanho) é refeita pelo seam de transcrição na hora de
 * transcrever; aqui validamos o File recebido no upload. Lança ActionError com
 * código tipado. Mantemos o cap alinhado ao seam (MAX_AUDIO_BYTES).
 */
function validateAudioFile(file: File): void {
  const type = file.type?.trim().toLowerCase();
  const allowedExtensions = type ? AUDIO_MIME_EXTENSIONS[type] : undefined;
  if (!allowedExtensions) {
    throw new ActionError(
      "INVALID_FILE",
      `Formato de audio nao suportado. Aceitos: ${ALLOWED_AUDIO_MIME_TYPES.join(", ")}.`,
    );
  }
  const extension = audioExtensionOf(file.name);
  if (!allowedExtensions.includes(extension)) {
    throw new ActionError(
      "INVALID_FILE",
      "Extensao do arquivo nao corresponde ao tipo de audio enviado.",
    );
  }
  if (file.size <= 0) {
    throw new ActionError("FILE_TOO_LARGE", "Audio vazio.");
  }
  if (file.size > MAX_AUDIO_BYTES) {
    throw new ActionError(
      "FILE_TOO_LARGE",
      `Audio acima de ${Math.floor(MAX_AUDIO_BYTES / (1024 * 1024))} MB.`,
    );
  }
}

/**
 * Anexar uma gravação de voz a um checkpoint (Melhoria #4, F3). FormData com
 * `checkpointId` + `file`. Gateado pela flag de voz (off → recusa honesta), por
 * `requirePermission("CHECKPOINT","edit")` + autoria/gestão da linha
 * (loadManageable). Valida o arquivo, faz upload no bucket privado
 * (checkpoint-audio) e grava `audioStorageKey` + `transcriptionStatus=PENDING`.
 *
 * Degradação honesta: sem storage configurado → NO_STORAGE (NÃO finge upload).
 * O registro manual do checkpoint segue válido independente do áudio.
 *
 * Idempotência simples: ao reanexar, o áudio anterior é removido do bucket
 * (best-effort) antes de gravar a nova chave — não acumulamos órfãos.
 */
export async function attachCheckpointAudio(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    // Flag F3 off → voz indisponível (honesto, fail-closed). Antes de tocar RBAC
    // ou storage: a funcionalidade simplesmente não existe quando desligada.
    if (!isCheckpointVoiceEnabled()) {
      return {
        ok: false,
        error: "FORBIDDEN",
        message: "Registro por voz esta desativado.",
      };
    }
    if (!isStorageConfigured()) {
      throw new ActionError(
        "NO_STORAGE",
        "Audio indisponivel: storage nao configurado.",
      );
    }

    const checkpointId = formData.get("checkpointId");
    if (typeof checkpointId !== "string" || !checkpointId.trim()) {
      throw new ActionError("INVALID_INPUT", "Identificador obrigatorio.");
    }
    // RBAC + autoria: só o autor/PEOPLE/ADMIN (gestor da linha) anexa áudio.
    const row = await loadManageable(checkpointId.trim(), "edit");
    if (row.status === "ARCHIVED") {
      throw new ActionError(
        "NOT_EDITABLE",
        "Checkpoint arquivado nao aceita audio.",
      );
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new ActionError("INVALID_FILE", "Nenhum arquivo de audio enviado.");
    }
    validateAudioFile(file);

    const provider = getCheckpointAudioStorageProvider()!;
    const storageKey = buildCheckpointAudioKey(row.id, file.name);
    await provider.upload(storageKey, await file.arrayBuffer(), file.type);

    const previousKey = row.audioStorageKey;
    // Reanexar áudio invalida a transcrição (e a extração dela derivada): o
    // texto antigo não corresponde mais ao áudio atual. Limpamos `transcription`
    // e voltamos `transcriptionStatus` para PENDING (fila de retranscrição). Se a
    // extração estava DONE (a partir da transcrição agora obsoleta), voltamos
    // extractionStatus → NONE e limpamos extractedAt para SINALIZAR reprocesso —
    // SEM apagar Opportunity/Case já criados/decididos (curadoria humana fica).
    const audioReplaced = Boolean(previousKey) && previousKey !== storageKey;
    const data: Prisma.CheckpointUpdateInput = {
      audioStorageKey: storageKey,
      transcriptionStatus: "PENDING",
    };
    if (audioReplaced) {
      data.transcription = null;
      if (row.extractionStatus === "DONE") {
        data.extractionStatus = "NONE";
        data.extractedAt = null;
      }
    }
    try {
      await prisma.checkpoint.update({
        where: { id: row.id },
        data,
      });
    } catch (error) {
      // Limpa o objeto órfão recém-enviado (órfão no bucket é tolerável; linha
      // de DB inconsistente não é).
      try {
        await provider.delete(storageKey);
      } catch (cleanupError) {
        console.error(
          "[checkpoint] failed to clean up unreferenced audio",
          cleanupError,
        );
      }
      throw error;
    }

    // Best-effort: remove o áudio anterior do bucket após repointar a linha.
    if (previousKey && previousKey !== storageKey) {
      try {
        await provider.delete(previousKey);
      } catch (cleanupError) {
        console.error(
          "[checkpoint] failed to delete replaced audio",
          cleanupError,
        );
      }
    }

    // Auditoria: registra o evento SEM logar o áudio nem qualquer corpo cru.
    // Reflete a invalidação da transcrição/extração quando o áudio foi trocado.
    await audit(
      row.id,
      "CHECKPOINT_AUDIO_ATTACHED",
      {
        transcriptionStatus: row.transcriptionStatus,
        extractionStatus: row.extractionStatus,
      },
      {
        transcriptionStatus: "PENDING",
        ...(audioReplaced
          ? {
              transcriptionCleared: true,
              extractionStatus: data.extractionStatus ?? row.extractionStatus,
            }
          : {}),
        bucket: CHECKPOINT_AUDIO_BUCKET,
        contentType: file.type,
        size: file.size,
      },
    );
    revalidatePath(CHECKPOINT_PATH);
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Resultado honesto da transcrição. `unavailable` distingue "transcrição
 * indisponível" (flag off OU provider noop/sem credencial) de um sucesso real.
 * NUNCA inventamos texto: sem provider, nada é gravado em `transcription`.
 */
export type CheckpointTranscribeResult = {
  unavailable: boolean;
  status: "NONE" | "PENDING" | "DONE" | "FAILED";
};

/**
 * Transcrever o áudio de um checkpoint (Melhoria #4, F3). RBAC: CHECKPOINT.edit
 * + autoria/gestão (loadManageable) — mexe no cru. Lê o áudio do bucket, chama o
 * seam reusável `transcribeAudio` e:
 *
 * - flag de voz off → recusa honesta (FORBIDDEN), sem tocar o status;
 * - sem áudio anexado → NOT_FOUND honesto;
 * - DISABLED / NO_RESULT (sem provider/credencial) → NÃO inventa texto: o status
 *   VOLTA para NONE e retornamos `unavailable: true` (transcrição indisponível);
 * - INVALID_TYPE / INVALID_SIZE → FAILED (o áudio armazenado é inválido);
 * - sucesso → grava `transcription` + `transcriptionStatus=DONE`.
 *
 * Auditoria: NUNCA loga a transcrição crua — só status/idioma/tamanho.
 */
export async function transcribeCheckpoint(
  checkpointId: string,
): Promise<ActionResult<CheckpointTranscribeResult>> {
  try {
    ensureDatabase();
    if (!isCheckpointVoiceEnabled()) {
      return {
        ok: false,
        error: "FORBIDDEN",
        message: "Registro por voz esta desativado.",
      };
    }
    if (typeof checkpointId !== "string" || !checkpointId.trim()) {
      throw new ActionError("INVALID_INPUT", "Identificador obrigatorio.");
    }
    const row = await loadManageable(checkpointId.trim(), "edit");
    if (row.status === "ARCHIVED") {
      throw new ActionError(
        "NOT_EDITABLE",
        "Checkpoint arquivado nao pode ser transcrito.",
      );
    }
    if (!row.audioStorageKey) {
      throw new ActionError(
        "NOT_FOUND",
        "Nenhum audio anexado a este checkpoint.",
      );
    }
    if (!isStorageConfigured()) {
      // Sem storage não há como ler o áudio — honesto, sem inventar transcrição.
      return {
        ok: false,
        error: "NO_STORAGE",
        message: "Audio indisponivel: storage nao configurado.",
      };
    }
    const provider = getCheckpointAudioStorageProvider();
    if (!provider) {
      return {
        ok: false,
        error: "NO_STORAGE",
        message: "Audio indisponivel: storage nao configurado.",
      };
    }

    // Lê o objeto via URL assinada de curtíssima duração (mesma porta de leitura
    // do storage) e baixa o buffer para o provider de transcrição.
    const signedUrl = await provider.getSignedUrl(row.audioStorageKey, 120);
    const response = await fetch(signedUrl);
    if (!response.ok) {
      throw new ActionError(
        "UNEXPECTED",
        "Nao foi possivel ler o audio armazenado.",
      );
    }
    const mimeType =
      response.headers.get("content-type")?.split(";")[0]?.trim() ||
      "audio/webm";
    const audio = new Uint8Array(await response.arrayBuffer());

    const outcome = await transcribeAudio({
      audio,
      mimeType,
      languageHint: "pt-BR",
      entityType: "Checkpoint",
      entityId: row.id,
    });

    if (!outcome.ok) {
      // DISABLED / NO_RESULT → indisponível, honesto: status volta a NONE, nada
      // gravado em transcription (NÃO inventamos texto).
      if (outcome.reason === "DISABLED" || outcome.reason === "NO_RESULT") {
        if (row.transcriptionStatus !== "NONE") {
          await prisma.checkpoint.update({
            where: { id: row.id },
            data: { transcriptionStatus: "NONE" },
          });
        }
        await audit(
          row.id,
          "CHECKPOINT_TRANSCRIPTION_UNAVAILABLE",
          { transcriptionStatus: row.transcriptionStatus },
          { transcriptionStatus: "NONE", reason: outcome.reason },
        );
        return {
          ok: true,
          data: { unavailable: true, status: "NONE" },
        };
      }
      // INVALID_TYPE / INVALID_SIZE → o áudio armazenado é inválido: FAILED.
      await prisma.checkpoint.update({
        where: { id: row.id },
        data: { transcriptionStatus: "FAILED" },
      });
      await audit(
        row.id,
        "CHECKPOINT_TRANSCRIPTION_FAILED",
        { transcriptionStatus: row.transcriptionStatus },
        { transcriptionStatus: "FAILED", reason: outcome.reason },
      );
      return {
        ok: false,
        error: "INVALID_FILE",
        message: outcome.message,
      };
    }

    await prisma.checkpoint.update({
      where: { id: row.id },
      data: {
        transcription: outcome.text,
        transcriptionStatus: "DONE",
      },
    });
    // Auditoria: NUNCA o texto cru — só status/idioma/tamanho da transcrição.
    await audit(
      row.id,
      "CHECKPOINT_TRANSCRIBED",
      { transcriptionStatus: row.transcriptionStatus },
      {
        transcriptionStatus: "DONE",
        language: outcome.language ?? null,
        model: outcome.model ?? null,
        ...summarizeText(outcome.text, "transcription"),
      },
    );
    revalidatePath(CHECKPOINT_PATH);
    return { ok: true, data: { unavailable: false, status: "DONE" } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * URL assinada de curta duração para o áudio CRU de um checkpoint (Melhoria #4,
 * F3). Gateada pela flag de voz + RBAC/escopo de leitura. A autorização real (o
 * consultor avaliado NÃO acessa o cru, mesmo em SHARED) vive em
 * `getCheckpointAudioSignedUrl` (lib/db/checkpoint), que aplica o read-scope +
 * `canViewCheckpointRaw` e devolve um FORBIDDEN anti-enumeração.
 */
export async function getCheckpointAudioUrl(input: {
  checkpointId: string;
}): Promise<ActionResult<{ url: string }>> {
  try {
    ensureDatabase();
    if (!isCheckpointVoiceEnabled()) {
      return {
        ok: false,
        error: "FORBIDDEN",
        message: "Registro por voz esta desativado.",
      };
    }
    // Defense-in-depth: exige CHECKPOINT.view antes de assinar a URL.
    const user = await requirePermission("CHECKPOINT", "view");
    if (
      typeof input?.checkpointId !== "string" ||
      !input.checkpointId.trim()
    ) {
      throw new ActionError("INVALID_INPUT", "Identificador obrigatorio.");
    }
    return await getCheckpointAudioSignedUrl(user, input.checkpointId.trim());
  } catch (error) {
    return toFailure(error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FATIA 4 — pipeline de IA (extração de insights) + validação humana
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resultado da extração por IA. `unavailable` distingue honestamente "IA
 * indisponível" (flag off OU provider noop → `complete` retornou null) de um
 * sucesso real. NÃO mockamos em produção: sem provider, o checkpoint permanece
 * extractionStatus=NONE e nada é criado.
 */
export type ExtractionResult = {
  unavailable: boolean;
  skills: number;
  opportunities: number;
  cases: number;
};

/**
 * Garante uma janela semanal válida para a SkillSuggestion (o model exige
 * weekStart/weekEnd não nulos). Usa a janela do checkpoint quando presente;
 * senão deriva da semana de `occurredAt` (segunda→domingo, UTC). Puro o
 * suficiente para reuso, mas mantido local à action.
 */
function resolveSkillWindow(row: {
  weekStart: Date | null;
  weekEnd: Date | null;
  occurredAt: Date;
}): { weekStart: Date; weekEnd: Date } {
  if (row.weekStart && row.weekEnd) {
    return { weekStart: row.weekStart, weekEnd: row.weekEnd };
  }
  const base = new Date(row.occurredAt);
  const day = base.getUTCDay(); // 0=domingo
  const diffToMonday = (day + 6) % 7;
  const weekStart = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()),
  );
  weekStart.setUTCDate(weekStart.getUTCDate() - diffToMonday);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  return { weekStart, weekEnd };
}

/**
 * Extrai insights (skills/oportunidades/cases) do corpo do checkpoint via IA.
 * RBAC: requer CHECKPOINT.edit + autoria/gestão da linha (loadManageable). A IA
 * SUGERE; tudo nasce PENDING para curadoria humana.
 *
 * Fallback seguro: se a flag F4 está off OU o provider é noop (`complete`
 * retorna null), extractionStatus permanece NONE e retornamos honestamente
 * `unavailable: true` — NUNCA criamos dados mockados em produção.
 *
 * Idempotência: ao reprocessar, descartamos antes os candidatos PENDING
 * aiGenerated=true DESTE checkpoint (Opportunity/Case) e re-upsertamos as Skills
 * (respeitando @@unique [consultantId, weekStart, suggestedName]) — sem duplicar.
 */
export async function extractCheckpointInsights(
  checkpointId: string,
): Promise<ActionResult<ExtractionResult>> {
  try {
    ensureDatabase();
    // Mesma porta de gestão da edição (autor/PEOPLE/ADMIN) — a IA mexe no cru.
    const row = await loadManageable(checkpointId, "edit");
    if (row.status === "ARCHIVED") {
      throw new ActionError(
        "NOT_EDITABLE",
        "Checkpoint arquivado nao pode ser processado pela IA.",
      );
    }

    const empty: ExtractionResult = {
      unavailable: true,
      skills: 0,
      opportunities: 0,
      cases: 0,
    };

    // Flag F4 off → IA indisponível (honesto), sem tocar extractionStatus.
    if (!isCheckpointAiEnabled()) {
      return { ok: true, data: empty };
    }

    // Sem corpo a analisar → nada a fazer (não é falha de IA).
    const body = resolveExtractionBody({
      transcription: row.transcription,
      notes: row.notes,
    });
    if (!body.trim()) {
      return { ok: true, data: empty };
    }

    const provider = getAiTextProvider();
    const prompt = buildExtractionPrompt({
      transcription: row.transcription,
      notes: row.notes,
      type: row.type,
    });
    const raw = await provider.complete(prompt, {
      model: CHECKPOINT_EXTRACTION_MODEL,
      system: EXTRACTION_SYSTEM_PROMPT,
      maxTokens: 1500,
      entityType: "Checkpoint",
      entityId: checkpointId,
    });

    // Provider noop / indisponível → null. NÃO mexe no status; honesto.
    if (raw === null) {
      return { ok: true, data: empty };
    }

    const parsed = parseExtraction(raw);
    if (!parsed.ok) {
      // Parse inválido → FAILED + log de uso da IA (sem corpo cru).
      await prisma.checkpoint.update({
        where: { id: checkpointId },
        data: { extractionStatus: "FAILED" },
      });
      await recordAiUsage({
        feature: "CHECKPOINT_EXTRACTION",
        model: CHECKPOINT_EXTRACTION_MODEL,
        entityType: "Checkpoint",
        entityId: checkpointId,
        status: "FAILED",
        error: parsed.reason,
      });
      await audit(
        checkpointId,
        "CHECKPOINT_EXTRACTION_FAILED",
        null,
        { reason: parsed.reason },
      );
      return {
        ok: false,
        error: "UNEXPECTED",
        message: "A IA retornou um resultado invalido. Tente novamente.",
      };
    }

    const { weekStart, weekEnd } = resolveSkillWindow(row);
    const mapped = mapExtraction(parsed.data, {
      checkpointId,
      consultantId: row.consultantId,
      weekStart,
      weekEnd,
      relatedProjectId: row.relatedProjectId,
    });

    await prisma.$transaction(async (tx) => {
      // Idempotência: descarta candidatos PENDING aiGenerated DESTE checkpoint
      // antes de recriar (reprocessar não duplica).
      await tx.opportunity.deleteMany({
        where: {
          sourceCheckpointId: checkpointId,
          aiGenerated: true,
          status: "PENDING",
        },
      });
      await tx.case.deleteMany({
        where: {
          sourceCheckpointId: checkpointId,
          aiGenerated: true,
          status: "PENDING",
        },
      });

      for (const s of mapped.skills) {
        // Skills via SkillSuggestion existente: upsert idempotente respeitando
        // o @@unique [consultantId, weekStart, suggestedName].
        await tx.skillSuggestion.upsert({
          where: {
            consultantId_weekStart_suggestedName: {
              consultantId: s.consultantId,
              weekStart: s.weekStart,
              suggestedName: s.suggestedName,
            },
          },
          update: {
            suggestedCategory: s.suggestedCategory,
            suggestedLevel: s.suggestedLevel,
            evidenceSummary: s.evidenceSummary,
            sourceEntryIds: s.sourceEntryIds,
            status: "PENDING",
            decidedAt: null,
          },
          create: {
            consultantId: s.consultantId,
            weekStart: s.weekStart,
            weekEnd: s.weekEnd,
            suggestedName: s.suggestedName,
            suggestedCategory: s.suggestedCategory,
            suggestedLevel: s.suggestedLevel,
            evidenceSummary: s.evidenceSummary,
            sourceEntryIds: s.sourceEntryIds,
          },
        });
      }

      for (const o of mapped.opportunities) {
        await tx.opportunity.create({
          data: {
            sourceCheckpointId: o.sourceCheckpointId,
            consultantId: o.consultantId,
            relatedProjectId: o.relatedProjectId,
            kind: o.kind,
            title: o.title,
            description: o.description,
            priority: o.priority,
            sourceQuote: o.sourceQuote,
            aiGenerated: true,
            status: "PENDING",
          },
        });
      }

      for (const c of mapped.cases) {
        await tx.case.create({
          data: {
            sourceCheckpointId: c.sourceCheckpointId,
            consultantId: c.consultantId,
            relatedProjectId: c.relatedProjectId,
            title: c.title,
            summary: c.summary,
            outcome: c.outcome,
            sourceQuote: c.sourceQuote,
            aiGenerated: true,
            status: "PENDING",
          },
        });
      }

      await tx.checkpoint.update({
        where: { id: checkpointId },
        data: { extractionStatus: "DONE", extractedAt: new Date() },
      });
    });

    await recordAiUsage({
      feature: "CHECKPOINT_EXTRACTION",
      model: CHECKPOINT_EXTRACTION_MODEL,
      entityType: "Checkpoint",
      entityId: checkpointId,
      status: "SUCCESS",
    });
    // Auditamos só contagens — nunca o corpo cru nem os trechos extraídos.
    await audit(checkpointId, "CHECKPOINT_EXTRACTED", null, {
      skills: mapped.skills.length,
      opportunities: mapped.opportunities.length,
      cases: mapped.cases.length,
    });
    revalidatePath(CHECKPOINT_PATH);
    return {
      ok: true,
      data: {
        unavailable: false,
        skills: mapped.skills.length,
        opportunities: mapped.opportunities.length,
        cases: mapped.cases.length,
      },
    };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Decisão humana sobre uma Oportunidade gerada pela IA: aceitar (ACCEPTED) ou
 * descartar (DISMISSED). RBAC: OPPORTUNITY.edit. Grava status + decidedByUserId
 * + decidedAt e audita. (A UI desta decisão vem na F5.)
 */
export async function decideOpportunity(
  input: InsightDecisionInput,
): Promise<ActionResult<{ id: string; status: "ACCEPTED" | "DISMISSED" }>> {
  try {
    ensureDatabase();
    const user = await requirePermission("OPPORTUNITY", "edit");
    const parsed = parseInput(insightDecisionSchema, input);
    const dbUser = await resolveDbUser(user);

    const existing = await prisma.opportunity.findUnique({
      where: { id: parsed.id },
      select: { id: true, status: true, sourceCheckpointId: true },
    });
    if (!existing) {
      throw new ActionError("NOT_FOUND", "Oportunidade nao encontrada.");
    }
    // Escopo de origem: além de OPPORTUNITY.edit (matriz), o viewer só decide um
    // insight cuja origem (checkpoint) ele poderia ver/gerenciar — caso contrário
    // um gestor do time A decidiria insight de checkpoint PRIVATE do time B.
    // Anti-enumeração: fora de escopo colapsa no MESMO NOT_FOUND de inexistente.
    if (
      existing.sourceCheckpointId &&
      !(await canViewCheckpointInScope(user, existing.sourceCheckpointId))
    ) {
      throw new ActionError("NOT_FOUND", "Oportunidade nao encontrada.");
    }
    if (existing.status !== "PENDING") {
      throw new ActionError(
        "ALREADY_DECIDED",
        "Esta oportunidade ja foi decidida.",
      );
    }

    await prisma.opportunity.update({
      where: { id: parsed.id },
      data: {
        status: parsed.decision,
        decidedByUserId: dbUser?.id ?? null,
        decidedAt: new Date(),
      },
    });
    await recordAuditEvent({
      actorUserId: dbUser?.id ?? null,
      entityType: "Opportunity",
      entityId: parsed.id,
      action: "OPPORTUNITY_DECIDED",
      before: { status: existing.status },
      after: { status: parsed.decision },
    });
    revalidatePath(CHECKPOINT_PATH);
    return { ok: true, data: { id: parsed.id, status: parsed.decision } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Decisão humana sobre um Case gerado pela IA: aceitar (ACCEPTED) ou descartar
 * (DISMISSED). RBAC: CASE.edit. Grava status + decidedByUserId + decidedAt e
 * audita. (A UI desta decisão vem na F5.)
 */
export async function decideCase(
  input: InsightDecisionInput,
): Promise<ActionResult<{ id: string; status: "ACCEPTED" | "DISMISSED" }>> {
  try {
    ensureDatabase();
    const user = await requirePermission("CASE", "edit");
    const parsed = parseInput(insightDecisionSchema, input);
    const dbUser = await resolveDbUser(user);

    const existing = await prisma.case.findUnique({
      where: { id: parsed.id },
      select: { id: true, status: true, sourceCheckpointId: true },
    });
    if (!existing) {
      throw new ActionError("NOT_FOUND", "Case nao encontrado.");
    }
    // Escopo de origem (espelha decideOpportunity): o viewer só decide um insight
    // cuja origem (checkpoint) ele poderia ver/gerenciar. Anti-enumeração: fora de
    // escopo colapsa no MESMO NOT_FOUND de inexistente.
    if (
      existing.sourceCheckpointId &&
      !(await canViewCheckpointInScope(user, existing.sourceCheckpointId))
    ) {
      throw new ActionError("NOT_FOUND", "Case nao encontrado.");
    }
    if (existing.status !== "PENDING") {
      throw new ActionError("ALREADY_DECIDED", "Este case ja foi decidido.");
    }

    await prisma.case.update({
      where: { id: parsed.id },
      data: {
        status: parsed.decision,
        decidedByUserId: dbUser?.id ?? null,
        decidedAt: new Date(),
      },
    });
    await recordAuditEvent({
      actorUserId: dbUser?.id ?? null,
      entityType: "Case",
      entityId: parsed.id,
      action: "CASE_DECIDED",
      before: { status: existing.status },
      after: { status: parsed.decision },
    });
    revalidatePath(CHECKPOINT_PATH);
    return { ok: true, data: { id: parsed.id, status: parsed.decision } };
  } catch (error) {
    return toFailure(error);
  }
}
