"use server";

import { revalidatePath } from "next/cache";
import { Prisma, prisma } from "@jumpflow/database";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import { getConsultantForUser } from "@/lib/db/timesheet";
import { resolveDbUser } from "@/lib/db/users";
import { buildAuditEventData } from "@/lib/db/audit";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import {
  generateSkillSuggestionsFromActivities,
  type SuggestedSkillLevel,
} from "@/lib/skills/suggestions";
import { addDays, parseIsoDateUtc, weekStartOf } from "@/lib/timesheet/week";
import {
  buildConsultantCurriculum,
  type ConsultantCurriculum,
} from "@/lib/consultants/curriculum";
import { curriculumBioSchema } from "@/lib/consultants/schemas";

const SKILLS_PATH = "/app/skills";

const skillLevelSchema = z.enum(["BASIC", "INTERMEDIATE", "ADVANCED", "SPECIALIST"]);
const idSchema = z.string().trim().min(1, "Identificador obrigatorio.");
const isoDateSchema = z
  .string()
  .refine((value) => parseIsoDateUtc(value) !== null, {
    message: "Data invalida.",
  });

const generateInputSchema = z.object({ weekStart: isoDateSchema });
const acceptInputSchema = z.object({
  suggestionId: idSchema,
  level: skillLevelSchema,
});
const dismissInputSchema = z.object({ suggestionId: idSchema });
const updateInputSchema = z.object({
  suggestionId: idSchema,
  suggestedName: z.string().trim().min(2).max(120),
  suggestedCategory: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((value) => (value ? value : null)),
  level: skillLevelSchema,
});
const deleteInputSchema = z.object({ suggestionId: idSchema });

// Escopo de dono: NAO aceitamos consultantId do cliente na bio propria; o
// consultor sempre vem resolvido do usuario logado. Reusamos a validacao de
// campos do EP-M06 (curriculumBioSchema) omitindo o id.
const myCurriculumBioSchema = curriculumBioSchema.pick({
  headline: true,
  summary: true,
});

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
    throw new ActionError("NO_DATABASE", "Banco de dados nao configurado.");
  }
}

function toFailure(error: unknown): ActionResult<never> {
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    ((error as { digest: string }).digest.startsWith("NEXT_") ||
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT"))
  ) {
    throw error;
  }
  if (error instanceof ActionError) {
    return { ok: false, error: error.code, message: error.message };
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: "Ja existe uma sugestao com esse nome nesta semana.",
    };
  }
  console.error("[skills] unexpected action error", error);
  return { ok: false, error: "UNEXPECTED", message: "Erro inesperado." };
}

async function requireConsultant() {
  const user = await requireUser();
  const consultant = await getConsultantForUser(user);
  if (!consultant) {
    throw new ActionError(
      "NO_CONSULTANT",
      "Seu usuario nao esta vinculado a um consultor.",
    );
  }
  return { user, consultant };
}

