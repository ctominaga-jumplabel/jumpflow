"use server";

import { revalidatePath } from "next/cache";
import { Prisma, prisma } from "@jumpflow/database";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { SUBSCREEN_CODES } from "@/lib/auth/permission-codes";
import { can } from "@/lib/auth/permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { getConsultantForUser } from "@/lib/db/timesheet";
import { resolveDbUser } from "@/lib/db/users";
import { buildAuditEventData } from "@/lib/db/audit";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import {
  generateSkillSuggestionsFromActivities,
  type SuggestedSkillLevel,
} from "@/lib/skills/suggestions";
import { getConfiguredAiModel } from "@/lib/ai/provider";
import { recordAiUsage } from "@/lib/ai/log";
import { isCurriculumAiImportEnabled } from "@/lib/skills/flags";
import { extractCurriculumProposal } from "@/lib/skills/curriculum-import";
import {
  addDays,
  parseIsoDateUtc,
  startOfUtcDay,
  weekStartOf,
} from "@/lib/timesheet/week";
import {
  buildConsultantCurriculum,
  type ConsultantCurriculum,
} from "@/lib/consultants/curriculum";
import {
  listConsultantExperiences,
  type ConsultantExperienceView,
} from "@/lib/consultants/experiences";
import {
  curriculumBioSchema,
  deleteExperienceSchema,
  myExperienceSchema,
  type MyExperienceInput,
} from "@/lib/consultants/schemas";

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

// Autosserviço de skills do consultor (escopo de dono). O consultor declara as
// PRÓPRIAS skills; entram sempre como validationStatus = PENDING (política).
const yearsSchema = z.preprocess(
  (value) =>
    value === "" || value === null || value === undefined ? undefined : value,
  z.coerce.number().min(0).max(80).optional(),
);
const mySkillSchema = z.object({
  skillId: idSchema,
  level: skillLevelSchema,
  yearsExperience: yearsSchema,
});
const deleteMySkillSchema = z.object({ skillId: idSchema });

// Leitura de currículo por IA (atrás de flag). O upload chega como base64; o
// servidor valida tipo/tamanho ANTES de qualquer chamada de IA.
const CV_PDF_MAX_BYTES = 6 * 1024 * 1024; // 6 MB (base64 ~8 MB < bodySizeLimit 15mb)
const importFileSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentBase64: z.string().min(1),
});

const optionalNullText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

const isoDateStrict = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data invalida.");

// URL de credencial: so http(s). Vazio/invalido/esquema perigoso vira null, para
// nunca gravarmos um `javascript:`/`data:` que a tela renderiza como link.
const httpUrlOrNull = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((value) => {
    if (!value) return null;
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:"
        ? value
        : null;
    } catch {
      return null;
    }
  });

// Proposta editada que o consultor CONFIRMA. Nada aqui é gerado pela IA: são os
// campos já revisados por um humano. Skills de catálogo viram ConsultantSkill
// PENDING; skills fora do catálogo viram SkillSuggestion pendente de curadoria.
const applyImportSchema = z.object({
  headline: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((value) => (value ? value : undefined)),
  summary: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => (value ? value : undefined)),
  skills: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        category: optionalNullText(80),
        level: skillLevelSchema,
        evidence: optionalNullText(400),
        catalogSkillId: z
          .string()
          .trim()
          .max(64)
          .optional()
          .transform((value) => (value ? value : null)),
      }),
    )
    .max(40)
    .default([]),
  experiences: z
    .array(
      z.object({
        company: z.string().trim().min(1).max(160),
        role: z.string().trim().min(1).max(160),
        startDate: isoDateStrict,
        endDate: isoDateStrict.optional().nullable(),
        description: optionalNullText(1000),
        location: optionalNullText(160),
      }),
    )
    .max(25)
    .default([]),
  // Certificados confirmados. `issuedAt` e OBRIGATORIO aqui (Certificate.issuedAt
  // nao aceita null no schema): itens sem data ficam de fora na UI ate o
  // consultor informar. Entram sempre como PENDING — a validacao e humana.
  certificates: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        issuer: z.string().trim().min(1).max(160),
        issuedAt: isoDateStrict,
        expiresAt: isoDateStrict.optional().nullable(),
        credentialId: optionalNullText(120),
        credentialUrl: httpUrlOrNull,
      }),
    )
    .max(30)
    .default([]),
  // Cases confirmados. Nascem como candidatos (DRAFT_INSIGHT/PENDING) para a
  // curadoria — um curriculo NUNCA estabelece consentimento do cliente.
  cases: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        summary: optionalNullText(1000),
        outcome: optionalNullText(600),
        evidence: optionalNullText(400),
      }),
    )
    .max(20)
    .default([]),
});

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
  // Payload fora do schema e erro do CHAMADOR, nao falha do servidor: sem este
  // ramo, um campo invalido (ex.: data de emissao incompleta num certificado)
  // virava "Erro inesperado" e ainda poluia o log de erro.
  if (error instanceof z.ZodError) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: error.issues[0]?.message ?? "Dados invalidos.",
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

