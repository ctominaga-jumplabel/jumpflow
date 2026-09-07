"use server";

import { revalidatePath } from "next/cache";
import { Prisma, prisma } from "@jumpflow/database";
import type { ZodType } from "zod";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { hasRole } from "@/lib/auth/route-permissions";
import type { RoleName } from "@/lib/auth/roles";
import { recordAuditEvent } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { resolveDbUser } from "@/lib/db/users";
import { COE_CURATE_ROLES, COE_SQUAD_WRITE_ROLES } from "@/lib/coe/visibility";
import {
  coeMemberAddSchema,
  coeMemberSetActiveSchema,
  coeMemberUpdateSchema,
  coeSquadDeleteSchema,
  coeSquadSaveSchema,
  coeSquadSetStatusSchema,
  type CoeMemberAddInput,
  type CoeMemberSetActiveInput,
  type CoeMemberUpdateInput,
  type CoeSquadDeleteInput,
  type CoeSquadSaveInput,
  type CoeSquadSetStatusInput,
} from "@/lib/coe/schemas";

/**
 * Server actions do COE — Centro Operacional de Excelência.
 *
 * Duas fronteiras de escrita, deliberadamente separadas (ver lib/coe/visibility):
 *  - CURADORIA do núcleo (quem é estratégico) → COE_CURATE_ROLES;
 *  - PROPOSTA de time (staffing sugerido)     → COE_SQUAD_WRITE_ROLES.
 *
 * Toda entrada é validada com Zod no servidor e toda mudança é auditada: entrar
 * ou sair do núcleo e propor um time são decisões de alocação de pessoas, que a
 * arquitetura exige registrar. Nenhuma action cria Allocation — a alocação real
 * continua no módulo de Projetos, por decisão humana.
 */

const COE_PATH = "/app/coe";

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
      "Banco de dados nao configurado para o COE.",
    );
  }
}

function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ActionError(
      "INVALID_INPUT",
      result.error.issues[0]?.message ?? "Revise os campos informados.",
    );
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
      error: "DUPLICATE_ENTRY",
      message: "Ja existe um registro com esses dados.",
    };
  }
  console.error("[coe action] unexpected error", error);
  return {
    ok: false,
    error: "UNEXPECTED",
    message: "Nao foi possivel concluir a acao.",
  };
}

/**
 * Uma proposta só é mexida (status/remoção) por quem a CRIOU ou por um papel de
 * governança. Sem esse recorte, qualquer `COE_SQUAD_WRITE_ROLES` apagava o
 * cenário formalizado de outra pessoa — e propostas concorrentes para o mesmo
 * projeto são justamente o uso esperado da tela.
 *
 * Propostas antigas sem autor (`createdById` nulo, ex.: usuário removido) ficam
 * a cargo da governança.
 */
const SQUAD_GOVERNANCE_ROLES: RoleName[] = ["ADMIN", "AREA_MANAGER"];

