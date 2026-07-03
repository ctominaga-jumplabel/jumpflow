"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@jumpflow/database";
import type { ZodType } from "zod";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { recordAuditEvent } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { getConsultantForUser } from "@/lib/db/timesheet";
import { resolveDbUser } from "@/lib/db/users";
import { UNIVERSITY_CURATE_ROLES } from "@/lib/university/visibility";
import {
  decideCourseEvidence,
  deriveProgressUpdate,
} from "@/lib/university/enrollment";
import {
  cancelEnrollmentSchema,
  courseCreateSchema,
  courseSetStatusSchema,
  courseUpdateSchema,
  enrollSchema,
  enrollmentProgressSchema,
  trackCreateSchema,
  trackSetStatusSchema,
  trackUpdateSchema,
  type CancelEnrollmentInput,
  type CourseCreateInput,
  type CourseSetStatusInput,
  type CourseUpdateInput,
  type EnrollInput,
  type EnrollmentProgressInput,
  type TrackCreateInput,
  type TrackSetStatusInput,
  type TrackUpdateInput,
} from "@/lib/university/schemas";

const UNIVERSITY_PATH = "/app/universidade";

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
      "Banco de dados nao configurado para a JumpAcademy.",
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
  console.error("[universidade action] unexpected error", error);
  return {
    ok: false,
    error: "UNEXPECTED",
    message: "Nao foi possivel concluir a acao.",
  };
}

async function audit(
  entityType: string,
  entityId: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  const user = await requireUser();
  const dbUser = await resolveDbUser(user);
  await recordAuditEvent({
    actorUserId: dbUser?.id ?? null,
    entityType,
    entityId,
    action,
    before,
    after,
  });
}

/** Valida que uma trilha referenciada existe e está ATIVA. */
async function ensureActiveTrack(trackId: string): Promise<void> {
  const track = await prisma.learningTrack.findUnique({
    where: { id: trackId },
    select: { status: true },
  });
  if (!track) throw new ActionError("NOT_FOUND", "Trilha nao encontrada.");
  if (track.status !== "ACTIVE") {
    throw new ActionError("INVALID_INPUT", "A trilha selecionada esta inativa.");
  }
}

/** Valida que uma skill referenciada existe e está ATIVA. */
async function ensureActiveSkill(skillId: string): Promise<void> {
  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
    select: { status: true },
  });
  if (!skill) throw new ActionError("NOT_FOUND", "Skill nao encontrada.");
  if (skill.status !== "ACTIVE") {
    throw new ActionError("INVALID_INPUT", "A skill selecionada esta inativa.");
  }
}

// ── Curadoria: Trilha (PEOPLE/ADMIN) ────────────────────────────────────────