/**
 * Escopo de dono + subtela "Meu Currículo" da matriz (SKILLS_CURRICULO). Todas
 * as actions do currículo servem SÓ essa aba: se a matriz nega a aba, elas
 * recusam com FORBIDDEN (a aba some da tela, mas a action continua chamável).
 * As actions de sugestão semanal servem a aba "Skills" e seguem em
 * requireConsultant().
 */
async function requireCurriculumConsultant() {
  const context = await requireConsultant();
  if (!(await can(SUBSCREEN_CODES.skills.curriculum, "view"))) {
    throw new ActionError(
      "FORBIDDEN",
      "Seu perfil nao tem acesso ao Meu Curriculo.",
    );
  }
  return context;
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
    const { consultant } = await requireCurriculumConsultant();
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
    const { user, consultant } = await requireCurriculumConsultant();
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

// ---------------------------------------------------------------------------
// Experiencia profissional — autosservico do consultor (P27, escopo de DONO)
// ---------------------------------------------------------------------------
//
// O consultor cadastra/edita as PROPRIAS experiencias. O consultor e SEMPRE
// resolvido do usuario logado (requireConsultant); o cliente NUNCA informa o
// consultantId. Auditado. Sem dados financeiros.

/** Le as experiencias declaradas do PROPRIO consultor logado. */
export async function loadMyExperiences(): Promise<
  ActionResult<ConsultantExperienceView[]>
> {
  try {
    ensureDatabase();
    const { consultant } = await requireCurriculumConsultant();
    const rows = await listConsultantExperiences(consultant.id);
    return { ok: true, data: rows };
  } catch (error) {
    return toFailure(error);
  }
}

/** Cria ou atualiza uma experiencia do PROPRIO consultor logado. */
export async function saveMyExperience(
  input: MyExperienceInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const result = myExperienceSchema.safeParse(input);
    if (!result.success) {
      throw new ActionError("INVALID_INPUT", "Revise os campos informados.");
    }
    const parsed = result.data;
    const { user, consultant } = await requireCurriculumConsultant();
    const dbUser = await resolveDbUser(user);

    const data = {
      consultantId: consultant.id,
      company: parsed.company,
      role: parsed.role,
      startDate: new Date(`${parsed.startDate}T00:00:00.000Z`),
      endDate: parsed.endDate
        ? new Date(`${parsed.endDate}T00:00:00.000Z`)
        : null,
      description: parsed.description ?? null,
      location: parsed.location ?? null,
    };

    // Escopo de dono: ao editar, a linha precisa pertencer ao consultor logado.
    let previous: unknown = null;
    if (parsed.id) {
      const existing = await prisma.consultantExperience.findFirst({
        where: { id: parsed.id, consultantId: consultant.id },
      });
      if (!existing) {
        throw new ActionError("NOT_FOUND", "Experiencia nao encontrada.");
      }
      previous = existing;
    }

    const row = await prisma.$transaction(async (tx) => {
      const saved = parsed.id
        ? await tx.consultantExperience.update({
            where: { id: parsed.id },
            data,
          })
        : await tx.consultantExperience.create({ data });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "ConsultantExperience",
          entityId: saved.id,
          action: parsed.id
            ? "CONSULTANT_EXPERIENCE_SELF_UPDATED"
            : "CONSULTANT_EXPERIENCE_SELF_CREATED",
          before: previous,
          after: data,
        }),
      });
      return saved;
    });

    revalidatePath(SKILLS_PATH);
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/** Remove uma experiencia do PROPRIO consultor logado. */
export async function deleteMyExperience(
  input: z.infer<typeof deleteExperienceSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const result = deleteExperienceSchema.safeParse(input);
    if (!result.success) {
      throw new ActionError("INVALID_INPUT", "Identificador invalido.");
    }
    const parsed = result.data;
    const { user, consultant } = await requireCurriculumConsultant();
    const dbUser = await resolveDbUser(user);

    const previous = await prisma.consultantExperience.findFirst({
      where: { id: parsed.id, consultantId: consultant.id },
    });
    if (!previous) {
      throw new ActionError("NOT_FOUND", "Experiencia nao encontrada.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.consultantExperience.delete({ where: { id: parsed.id } });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "ConsultantExperience",
          entityId: parsed.id,
          action: "CONSULTANT_EXPERIENCE_SELF_DELETED",
          before: previous,
          after: { consultantId: consultant.id },
        }),
      });
    });

    revalidatePath(SKILLS_PATH);
    return { ok: true, data: { id: parsed.id } };
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

