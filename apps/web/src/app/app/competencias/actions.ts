"use server";

import { revalidatePath } from "next/cache";
import { Prisma, prisma } from "@jumpflow/database";
import type { ZodType } from "zod";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { COMPETENCY_WRITE_ROLES } from "@/lib/auth/route-permissions";
import { recordAuditEvent } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { resolveDbUser } from "@/lib/db/users";
import {
  profileCreateSchema,
  profileItemAddSchema,
  profileItemRemoveSchema,
  profileItemUpdateSchema,
  profileSetStatusSchema,
  profileUpdateSchema,
  skillCreateSchema,
  skillSetStatusSchema,
  skillUpdateSchema,
  type ProfileCreateInput,
  type ProfileItemAddInput,
  type ProfileItemRemoveInput,
  type ProfileItemUpdateInput,
  type ProfileSetStatusInput,
  type ProfileUpdateInput,
  type SkillCreateInput,
  type SkillSetStatusInput,
  type SkillUpdateInput,
} from "@/lib/competencies/schemas";

// Catálogo e perfis são a fonte da verdade da matriz/gap (/app/competencias) e
// também alimentam o seletor de skills da Operação (/app/projetos). Uma mudança
// no catálogo deve refrescar ambas as superfícies.
const COMPETENCIAS_PATH = "/app/competencias";
const PROJETOS_PATH = "/app/projetos";
const SKILLS_PATH = "/app/skills";

function revalidateCompetencyViews(): void {
  revalidatePath(COMPETENCIAS_PATH);
  revalidatePath(PROJETOS_PATH);
  revalidatePath(SKILLS_PATH);
}

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
      "Banco de dados nao configurado para competencias.",
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
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: "Ja existe um registro com esses dados.",
    };
  }
  console.error("[competencies action] unexpected error", error);
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

/**
 * O nome da skill é único case-insensitive (US12.02). O @@unique do schema é em
 * (name, category) e respeita a caixa, então fazemos a checagem case-insensitive
 * aqui antes de gravar. `excludeId` ignora a própria linha ao editar.
 */
async function ensureSkillNameAvailable(
  name: string,
  excludeId?: string,
): Promise<void> {
  const existing = await prisma.skill.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw new ActionError(
      "INVALID_INPUT",
      "Ja existe uma skill com esse nome.",
    );
  }
}

// ── Catálogo de skills (EP12) ──────────────────────────────────────────────

