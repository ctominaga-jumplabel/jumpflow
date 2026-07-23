"use server";

import { revalidatePath } from "next/cache";
import { Prisma, prisma } from "@jumpflow/database";
import type { ZodType } from "zod";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import { requireRole } from "@/lib/auth/guards";
import { REIMBURSEMENT_POLICY_ROLES } from "@/lib/auth/route-permissions";
import type { AppUser } from "@/lib/auth/types";
import { buildAuditEventData } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { getExpenseTypeByCode } from "@/lib/db/expense-types";
import { resolveDbUser } from "@/lib/db/users";
import type { ExpenseCategory } from "@/lib/expenses/types";
import {
  createExpenseTypeSchema,
  expenseTypeIdSchema,
  reimbursementPolicyIdSchema,
  reimbursementPolicyInputSchema,
  slugifyExpenseTypeCode,
  updateExpenseTypeSchema,
  updateReimbursementPolicySchema,
  type CreateExpenseTypeInput,
  type ExpenseTypeIdInput,
  type ReimbursementPolicyIdInput,
  type ReimbursementPolicyInput,
  type UpdateExpenseTypeInput,
  type UpdateReimbursementPolicyInput,
} from "@/lib/expenses/policy-schemas";

/**
 * Server actions da Politica de Reembolso (Onda 3, P12). CRUD dos limites
 * (prazo/valor) por categoria + regra Geral. RBAC por REIMBURSEMENT_POLICY_ROLES,
 * validacao Zod no servidor e auditoria (REIMBURSEMENT_POLICY_CREATED/UPDATED/
 * DELETED). NAO altera o enum de categorias — apenas configura suas regras.
 */

const POLICY_PATH = "/app/despesas/politica";
const DESPESAS_PATH = "/app/despesas";

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

function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ActionError(
      "INVALID_INPUT",
      result.error.issues[0]?.message ?? "Dados invalidos.",
    );
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
  // Corrida no índice único (categoria ou regra Geral) que passou pela checagem
  // não-atômica ensureUniqueScope: transforma o P2002 na mesma mensagem amigável.
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return {
      ok: false,
      error: "DUPLICATE_ENTRY",
      message: "Ja existe uma regra para este escopo. Edite a regra existente.",
    };
  }
  console.error("[politica-reembolso] unexpected action error", error);
  return {
    ok: false,
    error: "UNEXPECTED",
    message: "Erro inesperado. Tente novamente.",
  };
}

async function requireActor(user: AppUser): Promise<string | null> {
  const dbUser = await resolveDbUser(user);
  return dbUser?.id ?? null;
}

/** Rejeita uma regra cuja categoria (código) não existe no registro de tipos. */
async function ensureCategoryExists(
  category: ExpenseCategory | null,
): Promise<void> {
  if (category === null) return; // Geral
  const type = await getExpenseTypeByCode(category);
  if (!type) {
    throw new ActionError(
      "INVALID_INPUT",
      "Tipo de despesa inexistente. Selecione um tipo cadastrado.",
    );
  }
}