// ---------------------------------------------------------------------------
// Minhas skills — autosserviço do consultor (escopo de DONO)
// ---------------------------------------------------------------------------
//
// O consultor declara/edita as PRÓPRIAS skills. O consultor é SEMPRE resolvido
// do usuário logado (requireConsultant); o cliente NUNCA informa o consultantId.
// Governança: skill auto-declarada entra como validationStatus = PENDING — nunca
// vira VALIDATED sozinha (validação é decisão de gestor/People). Auditado.

export type MySkillLevel = z.infer<typeof skillLevelSchema>;

export interface MySkillRow {
  skillId: string;
  name: string;
  category: string | null;
  level: MySkillLevel;
  yearsExperience: number | null;
  validationStatus: "PENDING" | "VALIDATED" | "REJECTED";
}

export interface CatalogSkillOption {
  id: string;
  name: string;
  category: string | null;
}

export interface MySkillsView {
  skills: MySkillRow[];
  catalog: CatalogSkillOption[];
}

/** Lê as skills declaradas do PRÓPRIO consultor + o catálogo ativo para seleção. */
export async function loadMySkills(): Promise<ActionResult<MySkillsView>> {
  try {
    ensureDatabase();
    const { consultant } = await requireCurriculumConsultant();
    const [rows, catalog] = await Promise.all([
      prisma.consultantSkill.findMany({
        where: { consultantId: consultant.id },
        select: {
          skillId: true,
          level: true,
          yearsExperience: true,
          validationStatus: true,
          skill: { select: { name: true, category: true } },
        },
        orderBy: { skill: { name: "asc" } },
      }),
      prisma.skill.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true, category: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      ok: true,
      data: {
        skills: rows.map((row) => ({
          skillId: row.skillId,
          name: row.skill.name,
          category: row.skill.category,
          level: row.level as MySkillLevel,
          yearsExperience:
            row.yearsExperience === null ? null : Number(row.yearsExperience),
          validationStatus: row.validationStatus,
        })),
        catalog: catalog.map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category,
        })),
      },
    };
  } catch (error) {
    return toFailure(error);
  }
}