export async function generateWeeklySkillSuggestions(
  input: z.infer<typeof generateInputSchema>,
): Promise<ActionResult<{ generated: number }>> {
  try {
    ensureDatabase();
    const parsed = generateInputSchema.parse(input);
    const { user, consultant } = await requireConsultant();
    const dbUser = await resolveDbUser(user);
    const weekStart = weekStartOf(parseIsoDateUtc(parsed.weekStart)!);
    const weekEnd = addDays(weekStart, 6);

    const [entries, catalog] = await Promise.all([
      prisma.timeEntry.findMany({
        where: {
          consultantId: consultant.id,
          date: { gte: weekStart, lte: weekEnd },
          description: { not: null },
        },
        select: {
          id: true,
          description: true,
          activityType: true,
          date: true,
        },
      }),
      prisma.skill.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true, category: true },
      }),
    ]);

    const suggestions = generateSkillSuggestionsFromActivities(entries, catalog);
    for (const suggestion of suggestions) {
      await prisma.skillSuggestion.upsert({
        where: {
          consultantId_weekStart_suggestedName: {
            consultantId: consultant.id,
            weekStart,
            suggestedName: suggestion.suggestedName,
          },
        },
        update: {
          skillId: suggestion.skillId,
          suggestedCategory: suggestion.suggestedCategory,
          suggestedLevel: suggestion.suggestedLevel,
          evidenceSummary: suggestion.evidenceSummary,
          sourceEntryIds: suggestion.sourceEntryIds,
          status: "PENDING",
          decidedAt: null,
        },
        create: {
          consultantId: consultant.id,
          weekStart,
          weekEnd,
          skillId: suggestion.skillId,
          suggestedName: suggestion.suggestedName,
          suggestedCategory: suggestion.suggestedCategory,
          suggestedLevel: suggestion.suggestedLevel,
          evidenceSummary: suggestion.evidenceSummary,
          sourceEntryIds: suggestion.sourceEntryIds,
        },
      });
    }

    if (suggestions.length > 0) {
      await prisma.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "SkillSuggestion",
          entityId: consultant.id,
          action: "SKILL_SUGGESTIONS_GENERATED",
          after: {
            weekStart: parsed.weekStart,
            generated: suggestions.length,
            names: suggestions.map((suggestion) => suggestion.suggestedName),
          },
        }),
      });
    }

    revalidatePath(SKILLS_PATH);
    return { ok: true, data: { generated: suggestions.length } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function acceptSkillSuggestion(
  input: z.infer<typeof acceptInputSchema>,
): Promise<ActionResult<{ suggestionId: string }>> {
  try {
    ensureDatabase();
    const parsed = acceptInputSchema.parse(input);
    const { user, consultant } = await requireConsultant();
    const dbUser = await resolveDbUser(user);

    const suggestion = await prisma.skillSuggestion.findFirst({
      where: {
        id: parsed.suggestionId,
        consultantId: consultant.id,
        status: "PENDING",
      },
    });
    if (!suggestion) {
      throw new ActionError("NOT_FOUND", "Sugestao nao encontrada.");
    }
    if (!suggestion.skillId) {
      throw new ActionError(
        "INVALID_INPUT",
        "Sugestao fora do catalogo precisa de aprovacao de catalogo primeiro.",
      );
    }
    const existingSkill = await prisma.consultantSkill.findUnique({
      where: {
        consultantId_skillId: {
          consultantId: consultant.id,
          skillId: suggestion.skillId,
        },
      },
      select: { level: true, validationStatus: true },
    });
    const validationStatus =
      existingSkill && existingSkill.level === parsed.level
        ? existingSkill.validationStatus
        : "PENDING";

    await prisma.$transaction(async (tx) => {
      await tx.consultantSkill.upsert({
        where: {
          consultantId_skillId: {
            consultantId: consultant.id,
            skillId: suggestion.skillId!,
          },
        },
        update: {
          level: parsed.level as SuggestedSkillLevel,
          lastUsedAt: suggestion.weekEnd,
          validationStatus,
        },
        create: {
          consultantId: consultant.id,
          skillId: suggestion.skillId!,
          level: parsed.level as SuggestedSkillLevel,
          lastUsedAt: suggestion.weekEnd,
          validationStatus: "PENDING",
        },
      });
      await tx.skillSuggestion.update({
        where: { id: suggestion.id },
        data: { status: "ACCEPTED", suggestedLevel: parsed.level, decidedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "SkillSuggestion",
          entityId: suggestion.id,
          action: "SKILL_SUGGESTION_ACCEPTED",
          after: {
            skillId: suggestion.skillId,
            level: parsed.level,
            consultantId: consultant.id,
          },
        }),
      });
    });

    revalidatePath(SKILLS_PATH);
    return { ok: true, data: { suggestionId: suggestion.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function dismissSkillSuggestion(
  input: z.infer<typeof dismissInputSchema>,
): Promise<ActionResult<{ suggestionId: string }>> {
  try {
    ensureDatabase();
    const parsed = dismissInputSchema.parse(input);
    const { user, consultant } = await requireConsultant();
    const dbUser = await resolveDbUser(user);

    const suggestion = await prisma.skillSuggestion.findFirst({
      where: {
        id: parsed.suggestionId,
        consultantId: consultant.id,
        status: "PENDING",
      },
    });
    if (!suggestion) {
      throw new ActionError("NOT_FOUND", "Sugestao nao encontrada.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.skillSuggestion.update({
        where: { id: suggestion.id },
        data: { status: "DISMISSED", decidedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "SkillSuggestion",
          entityId: suggestion.id,
          action: "SKILL_SUGGESTION_DISMISSED",
          after: { consultantId: consultant.id },
        }),
      });
    });

    revalidatePath(SKILLS_PATH);
    return { ok: true, data: { suggestionId: suggestion.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateSkillSuggestion(
  input: z.infer<typeof updateInputSchema>,
): Promise<ActionResult<{ suggestionId: string }>> {
  try {
    ensureDatabase();
    const parsed = updateInputSchema.parse(input);
    const { user, consultant } = await requireConsultant();
    const dbUser = await resolveDbUser(user);

    const suggestion = await prisma.skillSuggestion.findFirst({
      where: {
        id: parsed.suggestionId,
        consultantId: consultant.id,
        status: "PENDING",
      },
    });
    if (!suggestion) {
      throw new ActionError("NOT_FOUND", "Sugestao nao encontrada.");
    }

    const catalog = await prisma.skill.findFirst({
      where: {
        status: "ACTIVE",
        name: { equals: parsed.suggestedName, mode: "insensitive" },
      },
      select: { id: true, category: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.skillSuggestion.update({
        where: { id: suggestion.id },
        data: {
          skillId: catalog?.id ?? null,
          suggestedName: parsed.suggestedName,
          suggestedCategory: parsed.suggestedCategory ?? catalog?.category ?? null,
          suggestedLevel: parsed.level,
          decidedAt: null,
        },
      });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "SkillSuggestion",
          entityId: suggestion.id,
          action: "SKILL_SUGGESTION_UPDATED",
          before: {
            suggestedName: suggestion.suggestedName,
            suggestedCategory: suggestion.suggestedCategory,
            suggestedLevel: suggestion.suggestedLevel,
            skillId: suggestion.skillId,
          },
          after: {
            suggestedName: parsed.suggestedName,
            suggestedCategory: parsed.suggestedCategory,
            suggestedLevel: parsed.level,
            skillId: catalog?.id ?? null,
          },
        }),
      });
    });

    revalidatePath(SKILLS_PATH);
    return { ok: true, data: { suggestionId: suggestion.id } };
  } catch (error) {
    return toFailure(error);
  }
}

// ---------------------------------------------------------------------------
// Meu Curriculo (EP-M06 / US-M06.03) — escopo de DONO
// ---------------------------------------------------------------------------
//
// Estas duas actions servem a aba "Meu Curriculo" em /app/skills. O consultor
// e SEMPRE resolvido a partir do usuario logado (Consultant.userId ==
// currentUser.id) via requireConsultant(); o cliente NUNCA informa o id. Assim
// e impossivel ler ou editar o curriculo de outra pessoa por esta via. A action
// de RH (saveCurriculumBio, gated People em /app/consultores) permanece intacta.
// Sem dados financeiros (o agregador ja garante). Sem snapshot (RH-only).

export interface MyCurriculumView {
  curriculum: ConsultantCurriculum;
}

/**
 * Carrega o curriculo derivado do PROPRIO consultor logado (read-only, sempre
 * atualizado). Retorna NO_CONSULTANT quando o usuario nao tem um Consultant
 * vinculado (ex.: ADMIN sem cadastro) — nunca vaza curriculo de terceiro.
 */
export async function loadMyCurriculum(): Promise<ActionResult<MyCurriculumView>> {
  try {
    ensureDatabase();
    const { consultant } = await requireConsultant();
    const curriculum = await buildConsultantCurriculum(consultant.id);
    if (!curriculum) {
      throw new ActionError("NOT_FOUND", "Curriculo nao encontrado.");
    }
    return { ok: true, data: { curriculum } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Salva a bio curada (headline/summary) do PROPRIO consultor (US-M06.03). O
 * consultantId nunca vem do cliente: usamos sempre o consultor resolvido do
 * usuario logado, de modo que ninguem edita a bio de outra pessoa. Auditado
 * (CONSULTANT_CURRICULUM_BIO_SELF_SAVED). Sem dados financeiros.
 */
export async function saveMyCurriculumBio(
  input: z.infer<typeof myCurriculumBioSchema>,
): Promise<ActionResult<{ consultantId: string }>> {
  try {
    ensureDatabase();
    const result = myCurriculumBioSchema.safeParse(input);
    if (!result.success) {
      throw new ActionError("INVALID_INPUT", "Revise os campos informados.");
    }
    const parsed = result.data;
    const { user, consultant } = await requireConsultant();
    const dbUser = await resolveDbUser(user);

    const previous = {
      curriculumHeadline: consultant.curriculumHeadline,
      curriculumSummary: consultant.curriculumSummary,
    };
    const data = {
      curriculumHeadline: parsed.headline ?? null,
      curriculumSummary: parsed.summary ?? null,
    };
    await prisma.$transaction(async (tx) => {
      await tx.consultant.update({ where: { id: consultant.id }, data });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "Consultant",
          entityId: consultant.id,
          action: "CONSULTANT_CURRICULUM_BIO_SELF_SAVED",
          before: previous,
          after: data,
        }),
      });
    });

    revalidatePath(SKILLS_PATH);
    return { ok: true, data: { consultantId: consultant.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function deleteSkillSuggestion(
  input: z.infer<typeof deleteInputSchema>,
): Promise<ActionResult<{ suggestionId: string }>> {
  try {
    ensureDatabase();
    const parsed = deleteInputSchema.parse(input);
    const { user, consultant } = await requireConsultant();
    const dbUser = await resolveDbUser(user);

    const suggestion = await prisma.skillSuggestion.findFirst({
      where: {
        id: parsed.suggestionId,
        consultantId: consultant.id,
        status: "PENDING",
      },
    });
    if (!suggestion) {
      throw new ActionError("NOT_FOUND", "Sugestao nao encontrada.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.skillSuggestion.delete({ where: { id: suggestion.id } });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "SkillSuggestion",
          entityId: suggestion.id,
          action: "SKILL_SUGGESTION_DELETED",
          before: {
            suggestedName: suggestion.suggestedName,
            suggestedCategory: suggestion.suggestedCategory,
            suggestedLevel: suggestion.suggestedLevel,
            skillId: suggestion.skillId,
          },
          after: { consultantId: consultant.id },
        }),
      });
    });

    revalidatePath(SKILLS_PATH);
    return { ok: true, data: { suggestionId: suggestion.id } };
  } catch (error) {
    return toFailure(error);
  }
}