/** Recusa uma segunda regra para a mesma categoria (ou Geral). */
async function ensureUniqueScope(
  category: ExpenseCategory | null,
  ignoreId?: string,
): Promise<void> {
  const existing = await prisma.reimbursementPolicyRule.findFirst({
    where: { category, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    select: { id: true },
  });
  if (existing) {
    throw new ActionError(
      "DUPLICATE_ENTRY",
      category === null
        ? "Ja existe uma regra Geral. Edite a regra existente."
        : "Ja existe uma regra para esta categoria. Edite a regra existente.",
    );
  }
}

export async function createReimbursementPolicyRule(
  input: ReimbursementPolicyInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole(REIMBURSEMENT_POLICY_ROLES);
    const parsed = parseInput(reimbursementPolicyInputSchema, input);
    await ensureCategoryExists(parsed.category);
    await ensureUniqueScope(parsed.category);
    const actorUserId = await requireActor(user);

    const rule = await prisma.$transaction(async (tx) => {
      const created = await tx.reimbursementPolicyRule.create({
        data: {
          category: parsed.category,
          maxAgeDays: parsed.maxAgeDays,
          maxAmount: parsed.maxAmount,
          active: parsed.active,
          notes: parsed.notes?.trim() || null,
        },
      });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId,
          entityType: "ReimbursementPolicyRule",
          entityId: created.id,
          action: "REIMBURSEMENT_POLICY_CREATED",
          after: {
            category: parsed.category,
            maxAgeDays: parsed.maxAgeDays,
            maxAmount: parsed.maxAmount,
            active: parsed.active,
          },
        }),
      });
      return created;
    });

    revalidatePath(POLICY_PATH);
    revalidatePath(DESPESAS_PATH);
    return { ok: true, data: { id: rule.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateReimbursementPolicyRule(
  input: UpdateReimbursementPolicyInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole(REIMBURSEMENT_POLICY_ROLES);
    const parsed = parseInput(updateReimbursementPolicySchema, input);
    const actorUserId = await requireActor(user);

    const before = await prisma.reimbursementPolicyRule.findUnique({
      where: { id: parsed.id },
    });
    if (!before) {
      throw new ActionError("NOT_FOUND", "Regra nao encontrada.");
    }
    await ensureCategoryExists(parsed.category);
    // Trocar a categoria de uma regra nao pode colidir com outra existente.
    await ensureUniqueScope(parsed.category, parsed.id);

    await prisma.$transaction(async (tx) => {
      await tx.reimbursementPolicyRule.update({
        where: { id: parsed.id },
        data: {
          category: parsed.category,
          maxAgeDays: parsed.maxAgeDays,
          maxAmount: parsed.maxAmount,
          active: parsed.active,
          notes: parsed.notes?.trim() || null,
        },
      });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId,
          entityType: "ReimbursementPolicyRule",
          entityId: parsed.id,
          action: "REIMBURSEMENT_POLICY_UPDATED",
          before: {
            category: before.category,
            maxAgeDays: before.maxAgeDays,
            maxAmount:
              before.maxAmount === null ? null : Number(before.maxAmount),
            active: before.active,
          },
          after: {
            category: parsed.category,
            maxAgeDays: parsed.maxAgeDays,
            maxAmount: parsed.maxAmount,
            active: parsed.active,
          },
        }),
      });
    });

    revalidatePath(POLICY_PATH);
    revalidatePath(DESPESAS_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

// --- Cadastro de tipos de despesa (ExpenseType, item 12) --------------------

/** Gera um código único (UPPER_SNAKE) a partir do rótulo, com sufixo _2/_3… */
async function generateUniqueExpenseTypeCode(label: string): Promise<string> {
  const base = slugifyExpenseTypeCode(label);
  let code = base;
  let suffix = 2;
  // Loop curto na prática (colisões são raras); limita para evitar corrida infinita.
  while (
    await prisma.expenseType.findUnique({ where: { code }, select: { id: true } })
  ) {
    code = `${base}_${suffix++}`;
    if (suffix > 1000) break;
  }
  return code;
}

export async function createExpenseType(
  input: CreateExpenseTypeInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole(REIMBURSEMENT_POLICY_ROLES);
    const parsed = parseInput(createExpenseTypeSchema, input);
    const actorUserId = await requireActor(user);

    const code = await generateUniqueExpenseTypeCode(parsed.label);
    // Novo tipo entra no fim da ordem.
    const maxSort = await prisma.expenseType.aggregate({
      _max: { sortOrder: true },
    });
    const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.expenseType.create({
        data: {
          code,
          label: parsed.label,
          active: parsed.active,
          system: false,
          sortOrder,
        },
      });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId,
          entityType: "ExpenseType",
          entityId: row.id,
          action: "EXPENSE_TYPE_CREATED",
          after: { code, label: parsed.label, active: parsed.active },
        }),
      });
      return row;
    });

    revalidatePath(POLICY_PATH);
    revalidatePath(DESPESAS_PATH);
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateExpenseType(
  input: UpdateExpenseTypeInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole(REIMBURSEMENT_POLICY_ROLES);
    const parsed = parseInput(updateExpenseTypeSchema, input);
    const actorUserId = await requireActor(user);

    const before = await prisma.expenseType.findUnique({
      where: { id: parsed.id },
    });
    if (!before) {
      throw new ActionError("NOT_FOUND", "Tipo de despesa nao encontrado.");
    }

    await prisma.$transaction(async (tx) => {
      // O código é imutável (é a chave estável armazenada nas despesas). Só o
      // rótulo e o estado ativo mudam. Tipos nativos também podem ser editados.
      await tx.expenseType.update({
        where: { id: parsed.id },
        data: { label: parsed.label, active: parsed.active },
      });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId,
          entityType: "ExpenseType",
          entityId: parsed.id,
          action: "EXPENSE_TYPE_UPDATED",
          before: { label: before.label, active: before.active },
          after: { label: parsed.label, active: parsed.active },
        }),
      });
    });

    revalidatePath(POLICY_PATH);
    revalidatePath(DESPESAS_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function deleteExpenseType(
  input: ExpenseTypeIdInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole(REIMBURSEMENT_POLICY_ROLES);
    const parsed = parseInput(expenseTypeIdSchema, input);
    const actorUserId = await requireActor(user);

    const before = await prisma.expenseType.findUnique({
      where: { id: parsed.id },
    });
    if (!before) {
      throw new ActionError("NOT_FOUND", "Tipo de despesa nao encontrado.");
    }
    // Tipos nativos nunca são removidos (podem ser desativados).
    if (before.system) {
      throw new ActionError(
        "INVALID_INPUT",
        "Tipos nativos não podem ser removidos. Desative-o se não quiser usá-lo.",
      );
    }
    // Não remover um tipo em uso (despesas ou regras de política o referenciam):
    // isso quebraria os rótulos históricos. Oriente a desativar.
    const [usedByExpense, usedByRule] = await Promise.all([
      prisma.expense.count({ where: { category: before.code } }),
      prisma.reimbursementPolicyRule.count({ where: { category: before.code } }),
    ]);
    if (usedByExpense > 0 || usedByRule > 0) {
      throw new ActionError(
        "INVALID_INPUT",
        "Este tipo está em uso (despesas ou regras). Desative-o em vez de remover.",
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.expenseType.delete({ where: { id: parsed.id } });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId,
          entityType: "ExpenseType",
          entityId: parsed.id,
          action: "EXPENSE_TYPE_DELETED",
          before: { code: before.code, label: before.label },
        }),
      });
    });

    revalidatePath(POLICY_PATH);
    revalidatePath(DESPESAS_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function deleteReimbursementPolicyRule(
  input: ReimbursementPolicyIdInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole(REIMBURSEMENT_POLICY_ROLES);
    const parsed = parseInput(reimbursementPolicyIdSchema, input);
    const actorUserId = await requireActor(user);

    const before = await prisma.reimbursementPolicyRule.findUnique({
      where: { id: parsed.id },
    });
    if (!before) {
      throw new ActionError("NOT_FOUND", "Regra nao encontrada.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.reimbursementPolicyRule.delete({ where: { id: parsed.id } });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId,
          entityType: "ReimbursementPolicyRule",
          entityId: parsed.id,
          action: "REIMBURSEMENT_POLICY_DELETED",
          before: {
            category: before.category,
            maxAgeDays: before.maxAgeDays,
            maxAmount:
              before.maxAmount === null ? null : Number(before.maxAmount),
            active: before.active,
          },
        }),
      });
    });

    revalidatePath(POLICY_PATH);
    revalidatePath(DESPESAS_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}