/** Cria/atualiza uma skill do PRÓPRIO consultor. Entra como PENDING (política). */
export async function saveMySkill(
  input: z.input<typeof mySkillSchema>,
): Promise<ActionResult<{ skillId: string }>> {
  try {
    ensureDatabase();
    const parsed = mySkillSchema.parse(input);
    const { user, consultant } = await requireCurriculumConsultant();
    const dbUser = await resolveDbUser(user);

    const skill = await prisma.skill.findUnique({
      where: { id: parsed.skillId },
      select: { id: true, status: true },
    });
    if (!skill) {
      throw new ActionError("NOT_FOUND", "Skill nao encontrada no catalogo.");
    }
    if (skill.status !== "ACTIVE") {
      throw new ActionError(
        "INVALID_INPUT",
        "Selecione uma skill ativa do catalogo.",
      );
    }

    const existing = await prisma.consultantSkill.findUnique({
      where: {
        consultantId_skillId: {
          consultantId: consultant.id,
          skillId: parsed.skillId,
        },
      },
      select: { level: true, validationStatus: true },
    });
    // Editar apenas os anos de experiência não deve derrubar uma skill já
    // validada; mudar o NÍVEL declarado volta a PENDING (nova revisão humana).
    const validationStatus =
      existing && existing.level === parsed.level
        ? existing.validationStatus
        : "PENDING";
    const years = parsed.yearsExperience ?? null;

    await prisma.$transaction(async (tx) => {
      await tx.consultantSkill.upsert({
        where: {
          consultantId_skillId: {
            consultantId: consultant.id,
            skillId: parsed.skillId,
          },
        },
        update: {
          level: parsed.level as SuggestedSkillLevel,
          yearsExperience: years,
          validationStatus,
        },
        create: {
          consultantId: consultant.id,
          skillId: parsed.skillId,
          level: parsed.level as SuggestedSkillLevel,
          yearsExperience: years,
          validationStatus: "PENDING",
        },
      });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "ConsultantSkill",
          entityId: `${consultant.id}:${parsed.skillId}`,
          action: existing
            ? "CONSULTANT_SKILL_SELF_UPDATED"
            : "CONSULTANT_SKILL_SELF_CREATED",
          before: existing ?? null,
          after: {
            skillId: parsed.skillId,
            level: parsed.level,
            yearsExperience: years,
            validationStatus,
          },
        }),
      });
    });

    revalidatePath(SKILLS_PATH);
    return { ok: true, data: { skillId: parsed.skillId } };
  } catch (error) {
    return toFailure(error);
  }
}

/** Remove uma skill do PRÓPRIO consultor. */
export async function deleteMySkill(
  input: z.infer<typeof deleteMySkillSchema>,
): Promise<ActionResult<{ skillId: string }>> {
  try {
    ensureDatabase();
    const parsed = deleteMySkillSchema.parse(input);
    const { user, consultant } = await requireCurriculumConsultant();
    const dbUser = await resolveDbUser(user);

    const existing = await prisma.consultantSkill.findUnique({
      where: {
        consultantId_skillId: {
          consultantId: consultant.id,
          skillId: parsed.skillId,
        },
      },
      select: { id: true, level: true, validationStatus: true },
    });
    if (!existing) {
      throw new ActionError("NOT_FOUND", "Skill nao encontrada no seu perfil.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.consultantSkill.delete({ where: { id: existing.id } });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "ConsultantSkill",
          entityId: `${consultant.id}:${parsed.skillId}`,
          action: "CONSULTANT_SKILL_SELF_DELETED",
          before: existing,
          after: { consultantId: consultant.id, skillId: parsed.skillId },
        }),
      });
    });

    revalidatePath(SKILLS_PATH);
    return { ok: true, data: { skillId: parsed.skillId } };
  } catch (error) {
    return toFailure(error);
  }
}

// ---------------------------------------------------------------------------
// Leitura de currículo em PDF por IA (atrás de flag) — SEMPRE proposta
// ---------------------------------------------------------------------------
//
// Fluxo: upload .pdf → extractCurriculumFromPdf devolve uma PROPOSTA (nada é
// persistido) → o consultor revisa/edita → applyCurriculumImport grava os dados
// já confirmados. A IA nunca cria skill final/validada: skills de catálogo viram
// ConsultantSkill PENDING; skills fora do catálogo viram SkillSuggestion pendente
// de curadoria. Escopo de dono em todas as etapas.

export interface ProposedSkillView {
  name: string;
  category: string | null;
  level: MySkillLevel;
  evidence: string | null;
  /** Preenchido quando a skill casa com o catálogo ativo (por nome). */
  catalogSkillId: string | null;
}