export async function createSkill(
  input: SkillCreateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(COMPETENCY_WRITE_ROLES);
    const parsed = parseInput(skillCreateSchema, input);
    await ensureSkillNameAvailable(parsed.name);
    const data = {
      name: parsed.name,
      category: parsed.category ?? null,
      type: parsed.type,
    };
    const skill = await prisma.skill.create({ data });
    await audit("Skill", skill.id, "SKILL_CREATED", null, data);
    revalidateCompetencyViews();
    return { ok: true, data: { id: skill.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateSkill(
  input: SkillUpdateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(COMPETENCY_WRITE_ROLES);
    const parsed = parseInput(skillUpdateSchema, input);
    const previous = await prisma.skill.findUnique({ where: { id: parsed.id } });
    if (!previous) throw new ActionError("NOT_FOUND", "Skill nao encontrada.");
    await ensureSkillNameAvailable(parsed.name, parsed.id);
    const data = {
      name: parsed.name,
      category: parsed.category ?? null,
      type: parsed.type,
      status: parsed.status,
    };
    await prisma.skill.update({ where: { id: parsed.id }, data });
    await audit("Skill", parsed.id, "SKILL_UPDATED", previous, data);
    revalidateCompetencyViews();
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Inativa/reativa uma skill (soft delete via status). Inativar preserva vínculos
 * históricos (ConsultantSkill, AllocationSkill, itens de perfil); a skill apenas
 * deixa de ser oferecida para nova seleção (US12.02).
 */
export async function setSkillStatus(
  input: SkillSetStatusInput,
): Promise<ActionResult<{ status: "ACTIVE" | "INACTIVE" }>> {
  try {
    ensureDatabase();
    await requireRole(COMPETENCY_WRITE_ROLES);
    const parsed = parseInput(skillSetStatusSchema, input);
    const previous = await prisma.skill.findUnique({
      where: { id: parsed.id },
      select: { id: true, status: true },
    });
    if (!previous) throw new ActionError("NOT_FOUND", "Skill nao encontrada.");
    if (previous.status === parsed.status) {
      return { ok: true, data: { status: previous.status } };
    }
    await prisma.skill.update({
      where: { id: parsed.id },
      data: { status: parsed.status },
    });
    await audit(
      "Skill",
      parsed.id,
      parsed.status === "ACTIVE" ? "SKILL_ACTIVATED" : "SKILL_DEACTIVATED",
      { status: previous.status },
      { status: parsed.status },
    );
    revalidateCompetencyViews();
    return { ok: true, data: { status: parsed.status } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Perfis de competência (EP13) ───────────────────────────────────────────

async function ensureNoActiveProfileConflict(
  scope: ProfileCreateInput["scope"],
  referenceKey: string,
  excludeId?: string,
): Promise<void> {
  // Não pode haver dois perfis ATIVOS com o mesmo (scope, referenceKey)
  // (US13.01). O @@unique do schema é em (scope, referenceKey) independente do
  // status; aqui só impedimos o caso de negócio (ativo) com mensagem clara — a
  // colisão exata (mesmo par, qualquer status) cai no P2002 do create/update.
  const existing = await prisma.competencyProfile.findFirst({
    where: {
      scope,
      referenceKey,
      status: "ACTIVE",
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw new ActionError(
      "INVALID_INPUT",
      "Ja existe um perfil ativo para esse escopo e referencia.",
    );
  }
}

export async function createProfile(
  input: ProfileCreateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(COMPETENCY_WRITE_ROLES);
    const parsed = parseInput(profileCreateSchema, input);
    await ensureNoActiveProfileConflict(parsed.scope, parsed.referenceKey);
    const data = {
      name: parsed.name,
      scope: parsed.scope,
      referenceKey: parsed.referenceKey,
    };
    const profile = await prisma.competencyProfile.create({ data });
    await audit(
      "CompetencyProfile",
      profile.id,
      "COMPETENCY_PROFILE_CREATED",
      null,
      data,
    );
    revalidateCompetencyViews();
    return { ok: true, data: { id: profile.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateProfile(
  input: ProfileUpdateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(COMPETENCY_WRITE_ROLES);
    const parsed = parseInput(profileUpdateSchema, input);
    const previous = await prisma.competencyProfile.findUnique({
      where: { id: parsed.id },
    });
    if (!previous) throw new ActionError("NOT_FOUND", "Perfil nao encontrado.");
    if (parsed.status === "ACTIVE") {
      await ensureNoActiveProfileConflict(
        parsed.scope,
        parsed.referenceKey,
        parsed.id,
      );
    }
    const data = {
      name: parsed.name,
      scope: parsed.scope,
      referenceKey: parsed.referenceKey,
      status: parsed.status,
    };
    await prisma.competencyProfile.update({ where: { id: parsed.id }, data });
    await audit(
      "CompetencyProfile",
      parsed.id,
      "COMPETENCY_PROFILE_UPDATED",
      previous,
      data,
    );
    revalidateCompetencyViews();
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/** Inativa/reativa um perfil (soft delete via status). */
export async function setProfileStatus(
  input: ProfileSetStatusInput,
): Promise<ActionResult<{ status: "ACTIVE" | "INACTIVE" }>> {
  try {
    ensureDatabase();
    await requireRole(COMPETENCY_WRITE_ROLES);
    const parsed = parseInput(profileSetStatusSchema, input);
    const previous = await prisma.competencyProfile.findUnique({
      where: { id: parsed.id },
      select: { id: true, status: true, scope: true, referenceKey: true },
    });
    if (!previous) throw new ActionError("NOT_FOUND", "Perfil nao encontrado.");
    if (previous.status === parsed.status) {
      return { ok: true, data: { status: previous.status } };
    }
    if (parsed.status === "ACTIVE") {
      await ensureNoActiveProfileConflict(
        previous.scope as ProfileCreateInput["scope"],
        previous.referenceKey,
        parsed.id,
      );
    }
    await prisma.competencyProfile.update({
      where: { id: parsed.id },
      data: { status: parsed.status },
    });
    await audit(
      "CompetencyProfile",
      parsed.id,
      parsed.status === "ACTIVE"
        ? "COMPETENCY_PROFILE_ACTIVATED"
        : "COMPETENCY_PROFILE_DEACTIVATED",
      { status: previous.status },
      { status: parsed.status },
    );
    revalidateCompetencyViews();
    return { ok: true, data: { status: parsed.status } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Itens do perfil (EP13 US13.02) ─────────────────────────────────────────

async function ensureActiveSkill(skillId: string): Promise<void> {
  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
    select: { status: true },
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
}

export async function addProfileItem(
  input: ProfileItemAddInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(COMPETENCY_WRITE_ROLES);
    const parsed = parseInput(profileItemAddSchema, input);
    const profile = await prisma.competencyProfile.findUnique({
      where: { id: parsed.profileId },
      select: { id: true },
    });
    if (!profile) throw new ActionError("NOT_FOUND", "Perfil nao encontrado.");
    await ensureActiveSkill(parsed.skillId);
    const created = await prisma.competencyProfileItem.create({
      data: {
        profileId: parsed.profileId,
        skillId: parsed.skillId,
        requiredLevel: parsed.requiredLevel,
      },
    });
    await audit(
      "CompetencyProfileItem",
      created.id,
      "COMPETENCY_PROFILE_ITEM_ADDED",
      null,
      parsed,
    );
    revalidateCompetencyViews();
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        error: "INVALID_INPUT",
        message: "Skill ja adicionada a este perfil.",
      };
    }
    return toFailure(error);
  }
}

export async function updateProfileItem(
  input: ProfileItemUpdateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(COMPETENCY_WRITE_ROLES);
    const parsed = parseInput(profileItemUpdateSchema, input);
    const previous = await prisma.competencyProfileItem.findUnique({
      where: { id: parsed.id },
    });
    if (!previous) throw new ActionError("NOT_FOUND", "Item nao encontrado.");
    await prisma.competencyProfileItem.update({
      where: { id: parsed.id },
      data: { requiredLevel: parsed.requiredLevel },
    });
    await audit(
      "CompetencyProfileItem",
      parsed.id,
      "COMPETENCY_PROFILE_ITEM_UPDATED",
      previous,
      parsed,
    );
    revalidateCompetencyViews();
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function removeProfileItem(
  input: ProfileItemRemoveInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(COMPETENCY_WRITE_ROLES);
    const parsed = parseInput(profileItemRemoveSchema, input);
    const previous = await prisma.competencyProfileItem.findUnique({
      where: { id: parsed.id },
    });
    if (!previous) throw new ActionError("NOT_FOUND", "Item nao encontrado.");
    await prisma.competencyProfileItem.delete({ where: { id: parsed.id } });
    await audit(
      "CompetencyProfileItem",
      parsed.id,
      "COMPETENCY_PROFILE_ITEM_REMOVED",
      previous,
      null,
    );
    revalidateCompetencyViews();
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}