async function assertSquadOwnership(createdById: string | null): Promise<void> {
  const user = await requireUser();
  if (hasRole(user, SQUAD_GOVERNANCE_ROLES)) return;
  const dbUser = await resolveDbUser(user);
  if (createdById && dbUser?.id === createdById) return;
  throw new ActionError(
    "FORBIDDEN",
    "Somente quem criou a proposta (ou a gestao) pode altera-la.",
  );
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

// ── Curadoria do núcleo ─────────────────────────────────────────────────────

/**
 * Coloca um consultor no núcleo. Idempotente por consultor: o schema tem
 * `@@unique(consultantId)`, então quem já teve registro é REATIVADO com a nova
 * área de excelência, em vez de gerar erro de constraint ou uma segunda linha.
 */
export async function addCoeMember(
  input: CoeMemberAddInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(COE_CURATE_ROLES);
    const parsed = parseInput(coeMemberAddSchema, input);

    const consultant = await prisma.consultant.findUnique({
      where: { id: parsed.consultantId },
      select: { id: true, status: true },
    });
    if (!consultant) {
      throw new ActionError("NOT_FOUND", "Consultor nao encontrado.");
    }
    if (consultant.status === "INACTIVE") {
      throw new ActionError(
        "FORBIDDEN",
        "Consultor inativo nao entra no nucleo do COE.",
      );
    }

    const dbUser = await resolveDbUser(await requireUser());
    const existing = await prisma.coeMember.findUnique({
      where: { consultantId: parsed.consultantId },
      select: {
        id: true,
        active: true,
        focusArea: true,
        note: true,
        addedById: true,
      },
    });

    const fields = { focusArea: parsed.focusArea, note: parsed.note ?? null };

    // `upsert` na chave única, e não findUnique + create: duas curadorias
    // simultâneas do mesmo consultor viravam P2002 ("Ja existe um registro"),
    // um erro sem sentido para quem só quis incluir alguém no núcleo.
    //
    // `addedById` é preservado na reativação: quem CUROU primeiro é a
    // informação de governança; sobrescrever apagaria o curador original do
    // registro e da auditoria.
    const member = await prisma.coeMember.upsert({
      where: { consultantId: parsed.consultantId },
      create: {
        consultantId: parsed.consultantId,
        ...fields,
        active: true,
        addedById: dbUser?.id ?? null,
      },
      update: { ...fields, active: true },
      select: { id: true },
    });

    await audit(
      "CoeMember",
      member.id,
      existing ? "COE_MEMBER_REACTIVATED" : "COE_MEMBER_ADDED",
      existing,
      { consultantId: parsed.consultantId, ...fields, active: true },
    );
    revalidatePath(COE_PATH);
    return { ok: true, data: { id: member.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/** Edita a área de excelência / observação de um membro do núcleo. */
export async function updateCoeMember(
  input: CoeMemberUpdateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(COE_CURATE_ROLES);
    const parsed = parseInput(coeMemberUpdateSchema, input);

    const previous = await prisma.coeMember.findUnique({
      where: { id: parsed.id },
      select: { id: true, focusArea: true, note: true, active: true },
    });
    if (!previous) {
      throw new ActionError("NOT_FOUND", "Membro do COE nao encontrado.");
    }

    const data = { focusArea: parsed.focusArea, note: parsed.note ?? null };
    await prisma.coeMember.update({ where: { id: parsed.id }, data });
    await audit("CoeMember", parsed.id, "COE_MEMBER_UPDATED", previous, data);
    revalidatePath(COE_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Entra/sai do núcleo. Sair é DESATIVAR, nunca apagar: preserva o histórico de
 * curadoria e mantém íntegras as propostas que já citaram a pessoa.
 */
export async function setCoeMemberActive(
  input: CoeMemberSetActiveInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(COE_CURATE_ROLES);
    const parsed = parseInput(coeMemberSetActiveSchema, input);

    const previous = await prisma.coeMember.findUnique({
      where: { id: parsed.id },
      select: { id: true, active: true, consultantId: true },
    });
    if (!previous) {
      throw new ActionError("NOT_FOUND", "Membro do COE nao encontrado.");
    }

    await prisma.coeMember.update({
      where: { id: parsed.id },
      data: { active: parsed.active },
    });
    await audit(
      "CoeMember",
      parsed.id,
      parsed.active ? "COE_MEMBER_REACTIVATED" : "COE_MEMBER_DEACTIVATED",
      previous,
      { active: parsed.active },
    );
    revalidatePath(COE_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Propostas de time ───────────────────────────────────────────────────────

/**
 * Salva uma proposta de time. NÃO cria Allocation — é um rascunho de staffing
 * para decisão humana. Os membros chegam já resolvidos pela tela (a composição é
 * um read-model recalculável), e o `slotScore` gravado é um snapshot do score
 * composto 0..100, sem qualquer valor financeiro.
 *
 * A gravação é transacional: uma proposta nunca fica pela metade.
 */
export async function saveCoeSquad(
  input: CoeSquadSaveInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(COE_SQUAD_WRITE_ROLES);
    const parsed = parseInput(coeSquadSaveSchema, input);

    // O projeto precisa existir E estar num status que ainda comporta staffing —
    // os mesmos de `listCoeProjectOptions`. Sem a checagem, um id encerrado
    // enviado direto na action passava.
    const project = await prisma.project.findUnique({
      where: { id: parsed.projectId },
      select: { id: true, status: true },
    });
    if (!project) {
      throw new ActionError("NOT_FOUND", "Projeto nao encontrado.");
    }
    if (!["PROPOSAL", "ACTIVE", "PAUSED"].includes(project.status)) {
      throw new ActionError(
        "PROJECT_CLOSED",
        "Projeto encerrado nao recebe proposta de time.",
      );
    }

    // Os consultores propostos precisam existir e estar ativos: uma proposta
    // não pode nascer citando quem já saiu.
    const consultantIds = parsed.members.map((m) => m.consultantId);
    const consultants = await prisma.consultant.findMany({
      where: { id: { in: consultantIds } },
      select: { id: true, status: true },
    });
    if (consultants.length !== consultantIds.length) {
      throw new ActionError(
        "NOT_FOUND",
        "Consultor da proposta nao encontrado.",
      );
    }
    if (consultants.some((c) => c.status === "INACTIVE")) {
      throw new ActionError(
        "FORBIDDEN",
        "A proposta inclui um consultor inativo.",
      );
    }

    const user = await requireUser();
    const dbUser = await resolveDbUser(user);

    const squad = await prisma.$transaction(async (tx) => {
      const created = await tx.coeSquad.create({
        data: {
          projectId: parsed.projectId,
          name: parsed.name,
          periodStart: parsed.periodStart
            ? new Date(`${parsed.periodStart}T00:00:00.000Z`)
            : null,
          weeks: parsed.weeks,
          note: parsed.note ?? null,
          createdById: dbUser?.id ?? null,
        },
        select: { id: true },
      });
      await tx.coeSquadMember.createMany({
        data: parsed.members.map((m) => ({
          squadId: created.id,
          consultantId: m.consultantId,
          slotKey: m.slotKey,
          slotLabel: m.slotLabel,
          slotScore: m.slotScore,
        })),
      });
      return created;
    });

    await audit("CoeSquad", squad.id, "COE_SQUAD_CREATED", null, {
      projectId: parsed.projectId,
      name: parsed.name,
      weeks: parsed.weeks,
      members: parsed.members,
    });
    revalidatePath(COE_PATH);
    return { ok: true, data: { id: squad.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/** Move a proposta entre rascunho, proposta formal e arquivo. */
export async function setCoeSquadStatus(
  input: CoeSquadSetStatusInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(COE_SQUAD_WRITE_ROLES);
    const parsed = parseInput(coeSquadSetStatusSchema, input);

    const previous = await prisma.coeSquad.findUnique({
      where: { id: parsed.id },
      select: { id: true, status: true, createdById: true },
    });
    if (!previous) {
      throw new ActionError("NOT_FOUND", "Proposta nao encontrada.");
    }
    await assertSquadOwnership(previous.createdById);

    await prisma.coeSquad.update({
      where: { id: parsed.id },
      data: { status: parsed.status },
    });
    await audit("CoeSquad", parsed.id, "COE_SQUAD_STATUS_CHANGED", previous, {
      status: parsed.status,
    });
    revalidatePath(COE_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Remove uma proposta. Os membros somem em cascata (a proposta não faz sentido
 * sem eles); nada mais é afetado, pois a proposta nunca gerou alocação.
 */
export async function deleteCoeSquad(
  input: CoeSquadDeleteInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(COE_SQUAD_WRITE_ROLES);
    const parsed = parseInput(coeSquadDeleteSchema, input);

    const previous = await prisma.coeSquad.findUnique({
      where: { id: parsed.id },
      select: {
        id: true,
        name: true,
        projectId: true,
        status: true,
        createdById: true,
      },
    });
    if (!previous) {
      throw new ActionError("NOT_FOUND", "Proposta nao encontrada.");
    }
    await assertSquadOwnership(previous.createdById);

    await prisma.coeSquad.delete({ where: { id: parsed.id } });
    await audit("CoeSquad", parsed.id, "COE_SQUAD_DELETED", previous, null);
    revalidatePath(COE_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}