export interface ProposedExperienceView {
  company: string;
  role: string;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
  location: string | null;
}

export interface ProposedCertificateView {
  name: string;
  issuer: string;
  issuedAt: string | null;
  expiresAt: string | null;
  credentialId: string | null;
  credentialUrl: string | null;
}

export interface ProposedCaseView {
  title: string;
  summary: string | null;
  outcome: string | null;
  evidence: string | null;
}

export interface CurriculumProposalView {
  headline: string | null;
  summary: string | null;
  skills: ProposedSkillView[];
  experiences: ProposedExperienceView[];
  certificates: ProposedCertificateView[];
  cases: ProposedCaseView[];
}

/**
 * Lê o PDF por IA e devolve a PROPOSTA para revisão humana. Valida flag, escopo
 * de dono, tipo e tamanho do arquivo no servidor ANTES de qualquer chamada de
 * IA. Nunca persiste skill/bio; nunca lança a chave/o conteúdo bruto em log.
 */
export async function extractCurriculumFromPdf(
  input: z.infer<typeof importFileSchema>,
): Promise<ActionResult<CurriculumProposalView>> {
  try {
    ensureDatabase();
    if (!isCurriculumAiImportEnabled()) {
      throw new ActionError(
        "FORBIDDEN",
        "Leitura por IA indisponivel. Preencha o curriculo manualmente.",
      );
    }
    const parsed = importFileSchema.parse(input);
    const { user, consultant } = await requireCurriculumConsultant();
    const dbUser = await resolveDbUser(user);

    if (!parsed.fileName.toLowerCase().endsWith(".pdf")) {
      throw new ActionError("INVALID_FILE", "Envie um arquivo .pdf.");
    }
    const buffer = Buffer.from(parsed.contentBase64, "base64");
    if (buffer.length === 0) {
      throw new ActionError("INVALID_FILE", "Arquivo vazio ou invalido.");
    }
    if (buffer.length > CV_PDF_MAX_BYTES) {
      throw new ActionError("FILE_TOO_LARGE", "PDF acima do limite de 6 MB.");
    }
    // Confere a assinatura do PDF (não confia só na extensão).
    if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
      throw new ActionError("INVALID_FILE", "O arquivo nao e um PDF valido.");
    }

    const proposal = await extractCurriculumProposal(parsed.contentBase64);
    if (!proposal) {
      await recordAiUsage({
        feature: "CURRICULUM_EXTRACTION",
        model: getConfiguredAiModel(),
        entityType: "Consultant",
        entityId: consultant.id,
        status: "FAILED",
      });
      throw new ActionError(
        "UNEXPECTED",
        "Nao foi possivel ler o PDF. Tente outro arquivo ou preencha manualmente.",
      );
    }

    // Casa os nomes propostos com o catálogo ativo (case-insensitive).
    const names = proposal.skills.map((skill) => skill.name);
    const catalog =
      names.length > 0
        ? await prisma.skill.findMany({
            where: {
              status: "ACTIVE",
              name: { in: names, mode: "insensitive" },
            },
            select: { id: true, name: true, category: true },
          })
        : [];
    const byName = new Map(
      catalog.map((skill) => [skill.name.toLowerCase(), skill]),
    );
    const skills: ProposedSkillView[] = proposal.skills.map((skill) => {
      const match = byName.get(skill.name.toLowerCase());
      return {
        name: skill.name,
        level: skill.level as MySkillLevel,
        evidence: skill.evidence,
        category: skill.category ?? match?.category ?? null,
        catalogSkillId: match?.id ?? null,
      };
    });

    await recordAiUsage({
      feature: "CURRICULUM_EXTRACTION",
      model: getConfiguredAiModel(),
      entityType: "Consultant",
      entityId: consultant.id,
      status: "SUCCESS",
    });
    // Auditoria SEM conteúdo bruto: só contagens e presença de bio.
    await prisma.auditEvent.create({
      data: buildAuditEventData({
        actorUserId: dbUser?.id ?? null,
        entityType: "Consultant",
        entityId: consultant.id,
        action: "CONSULTANT_CURRICULUM_AI_READ",
        after: {
          skills: skills.length,
          experiences: proposal.experiences.length,
          certificates: proposal.certificates.length,
          cases: proposal.cases.length,
          hasBio: Boolean(proposal.headline || proposal.summary),
        },
      }),
    });

    return {
      ok: true,
      data: {
        headline: proposal.headline,
        summary: proposal.summary,
        skills,
        experiences: proposal.experiences,
        certificates: proposal.certificates,
        cases: proposal.cases,
      },
    };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Aplica a proposta JÁ REVISADA pelo consultor (escopo de dono). Bio no próprio
 * cadastro; experiências como ConsultantExperience; skills de catálogo como
 * ConsultantSkill PENDING e skills fora do catálogo como SkillSuggestion
 * pendente de curadoria. Nunca grava skill VALIDATED/ACTIVE automaticamente.
 */
export async function applyCurriculumImport(
  input: z.input<typeof applyImportSchema>,
): Promise<
  ActionResult<{
    appliedSkills: number;
    pendingCatalog: number;
    experiences: number;
    certificates: number;
    cases: number;
    bio: boolean;
  }>
> {
  try {
    ensureDatabase();
    const parsed = applyImportSchema.parse(input);
    const { user, consultant } = await requireCurriculumConsultant();
    const dbUser = await resolveDbUser(user);

    const weekStart = weekStartOf(startOfUtcDay(new Date()));
    const weekEnd = addDays(weekStart, 6);

    let appliedSkills = 0;
    let pendingCatalog = 0;
    let experiencesCreated = 0;
    let certificatesCreated = 0;
    let casesCreated = 0;
    let bioApplied = false;

    await prisma.$transaction(async (tx) => {
      if (parsed.headline !== undefined || parsed.summary !== undefined) {
        await tx.consultant.update({
          where: { id: consultant.id },
          data: {
            curriculumHeadline: parsed.headline ?? null,
            curriculumSummary: parsed.summary ?? null,
          },
        });
        bioApplied = true;
      }

      for (const exp of parsed.experiences) {
        await tx.consultantExperience.create({
          data: {
            consultantId: consultant.id,
            company: exp.company,
            role: exp.role,
            startDate: new Date(`${exp.startDate}T00:00:00.000Z`),
            endDate: exp.endDate
              ? new Date(`${exp.endDate}T00:00:00.000Z`)
              : null,
            description: exp.description,
            location: exp.location,
          },
        });
        experiencesCreated += 1;
      }

      for (const certificate of parsed.certificates) {
        // Idempotencia: o mesmo certificado (nome + emissor) nao duplica quando
        // o consultor reimporta o curriculo. Comparacao case-insensitive.
        const already = await tx.certificate.findFirst({
          where: {
            consultantId: consultant.id,
            name: { equals: certificate.name, mode: "insensitive" },
            issuer: { equals: certificate.issuer, mode: "insensitive" },
          },
          select: { id: true },
        });
        if (already) continue;
        await tx.certificate.create({
          data: {
            consultantId: consultant.id,
            name: certificate.name,
            issuer: certificate.issuer,
            issuedAt: new Date(`${certificate.issuedAt}T00:00:00.000Z`),
            expiresAt: certificate.expiresAt
              ? new Date(`${certificate.expiresAt}T00:00:00.000Z`)
              : null,
            credentialId: certificate.credentialId,
            credentialUrl: certificate.credentialUrl,
            // Curriculo NAO valida credencial: quem valida e People/gestao.
            status: "PENDING",
          },
        });
        certificatesCreated += 1;
      }

      for (const caseItem of parsed.cases) {
        const already = await tx.case.findFirst({
          where: {
            consultantId: consultant.id,
            title: { equals: caseItem.title, mode: "insensitive" },
          },
          select: { id: true },
        });
        if (already) continue;
        await tx.case.create({
          data: {
            consultantId: consultant.id,
            title: caseItem.title,
            summary: caseItem.summary,
            outcome: caseItem.outcome,
            sourceQuote: caseItem.evidence,
            // Origem IA + sem checkpoint = veio de curriculo. Entra como
            // candidato: o consentimento do cliente nunca e inferido do CV.
            aiGenerated: true,
            stage: "DRAFT_INSIGHT",
            status: "PENDING",
          },
        });
        casesCreated += 1;
      }

      for (const skill of parsed.skills) {
        if (skill.catalogSkillId) {
          const catalogSkill = await tx.skill.findUnique({
            where: { id: skill.catalogSkillId },
            select: { id: true, status: true },
          });
          if (!catalogSkill || catalogSkill.status !== "ACTIVE") continue;
          const existing = await tx.consultantSkill.findUnique({
            where: {
              consultantId_skillId: {
                consultantId: consultant.id,
                skillId: skill.catalogSkillId,
              },
            },
            select: { level: true, validationStatus: true },
          });
          const validationStatus =
            existing && existing.level === skill.level
              ? existing.validationStatus
              : "PENDING";
          await tx.consultantSkill.upsert({
            where: {
              consultantId_skillId: {
                consultantId: consultant.id,
                skillId: skill.catalogSkillId,
              },
            },
            update: {
              level: skill.level as SuggestedSkillLevel,
              validationStatus,
            },
            create: {
              consultantId: consultant.id,
              skillId: skill.catalogSkillId,
              level: skill.level as SuggestedSkillLevel,
              validationStatus: "PENDING",
            },
          });
          appliedSkills += 1;
        } else {
          // Fora do catálogo: fica como sugestão pendente de curadoria de admin/
          // People, nunca cria linha de catálogo automaticamente.
          await tx.skillSuggestion.upsert({
            where: {
              consultantId_weekStart_suggestedName: {
                consultantId: consultant.id,
                weekStart,
                suggestedName: skill.name,
              },
            },
            update: {
              skillId: null,
              suggestedCategory: skill.category,
              suggestedLevel: skill.level,
              evidenceSummary: skill.evidence,
              status: "PENDING",
              decidedAt: null,
            },
            create: {
              consultantId: consultant.id,
              weekStart,
              weekEnd,
              skillId: null,
              suggestedName: skill.name,
              suggestedCategory: skill.category,
              suggestedLevel: skill.level,
              evidenceSummary: skill.evidence,
            },
          });
          pendingCatalog += 1;
        }
      }

      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "Consultant",
          entityId: consultant.id,
          action: "CONSULTANT_CURRICULUM_IMPORT_APPLIED",
          after: {
            appliedSkills,
            pendingCatalog,
            experiences: experiencesCreated,
            certificates: certificatesCreated,
            cases: casesCreated,
            bio: bioApplied,
          },
        }),
      });
    });

    revalidatePath(SKILLS_PATH);
    return {
      ok: true,
      data: {
        appliedSkills,
        pendingCatalog,
        experiences: experiencesCreated,
        certificates: certificatesCreated,
        cases: casesCreated,
        bio: bioApplied,
      },
    };
  } catch (error) {
    return toFailure(error);
  }
}