export async function createTrack(
  input: TrackCreateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(UNIVERSITY_CURATE_ROLES);
    const parsed = parseInput(trackCreateSchema, input);
    const track = await prisma.learningTrack.create({
      data: {
        title: parsed.title,
        description: parsed.description,
        category: parsed.category,
      },
      select: { id: true },
    });
    await audit("LearningTrack", track.id, "TRACK_CREATED", null, parsed);
    revalidatePath(UNIVERSITY_PATH);
    return { ok: true, data: { id: track.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateTrack(
  input: TrackUpdateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(UNIVERSITY_CURATE_ROLES);
    const parsed = parseInput(trackUpdateSchema, input);
    const previous = await prisma.learningTrack.findUnique({
      where: { id: parsed.id },
      select: { title: true, description: true, category: true },
    });
    if (!previous) throw new ActionError("NOT_FOUND", "Trilha nao encontrada.");
    await prisma.learningTrack.update({
      where: { id: parsed.id },
      data: {
        title: parsed.title,
        description: parsed.description,
        category: parsed.category,
      },
    });
    await audit("LearningTrack", parsed.id, "TRACK_UPDATED", previous, {
      title: parsed.title,
      description: parsed.description,
      category: parsed.category,
    });
    revalidatePath(UNIVERSITY_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function setTrackStatus(
  input: TrackSetStatusInput,
): Promise<ActionResult<{ status: "ACTIVE" | "INACTIVE" }>> {
  try {
    ensureDatabase();
    await requireRole(UNIVERSITY_CURATE_ROLES);
    const parsed = parseInput(trackSetStatusSchema, input);
    const previous = await prisma.learningTrack.findUnique({
      where: { id: parsed.id },
      select: { status: true },
    });
    if (!previous) throw new ActionError("NOT_FOUND", "Trilha nao encontrada.");
    await prisma.learningTrack.update({
      where: { id: parsed.id },
      data: { status: parsed.status },
    });
    await audit(
      "LearningTrack",
      parsed.id,
      `TRACK_${parsed.status}`,
      { status: previous.status },
      { status: parsed.status },
    );
    revalidatePath(UNIVERSITY_PATH);
    return { ok: true, data: { status: parsed.status } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Curadoria: Curso (PEOPLE/ADMIN) ─────────────────────────────────────────

export async function createCourse(
  input: CourseCreateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(UNIVERSITY_CURATE_ROLES);
    const parsed = parseInput(courseCreateSchema, input);
    if (parsed.trackId) await ensureActiveTrack(parsed.trackId);
    if (parsed.skillId) await ensureActiveSkill(parsed.skillId);
    const course = await prisma.course.create({
      data: {
        title: parsed.title,
        trackId: parsed.trackId ?? null,
        provider: parsed.provider,
        hours: parsed.hours ?? null,
        externalUrl: parsed.externalUrl,
        skillId: parsed.skillId ?? null,
      },
      select: { id: true },
    });
    await audit("Course", course.id, "COURSE_CREATED", null, parsed);
    revalidatePath(UNIVERSITY_PATH);
    return { ok: true, data: { id: course.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateCourse(
  input: CourseUpdateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(UNIVERSITY_CURATE_ROLES);
    const parsed = parseInput(courseUpdateSchema, input);
    if (parsed.trackId) await ensureActiveTrack(parsed.trackId);
    if (parsed.skillId) await ensureActiveSkill(parsed.skillId);
    const previous = await prisma.course.findUnique({
      where: { id: parsed.id },
      select: {
        title: true,
        trackId: true,
        provider: true,
        hours: true,
        externalUrl: true,
        skillId: true,
      },
    });
    if (!previous) throw new ActionError("NOT_FOUND", "Curso nao encontrado.");
    await prisma.course.update({
      where: { id: parsed.id },
      data: {
        title: parsed.title,
        trackId: parsed.trackId ?? null,
        provider: parsed.provider,
        hours: parsed.hours ?? null,
        externalUrl: parsed.externalUrl,
        skillId: parsed.skillId ?? null,
      },
    });
    await audit(
      "Course",
      parsed.id,
      "COURSE_UPDATED",
      {
        title: previous.title,
        trackId: previous.trackId,
        provider: previous.provider,
        hours: previous.hours ? Number(previous.hours.toString()) : null,
        externalUrl: previous.externalUrl,
        skillId: previous.skillId,
      },
      parsed,
    );
    revalidatePath(UNIVERSITY_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function setCourseStatus(
  input: CourseSetStatusInput,
): Promise<ActionResult<{ status: "ACTIVE" | "INACTIVE" }>> {
  try {
    ensureDatabase();
    await requireRole(UNIVERSITY_CURATE_ROLES);
    const parsed = parseInput(courseSetStatusSchema, input);
    const previous = await prisma.course.findUnique({
      where: { id: parsed.id },
      select: { status: true },
    });
    if (!previous) throw new ActionError("NOT_FOUND", "Curso nao encontrado.");
    await prisma.course.update({
      where: { id: parsed.id },
      data: { status: parsed.status },
    });
    await audit(
      "Course",
      parsed.id,
      `COURSE_${parsed.status}`,
      { status: previous.status },
      { status: parsed.status },
    );
    revalidatePath(UNIVERSITY_PATH);
    return { ok: true, data: { status: parsed.status } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Consultor: matrícula e progresso (escopo por linha no servidor) ─────────

/**
 * Resolve o consultor do usuário OU lança. Toda mutação de matrícula é do PRÓPRIO
 * consultor; ninguém altera matrícula de terceiros (gate por consultantId aqui).
 */
async function requireConsultant(): Promise<{ id: string }> {
  const user = await requireUser();
  const consultant = await getConsultantForUser(user);
  if (!consultant) {
    throw new ActionError(
      "NO_CONSULTANT",
      "Seu usuario nao esta vinculado a um consultor.",
    );
  }
  return { id: consultant.id };
}

export async function enrollInCourse(
  input: EnrollInput,
): Promise<ActionResult<{ enrollmentId: string }>> {
  try {
    ensureDatabase();
    const consultant = await requireConsultant();
    const parsed = parseInput(enrollSchema, input);

    const course = await prisma.course.findUnique({
      where: { id: parsed.courseId },
      select: { id: true, status: true },
    });
    if (!course) throw new ActionError("NOT_FOUND", "Curso nao encontrado.");
    if (course.status !== "ACTIVE") {
      throw new ActionError("INVALID_INPUT", "Este curso esta inativo.");
    }

    const existing = await prisma.enrollment.findUnique({
      where: {
        consultantId_courseId: {
          consultantId: consultant.id,
          courseId: parsed.courseId,
        },
      },
      select: { id: true, status: true },
    });
    if (existing) {
      if (existing.status === "CANCELLED") {
        // Reabre a matrícula cancelada (sem duplicar a linha única).
        await prisma.enrollment.update({
          where: { id: existing.id },
          data: { status: "ENROLLED", progressPct: 0, hoursCompleted: 0 },
        });
        await audit(
          "Enrollment",
          existing.id,
          "ENROLLMENT_REOPENED",
          { status: "CANCELLED" },
          { status: "ENROLLED" },
        );
        revalidatePath(UNIVERSITY_PATH);
        return { ok: true, data: { enrollmentId: existing.id } };
      }
      throw new ActionError(
        "DUPLICATE_ENTRY",
        "Voce ja esta matriculado neste curso.",
      );
    }

    const enrollment = await prisma.enrollment.create({
      data: {
        consultantId: consultant.id,
        courseId: parsed.courseId,
        status: "ENROLLED",
      },
      select: { id: true },
    });
    await audit("Enrollment", enrollment.id, "ENROLLMENT_CREATED", null, {
      consultantId: consultant.id,
      courseId: parsed.courseId,
    });
    revalidatePath(UNIVERSITY_PATH);
    return { ok: true, data: { enrollmentId: enrollment.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Atualiza progresso/horas da PRÓPRIA matrícula. Deriva o status (deriveProgressUpdate);
 * ao TRANSITAR para COMPLETED, registra SkillEvidence (idempotente por enrollment)
 * se o curso tem skill e o consultor tem ConsultantSkill dela. Audita a conclusão.
 */
export async function updateEnrollmentProgress(
  input: EnrollmentProgressInput,
): Promise<ActionResult<{ status: string; progressPct: number }>> {
  try {
    ensureDatabase();
    const consultant = await requireConsultant();
    const parsed = parseInput(enrollmentProgressSchema, input);

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: parsed.enrollmentId },
      select: {
        id: true,
        consultantId: true,
        status: true,
        course: { select: { id: true, title: true, skillId: true } },
      },
    });
    if (!enrollment) {
      throw new ActionError("NOT_FOUND", "Matricula nao encontrada.");
    }
    // Gate por linha: ninguém altera matrícula de terceiros.
    if (enrollment.consultantId !== consultant.id) {
      throw new ActionError(
        "FORBIDDEN",
        "Voce so pode atualizar as suas proprias matriculas.",
      );
    }

    const update = deriveProgressUpdate(
      enrollment.status as EnrollmentStatusLiteral,
      parsed.progressPct,
      parsed.hoursCompleted,
    );
    if (!update) {
      throw new ActionError(
        "NOT_EDITABLE",
        "Esta matricula esta concluida ou cancelada e nao pode ser alterada.",
      );
    }

    if (update.becameCompleted) {
      // Transicao para COMPLETED guardada e atomica: so efetiva quem encontra a
      // matricula ainda em ENROLLED/IN_PROGRESS. Sob corrida, apenas UMA
      // requisicao retorna count === 1; as demais (status ja COMPLETED) retornam
      // 0 e NAO registram evidencia/auditoria de novo (idempotencia da conclusao).
      const completed = await prisma.enrollment.updateMany({
        where: {
          id: enrollment.id,
          consultantId: consultant.id,
          status: { in: ["ENROLLED", "IN_PROGRESS"] },
        },
        data: {
          status: "COMPLETED",
          progressPct: update.progressPct,
          hoursCompleted: update.hoursCompleted,
          completedAt: new Date(),
        },
      });

      if (completed.count === 1) {
        await audit(
          "Enrollment",
          enrollment.id,
          "ENROLLMENT_COMPLETED",
          { status: enrollment.status },
          { status: "COMPLETED", progressPct: update.progressPct },
        );
        await maybeRecordCourseEvidence({
          enrollmentId: enrollment.id,
          consultantId: consultant.id,
          courseTitle: enrollment.course.title,
          courseSkillId: enrollment.course.skillId,
        });
      }
    } else {
      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: {
          status: update.status,
          progressPct: update.progressPct,
          hoursCompleted: update.hoursCompleted,
        },
      });
    }

    revalidatePath(UNIVERSITY_PATH);
    return {
      ok: true,
      data: { status: update.status, progressPct: update.progressPct },
    };
  } catch (error) {
    return toFailure(error);
  }
}

export async function cancelEnrollment(
  input: CancelEnrollmentInput,
): Promise<ActionResult<{ enrollmentId: string }>> {
  try {
    ensureDatabase();
    const consultant = await requireConsultant();
    const parsed = parseInput(cancelEnrollmentSchema, input);

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: parsed.enrollmentId },
      select: { id: true, consultantId: true, status: true },
    });
    if (!enrollment) {
      throw new ActionError("NOT_FOUND", "Matricula nao encontrada.");
    }
    if (enrollment.consultantId !== consultant.id) {
      throw new ActionError(
        "FORBIDDEN",
        "Voce so pode cancelar as suas proprias matriculas.",
      );
    }
    if (enrollment.status === "COMPLETED") {
      throw new ActionError(
        "NOT_EDITABLE",
        "Uma matricula concluida nao pode ser cancelada.",
      );
    }
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { status: "CANCELLED" },
    });
    await audit(
      "Enrollment",
      enrollment.id,
      "ENROLLMENT_CANCELLED",
      { status: enrollment.status },
      { status: "CANCELLED" },
    );
    revalidatePath(UNIVERSITY_PATH);
    return { ok: true, data: { enrollmentId: enrollment.id } };
  } catch (error) {
    return toFailure(error);
  }
}

type EnrollmentStatusLiteral =
  | "ENROLLED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

/**
 * Registra SkillEvidence ao concluir um curso, de forma IDEMPOTENTE por
 * matrícula. Só registra quando o curso tem skill e existe ConsultantSkill do
 * consultor para essa skill. sourceType = MANUAL (o enum SkillEvidenceSource não
 * tem COURSE/TRAINING; MANUAL é o valor mais próximo — ver lib/university/enrollment.ts).
 * sourceId = enrollmentId é a chave de idempotência (1 evidência por matrícula).
 * Falha silenciosa-logada: a evidência é um efeito secundário; nunca derruba a
 * conclusão do curso.
 */
async function maybeRecordCourseEvidence(args: {
  enrollmentId: string;
  consultantId: string;
  courseTitle: string;
  courseSkillId: string | null;
}): Promise<void> {
  try {
    if (!args.courseSkillId) return;
    const consultantSkill = await prisma.consultantSkill.findUnique({
      where: {
        consultantId_skillId: {
          consultantId: args.consultantId,
          skillId: args.courseSkillId,
        },
      },
      select: { id: true },
    });
    const consultantSkillId = consultantSkill?.id ?? null;
    if (!consultantSkillId) return;

    const already = await prisma.skillEvidence.findFirst({
      where: { consultantSkillId, sourceId: args.enrollmentId },
      select: { id: true },
    });

    const decision = decideCourseEvidence({
      enrollmentId: args.enrollmentId,
      courseTitle: args.courseTitle,
      consultantSkillId,
      alreadyRecorded: already !== null,
    });
    if (!decision.shouldRecord) return;

    try {
      await prisma.skillEvidence.create({
        data: {
          consultantSkillId,
          sourceType: decision.sourceType,
          sourceId: decision.sourceId,
          note: decision.note,
        },
      });
    } catch (createError) {
      // Corrida residual: outra requisicao gravou a evidencia entre o findFirst e
      // o create. A @@unique([consultantSkillId, sourceId]) protege e levanta
      // P2002 — tratamos como ja registrado (idempotente) e nao auditamos de novo.
      if (isUniqueConstraintViolation(createError)) return;
      throw createError;
    }
    await audit(
      "SkillEvidence",
      args.enrollmentId,
      "COURSE_EVIDENCE_RECORDED",
      null,
      { consultantSkillId, sourceType: decision.sourceType },
    );
  } catch (error) {
    console.error("[universidade] failed to record course evidence", error);
  }
}

/** Detecta a violacao de unicidade do Prisma (P2002) sem acoplar ao tipo do client. */
function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