// ---------------------------------------------------------------------------
// Certificados e Cases do PROPRIO consultor (escopo de dono)
// ---------------------------------------------------------------------------
//
// Sem estas leituras, o que a importacao de curriculo grava ficaria invisivel:
// `buildConsultantCurriculum` so projeta certificados VALIDATED, e Case hoje so
// e lido por `sourceCheckpointId` (lib/db/checkpoint-insights.ts). Aqui o dono
// enxerga os proprios registros COM o status de curadoria, e pode remover o que
// ainda esta PENDING — nunca o que ja foi decidido por People/gestao.

export interface MyCertificateView {
  id: string;
  name: string;
  issuer: string;
  /** YYYY-MM-DD. */
  issuedAt: string;
  expiresAt: string | null;
  credentialId: string | null;
  credentialUrl: string | null;
  status: "PENDING" | "VALIDATED" | "REJECTED";
}

export interface MyCaseView {
  id: string;
  title: string;
  summary: string | null;
  outcome: string | null;
  sourceQuote: string | null;
  aiGenerated: boolean;
  stage: "DRAFT_INSIGHT" | "APPROVED" | "PUBLISHABLE";
  status: "PENDING" | "ACCEPTED" | "DISMISSED";
}

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Certificados do consultor logado, em qualquer status de validacao. */
export async function loadMyCertificates(): Promise<
  ActionResult<MyCertificateView[]>
> {
  try {
    ensureDatabase();
    const { consultant } = await requireCurriculumConsultant();
    const rows = await prisma.certificate.findMany({
      where: { consultantId: consultant.id },
      select: {
        id: true,
        name: true,
        issuer: true,
        issuedAt: true,
        expiresAt: true,
        credentialId: true,
        credentialUrl: true,
        status: true,
      },
      orderBy: [{ issuedAt: "desc" }, { name: "asc" }],
    });
    return {
      ok: true,
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        issuer: row.issuer,
        issuedAt: isoDay(row.issuedAt),
        expiresAt: row.expiresAt ? isoDay(row.expiresAt) : null,
        credentialId: row.credentialId,
        credentialUrl: row.credentialUrl,
        status: row.status,
      })),
    };
  } catch (error) {
    return toFailure(error);
  }
}

/** Cases atribuidos ao consultor logado, em qualquer estagio de curadoria. */
export async function loadMyCases(): Promise<ActionResult<MyCaseView[]>> {
  try {
    ensureDatabase();
    const { consultant } = await requireCurriculumConsultant();
    const rows = await prisma.case.findMany({
      where: { consultantId: consultant.id },
      select: {
        id: true,
        title: true,
        summary: true,
        outcome: true,
        sourceQuote: true,
        aiGenerated: true,
        stage: true,
        status: true,
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    return { ok: true, data: rows };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Remove um certificado PROPRIO que ainda esta PENDING. Um certificado ja
 * VALIDATED/REJECTED e decisao de People/gestao — o dono nao apaga.
 */
export async function deleteMyCertificate(
  input: { id: string },
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const { id } = z.object({ id: idSchema }).parse(input);
    const { user, consultant } = await requireCurriculumConsultant();
    const dbUser = await resolveDbUser(user);

    const row = await prisma.certificate.findUnique({
      where: { id },
      select: { id: true, consultantId: true, status: true, name: true },
    });
    // Fora do escopo do dono responde como inexistente (nao revela a linha).
    if (!row || row.consultantId !== consultant.id) {
      throw new ActionError("NOT_FOUND", "Certificado nao encontrado.");
    }
    if (row.status !== "PENDING") {
      throw new ActionError(
        "FORBIDDEN",
        "Certificado ja validado. Fale com o time de Pessoas para altera-lo.",
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.certificate.delete({ where: { id } });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "Certificate",
          entityId: id,
          action: "CONSULTANT_CERTIFICATE_SELF_DELETED",
          before: { name: row.name, status: row.status },
        }),
      });
    });

    revalidatePath(SKILLS_PATH);
    return { ok: true, data: { id } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Remove um case PROPRIO que ainda e candidato (PENDING + DRAFT_INSIGHT). Case
 * ja aceito/aprovado pertence a curadoria — o dono nao apaga.
 */
export async function deleteMyCase(
  input: { id: string },
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const { id } = z.object({ id: idSchema }).parse(input);
    const { user, consultant } = await requireCurriculumConsultant();
    const dbUser = await resolveDbUser(user);

    const row = await prisma.case.findUnique({
      where: { id },
      select: {
        id: true,
        consultantId: true,
        status: true,
        stage: true,
        title: true,
      },
    });
    if (!row || row.consultantId !== consultant.id) {
      throw new ActionError("NOT_FOUND", "Case nao encontrado.");
    }
    if (row.status !== "PENDING" || row.stage !== "DRAFT_INSIGHT") {
      throw new ActionError(
        "FORBIDDEN",
        "Case ja em curadoria. Fale com o seu gestor para altera-lo.",
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.case.delete({ where: { id } });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "Case",
          entityId: id,
          action: "CONSULTANT_CASE_SELF_DELETED",
          before: { title: row.title, status: row.status, stage: row.stage },
        }),
      });
    });

    revalidatePath(SKILLS_PATH);
    return { ok: true, data: { id } };
  } catch (error) {
    return toFailure(error);
  }
}
