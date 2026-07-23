"use server";

import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@jumpflow/database";
import type { ZodType } from "zod";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import { isDevAuthEnabled } from "@/lib/auth/dev";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { FINANCIAL_ROLES } from "@/lib/auth/route-permissions";
import type { AppUser } from "@/lib/auth/types";
import { buildAuditEventData, recordAuditEvent } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { getReceiptSignedUrl } from "@/lib/db/expenses";
import {
  findActiveAllocation,
  getConsultantForUser,
} from "@/lib/db/timesheet";
import { resolveDbUser } from "@/lib/db/users";
import {
  COMMENT_REQUIRED_MESSAGE,
  REASON_REQUIRED_MESSAGE,
  createExpenseBatchSchema,
  decideExpenseSchema,
  expenseIdInputSchema,
  expenseInputSchema,
  receiptInputSchema,
  setPaymentSchema,
  updateExpenseInputSchema,
  type CreateExpenseBatchInput,
  type DecideExpenseInput,
  type ExpenseIdInput,
  type ExpenseInput,
  type SetPaymentInput,
  type UpdateExpenseInput,
} from "@/lib/expenses/schemas";
import type {
  ExpenseAttachmentMeta,
  ExpenseCategory,
  ExpenseStatus,
} from "@/lib/expenses/types";
import { getActivePolicyRules } from "@/lib/db/reimbursement-policy";
import { getActiveExpenseTypeCodes } from "@/lib/db/expense-types";
import { evaluateExpensePolicy } from "@/lib/expenses/reimbursement-policy";
import {
  buildStorageKey,
  validateReceiptFile,
} from "@/lib/storage/file-validation";
import {
  EXPENSE_RECEIPTS_BUCKET,
  getStorageProvider,
  isStorageConfigured,
} from "@/lib/storage/provider";
import { parseIsoDateUtc, toIsoDate } from "@/lib/timesheet/week";

/**
 * Server actions for the Despesas module (docs/despesas-persistencia.md).
 *
 * Every action returns an ActionResult (never throws to the client) and
 * revalidates the affected routes. Decisions replicate the transactional
 * pattern of decideHours: status-guarded updateMany + Approval + AuditEvent
 * in ONE transaction; `count != 1` -> ALREADY_DECIDED (race-safe, idempotent).
 */

const DESPESAS_PATH = "/app/despesas";
const APROVACOES_PATH = "/app/aprovacoes";
const FINANCEIRO_PATH = "/app/financeiro";

/** Owner-editable statuses (rework path of the two-stage chain). */
const EDITABLE_STATUSES: ExpenseStatus[] = [
  "DRAFT",
  "MANAGER_REJECTED",
  "FINANCE_REJECTED",
];

/** Internal typed failure; converted to ActionResult at the boundary. */
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
    throw new ActionError("NO_DATABASE", "Banco de dados não configurado.");
  }
}

async function requireConsultant(user: AppUser) {
  const consultant = await getConsultantForUser(user);
  if (!consultant) {
    throw new ActionError(
      "NO_CONSULTANT",
      "Seu usuário não está vinculado a um consultor. Contate um administrador.",
    );
  }
  return consultant;
}

function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const message = issue?.message ?? "Dados inválidos.";
    const isCommentIssue =
      message === COMMENT_REQUIRED_MESSAGE || message === REASON_REQUIRED_MESSAGE;
    throw new ActionError(
      isCommentIssue ? "COMMENT_REQUIRED" : "INVALID_INPUT",
      message,
    );
  }
  return result.data;
}

/** Convert any thrown error into a safe ActionResult failure. */
function toFailure(error: unknown): ActionResult<never> {
  // Never swallow framework control-flow errors (redirect/notFound).
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
  console.error("[despesas] unexpected action error", error);
  return {
    ok: false,
    error: "UNEXPECTED",
    message: "Erro inesperado. Tente novamente.",
  };
}

type Db = Prisma.TransactionClient | typeof prisma;

async function ensureActiveAllocation(
  db: Db,
  consultantId: string,
  projectId: string,
  date: Date,
) {
  const allocation = await findActiveAllocation(db, consultantId, projectId, date);
  if (!allocation) {
    throw new ActionError(
      "NO_ACTIVE_ALLOCATION",
      "Você não possui alocação ativa neste projeto para a data informada.",
    );
  }
  return allocation;
}

/** ISO date (yyyy-mm-dd, UTC) de hoje, para o motor de politica. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Reforco server-side da Politica de Reembolso (P13): reavalia os lancamentos
 * contra as regras ATIVAS e recusa com POLICY_VIOLATION quando ha violacao de
 * prazo/valor. Nunca confia so no cliente. A politica so restringe quando ha
 * regras cadastradas (sem regras, no-op).
 */
async function assertPolicyOk(
  items: ReadonlyArray<{
    category?: ExpenseCategory | null;
    date: string;
    amount: number;
  }>,
): Promise<void> {
  const rules = await getActivePolicyRules();
  if (rules.length === 0) return;
  const today = todayIso();
  const messages: string[] = [];
  for (const item of items) {
    const violations = evaluateExpensePolicy(item, rules, today);
    for (const v of violations) {
      if (!messages.includes(v.message)) messages.push(v.message);
    }
  }
  if (messages.length > 0) {
    throw new ActionError("POLICY_VIOLATION", messages.join(" "));
  }
}

/**
 * Valida que cada código de categoria informado existe e está ATIVO no registro
 * de tipos (ExpenseType). Substitui a antiga validação por enum fechado: agora
 * os tipos são dinâmicos, então a checagem de domínio precisa consultar o banco.
 */
async function assertCategoriesActive(
  codes: ReadonlyArray<string | null | undefined>,
): Promise<void> {
  const needed = [...new Set(codes.filter((c): c is string => Boolean(c)))];
  if (needed.length === 0) return;
  const active = await getActiveExpenseTypeCodes();
  const invalid = needed.filter((c) => !active.has(c));
  if (invalid.length > 0) {
    throw new ActionError(
      "INVALID_INPUT",
      "Tipo de lançamento inválido ou inativo. Selecione um tipo disponível.",
    );
  }
}

async function ensureOpenProject(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new ActionError("NOT_FOUND", "Projeto não encontrado.");
  }
  if (project.status === "CLOSED") {
    throw new ActionError(
      "PROJECT_CLOSED",
      "Projeto encerrado não recebe despesas.",
    );
  }
  return project;
}

interface OwnedExpenseOptions {
  /** Error code for a non-editable status (NOT_EDITABLE or ATTACHMENT_LOCKED). */
  lockCode?: Extract<ErrorCode, "NOT_EDITABLE" | "ATTACHMENT_LOCKED">;
  lockMessage?: string;
}

/** Load an expense, enforce ownership and the editable-status window. */
async function loadOwnedEditableExpense(
  consultantId: string,
  expenseId: string,
  options: OwnedExpenseOptions = {},
) {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: { attachment: true },
  });
  if (!expense) {
    throw new ActionError("NOT_FOUND", "Despesa não encontrada.");
  }
  if (expense.consultantId !== consultantId) {
    throw new ActionError(
      "FORBIDDEN",
      "Você só pode alterar as suas próprias despesas.",
    );
  }
  if (!EDITABLE_STATUSES.includes(expense.status)) {
    throw new ActionError(
      options.lockCode ?? "NOT_EDITABLE",
      options.lockMessage ??
        "Despesa enviada, aprovada ou paga não pode ser alterada.",
    );
  }
  return expense;
}

/**
 * Segregation of duties: nobody decides or pays their own expense — not even
 * ADMIN. In dev auth the session id never matches db rows, so the consultant
 * email is also compared (same constraint as getConsultantForUser).
 */
function assertNotSelf(
  expense: { consultant: { userId: string | null; email: string } },
  dbUserId: string,
  user: AppUser,
  action: "decidir" | "pagar",
): void {
  const sameUser = expense.consultant.userId === dbUserId;
  const sameDevEmail =
    isDevAuthEnabled() &&
    expense.consultant.email.toLowerCase() === user.email.trim().toLowerCase();
  if (sameUser || sameDevEmail) {
    throw new ActionError(
      "SELF_APPROVAL",
      `Você não pode ${action} a própria despesa.`,
    );
  }
}

async function requireDbUser(user: AppUser) {
  // FK columns (approverUserId/actorUserId/uploadedByUserId) need the REAL db
  // user id — the dev session id ("dev-user") does not exist in the database.
  const dbUser = await resolveDbUser(user);
  if (!dbUser) {
    throw new ActionError(
      "FORBIDDEN",
      "Usuário não encontrado no banco de dados.",
    );
  }
  return dbUser;
}

export async function createExpense(
  input: ExpenseInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const consultant = await requireConsultant(user);
    const parsed = parseInput(expenseInputSchema, input);
    // Schema guarantees a valid date; always midnight UTC (date-only).
    const date = parseIsoDateUtc(parsed.date)!;

    const project = await ensureOpenProject(parsed.projectId);
    const allocation = await ensureActiveAllocation(
      prisma,
      consultant.id,
      project.id,
      date,
    );
    // P13: reforca a Politica de Reembolso (lancamento avulso nao tem
    // categoria, entao so a regra Geral pode se aplicar aqui).
    await assertPolicyOk([{ date: parsed.date, amount: parsed.amount }]);

    const expense = await prisma.expense.create({
      data: {
        consultantId: consultant.id,
        projectId: project.id,
        allocationId: allocation.id,
        date,
        amount: parsed.amount,
        description: parsed.description,
        invoiceNumber: parsed.invoiceNumber?.trim() || null,
        status: "DRAFT",
        submittedAt: null,
      },
    });

    revalidatePath(DESPESAS_PATH);
    return { ok: true, data: { id: expense.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Cria um lançamento por NF: cabeçalho único (projeto, descrição, nota fiscal)
 * com vários itens (data, valor, tipo). Gera N linhas Expense numa transação,
 * compartilhando description + invoiceNumber + groupId. Retorna os ids na mesma
 * ordem dos itens para o cliente subir o anexo de cada item em seguida.
 *
 * Cada item resolve sua própria alocação ativa pela data (mesma regra do
 * create avulso) — itens com datas fora de alocação falham o lote inteiro.
 */
export async function createExpenseBatch(
  input: CreateExpenseBatchInput,
): Promise<ActionResult<{ groupId: string; ids: string[] }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const consultant = await requireConsultant(user);
    const parsed = parseInput(createExpenseBatchSchema, input);

    const project = await ensureOpenProject(parsed.projectId);
    // Item 12: os tipos de despesa são dinâmicos — valida os códigos contra o
    // registro ATIVO antes da política e de qualquer escrita.
    await assertCategoriesActive(parsed.items.map((it) => it.category));
    // P13: reforca a Politica de Reembolso item a item (cada item tem
    // categoria/data/valor). Falha o lote inteiro antes de qualquer escrita.
    await assertPolicyOk(
      parsed.items.map((it) => ({
        category: it.category,
        date: it.date,
        amount: it.amount,
      })),
    );
    const invoiceNumber = parsed.invoiceNumber?.trim() || null;
    const groupId = crypto.randomUUID();

    // Resolve a alocação de cada item (por data) antes de abrir a transação,
    // para que uma data inválida falhe sem deixar linhas parciais.
    const prepared = await Promise.all(
      parsed.items.map(async (item) => {
        const date = parseIsoDateUtc(item.date)!;
        const allocation = await ensureActiveAllocation(
          prisma,
          consultant.id,
          project.id,
          date,
        );
        return { date, allocationId: allocation.id, item };
      }),
    );

    const ids = await prisma.$transaction(async (tx) => {
      const created: string[] = [];
      for (const { date, allocationId, item } of prepared) {
        const expense = await tx.expense.create({
          data: {
            consultantId: consultant.id,
            projectId: project.id,
            allocationId,
            date,
            amount: item.amount,
            description: parsed.description,
            invoiceNumber,
            category: item.category,
            groupId,
            status: "DRAFT",
            submittedAt: null,
          },
        });
        created.push(expense.id);
      }
      return created;
    });

    revalidatePath(DESPESAS_PATH);
    return { ok: true, data: { groupId, ids } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateExpense(
  input: UpdateExpenseInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const consultant = await requireConsultant(user);
    const parsed = parseInput(updateExpenseInputSchema, input);

    const expense = await loadOwnedEditableExpense(consultant.id, parsed.id);

    // Item 12: valida o código do tipo (quando enviado) contra o registro ativo.
    if (parsed.category) await assertCategoriesActive([parsed.category]);

    const projectId = parsed.projectId ?? expense.projectId;
    const date = parsed.date ? parseIsoDateUtc(parsed.date)! : expense.date;
    let allocationId = expense.allocationId;
    const projectChanged = projectId !== expense.projectId;
    const dateChanged = date.getTime() !== expense.date.getTime();
    if (projectChanged || dateChanged) {
      await ensureOpenProject(projectId);
      const allocation = await ensureActiveAllocation(
        prisma,
        consultant.id,
        projectId,
        date,
      );
      allocationId = allocation.id;
    }

    // Status-guarded write (race-safe): the expense may have been submitted
    // or decided between the load above and this update — never regress it.
    const updated = await prisma.expense.updateMany({
      where: {
        id: expense.id,
        consultantId: consultant.id,
        status: { in: EDITABLE_STATUSES },
      },
      data: {
        projectId,
        date,
        allocationId,
        amount: parsed.amount,
        description: parsed.description,
        invoiceNumber: parsed.invoiceNumber?.trim() || null,
        // Categoria opcional: só sobrescreve quando enviada (preserva o tipo de
        // linhas legadas que ainda não têm categoria).
        ...(parsed.category ? { category: parsed.category } : {}),
        // Editing a rejected expense returns it to DRAFT; resubmission
        // restarts the chain from the manager stage.
        status: "DRAFT",
        submittedAt: null,
      },
    });
    if (updated.count !== 1) {
      throw new ActionError(
        "NOT_EDITABLE",
        "Despesa enviada, aprovada ou paga não pode ser alterada.",
      );
    }

    revalidatePath(DESPESAS_PATH);
    return { ok: true, data: { id: expense.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function deleteExpense(
  input: ExpenseIdInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const consultant = await requireConsultant(user);
    const parsed = parseInput(expenseIdInputSchema, input);

    const expense = await loadOwnedEditableExpense(consultant.id, parsed.id, {
      lockMessage:
        "Apenas rascunhos ou despesas reprovadas podem ser excluídas.",
    });
    const storageKey = expense.attachment?.storageKey ?? null;

    await prisma.$transaction(async (tx) => {
      if (expense.attachment) {
        await tx.expenseAttachment.delete({
          where: { id: expense.attachment.id },
        });
      }
      // Status-guarded delete (race-safe): refuse if the expense left the
      // editable window between the load above and this transaction.
      const deleted = await tx.expense.deleteMany({
        where: {
          id: expense.id,
          consultantId: consultant.id,
          status: { in: EDITABLE_STATUSES },
        },
      });
      if (deleted.count !== 1) {
        throw new ActionError(
          "NOT_EDITABLE",
          "Apenas rascunhos ou despesas reprovadas podem ser excluídas.",
        );
      }
    });

    // Best-effort storage cleanup OUTSIDE the transaction: an orphan in the
    // bucket is acceptable, an orphan in the database is not.
    if (storageKey && isStorageConfigured()) {
      try {
        await getStorageProvider()?.delete(storageKey);
      } catch (error) {
        console.error("[despesas] failed to delete receipt from storage", error);
      }
    }

    revalidatePath(DESPESAS_PATH);
    return { ok: true, data: { id: expense.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Shared implementation of attachReceipt/replaceReceipt: the receipt is a
 * separate action (not part of createExpense) because the storage key needs
 * the expense id. MVP: one receipt per expense (1:1 upsert).
 */
async function saveReceipt(
  formData: FormData,
): Promise<ActionResult<ExpenseAttachmentMeta>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    // Honest degradation: storage envs do not exist yet in any environment.
    // Fail BEFORE touching the database — never fake an upload.
    if (!isStorageConfigured()) {
      throw new ActionError(
        "NO_STORAGE",
        "Anexos indisponíveis: storage não configurado.",
      );
    }
    const consultant = await requireConsultant(user);
    const parsed = parseInput(receiptInputSchema, {
      expenseId: formData.get("expenseId"),
    });

    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new ActionError("INVALID_FILE", "Nenhum arquivo enviado.");
    }
    const invalid = validateReceiptFile({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (invalid) {
      throw new ActionError(invalid.code, invalid.message);
    }

    const expense = await loadOwnedEditableExpense(
      consultant.id,
      parsed.expenseId,
      {
        lockCode: "ATTACHMENT_LOCKED",
        lockMessage:
          "Comprovante bloqueado: a despesa já foi enviada para aprovação.",
      },
    );
    const dbUser = await requireDbUser(user);

    const provider = getStorageProvider()!;
    const storageKey = buildStorageKey(expense.id, file.name);
    await provider.upload(storageKey, await file.arrayBuffer(), file.type);

    const previousKey = expense.attachment?.storageKey ?? null;
    const isReplace = expense.attachment !== null;
    const data = {
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      storageBucket: EXPENSE_RECEIPTS_BUCKET,
      storageKey,
      uploadedByUserId: dbUser.id,
    };
    try {
      await prisma.$transaction(async (tx) => {
        // Status-guarded touch (race-safe): refuse if the expense was
        // submitted between the load above and this transaction.
        const guard = await tx.expense.updateMany({
          where: {
            id: expense.id,
            consultantId: consultant.id,
            status: { in: EDITABLE_STATUSES },
          },
          data: { updatedAt: new Date() },
        });
        if (guard.count !== 1) {
          throw new ActionError(
            "ATTACHMENT_LOCKED",
            "Comprovante bloqueado: a despesa já foi enviada para aprovação.",
          );
        }
        await tx.expenseAttachment.upsert({
          where: { expenseId: expense.id },
          update: data,
          create: { expenseId: expense.id, ...data },
        });
        await tx.auditEvent.create({
          data: buildAuditEventData({
            actorUserId: dbUser.id,
            entityType: "Expense",
            entityId: expense.id,
            action: isReplace
              ? "EXPENSE_ATTACHMENT_REPLACED"
              : "EXPENSE_ATTACHMENT_ADDED",
            after: { fileName: file.name, size: file.size },
          }),
        });
      });
    } catch (error) {
      // The new object was already uploaded; clean it up best-effort so the
      // bucket does not accumulate unreferenced files.
      try {
        await provider.delete(storageKey);
      } catch (cleanupError) {
        console.error(
          "[despesas] failed to clean up unreferenced receipt",
          cleanupError,
        );
      }
      throw error;
    }

    // Old object removed only AFTER the new metadata is persisted.
    if (previousKey && previousKey !== storageKey) {
      try {
        await provider.delete(previousKey);
      } catch (error) {
        console.error(
          "[despesas] failed to delete replaced receipt from storage",
          error,
        );
      }
    }

    revalidatePath(DESPESAS_PATH);
    return {
      ok: true,
      data: { fileName: file.name, contentType: file.type, size: file.size },
    };
  } catch (error) {
    return toFailure(error);
  }
}

export async function attachReceipt(
  formData: FormData,
): Promise<ActionResult<ExpenseAttachmentMeta>> {
  return saveReceipt(formData);
}

export async function replaceReceipt(
  formData: FormData,
): Promise<ActionResult<ExpenseAttachmentMeta>> {
  return saveReceipt(formData);
}

export async function submitExpense(
  input: ExpenseIdInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const consultant = await requireConsultant(user);
    const parsed = parseInput(expenseIdInputSchema, input);

    const expense = await prisma.expense.findUnique({
      where: { id: parsed.id },
      include: { attachment: { select: { id: true } } },
    });
    if (!expense) {
      throw new ActionError("NOT_FOUND", "Despesa não encontrada.");
    }
    if (expense.consultantId !== consultant.id) {
      throw new ActionError(
        "FORBIDDEN",
        "Você só pode enviar as suas próprias despesas.",
      );
    }
    if (!expense.attachment) {
      throw new ActionError(
        "INVALID_INPUT",
        "Anexe o comprovante antes de enviar a despesa para aprovação.",
      );
    }

    // P13: reforca a Politica de Reembolso no envio (defesa em profundidade —
    // a regra ou o valor/data podem ter mudado desde o rascunho). Audita a
    // tentativa bloqueada antes de recusar.
    try {
      await assertPolicyOk([
        {
          category: expense.category,
          date: toIsoDate(expense.date),
          amount: Number(expense.amount),
        },
      ]);
    } catch (policyError) {
      if (policyError instanceof ActionError) {
        await recordAuditEvent({
          actorUserId: (await resolveDbUser(user))?.id ?? null,
          entityType: "Expense",
          entityId: expense.id,
          action: "EXPENSE_POLICY_BLOCKED",
          after: { reason: policyError.message },
        });
      }
      throw policyError;
    }

    // Same requirement as the other mutations: the audit actor must be the
    // real db user (never null, never the synthetic dev session id).
    const dbUser = await requireDbUser(user);
    await prisma.$transaction(async (tx) => {
      // Status guard makes double-submit idempotent (and race-safe). A
      // rejected expense must be edited first (edit returns it to DRAFT).
      const updated = await tx.expense.updateMany({
        where: { id: expense.id, status: "DRAFT" },
        data: { status: "SUBMITTED", submittedAt: new Date() },
      });
      if (updated.count !== 1) {
        throw new ActionError(
          "NOT_EDITABLE",
          "Apenas rascunhos podem ser enviados. Edite a despesa reprovada para retorná-la a rascunho.",
        );
      }
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser.id,
          entityType: "Expense",
          entityId: expense.id,
          action: "EXPENSE_SUBMITTED",
          after: { amount: Number(expense.amount) },
        }),
      });
    });

    revalidatePath(DESPESAS_PATH);
    revalidatePath(APROVACOES_PATH);
    return { ok: true, data: { id: expense.id } };
  } catch (error) {
    return toFailure(error);
  }
}

interface DecisionStage {
  expectedStatus: "SUBMITTED" | "MANAGER_APPROVED";
  approvedStatus: "MANAGER_APPROVED" | "FINANCE_APPROVED";
  rejectedStatus: "MANAGER_REJECTED" | "FINANCE_REJECTED";
  approvedAudit: string;
  rejectedAudit: string;
}

const MANAGER_STAGE: DecisionStage = {
  expectedStatus: "SUBMITTED",
  approvedStatus: "MANAGER_APPROVED",
  rejectedStatus: "MANAGER_REJECTED",
  approvedAudit: "EXPENSE_MANAGER_APPROVED",
  rejectedAudit: "EXPENSE_MANAGER_REJECTED",
};

const FINANCE_STAGE: DecisionStage = {
  expectedStatus: "MANAGER_APPROVED",
  approvedStatus: "FINANCE_APPROVED",
  rejectedStatus: "FINANCE_REJECTED",
  approvedAudit: "EXPENSE_FINANCE_APPROVED",
  rejectedAudit: "EXPENSE_FINANCE_REJECTED",
};

/**
 * Shared decision flow (section 6 of the spec): one transaction with a
 * status-guarded updateMany + Approval + AuditEvent. `count != 1` means the
 * expense was already decided (or is not at this stage) -> ALREADY_DECIDED.
 */
async function decideExpense(
  user: AppUser,
  input: DecideExpenseInput,
  stage: DecisionStage,
): Promise<ActionResult<{ id: string; status: string }>> {
  const parsed = parseInput(decideExpenseSchema, input);
  const dbUser = await requireDbUser(user);

  const expense = await prisma.expense.findUnique({
    where: { id: parsed.expenseId },
    include: {
      project: { select: { managerUserId: true } },
      consultant: { select: { userId: true, email: true } },
    },
  });
  if (!expense) {
    throw new ActionError("NOT_FOUND", "Despesa não encontrada.");
  }

  // PROJECT_MANAGER decides only expenses of projects they manage (manager
  // stage); ADMIN/AREA_MANAGER are unrestricted.
  if (stage === MANAGER_STAGE) {
    const restricted =
      !user.roles.includes("ADMIN") && !user.roles.includes("AREA_MANAGER");
    if (restricted && expense.project.managerUserId !== dbUser.id) {
      throw new ActionError(
        "FORBIDDEN",
        "Você só pode decidir despesas de projetos que gerencia.",
      );
    }
  }

  // Segregation of duties applies to EVERY stage and EVERY role.
  assertNotSelf(expense, dbUser.id, user, "decidir");

  const nextStatus =
    parsed.decision === "APPROVED" ? stage.approvedStatus : stage.rejectedStatus;
  const auditAction =
    parsed.decision === "APPROVED" ? stage.approvedAudit : stage.rejectedAudit;
  const comment = parsed.comment.trim() || null;

  await prisma.$transaction(async (tx) => {
    const updated = await tx.expense.updateMany({
      where: { id: expense.id, status: stage.expectedStatus },
      data: { status: nextStatus },
    });
    if (updated.count !== 1) {
      throw new ActionError(
        "ALREADY_DECIDED",
        "Esta despesa já foi decidida ou não está nesta etapa.",
      );
    }
    await tx.approval.create({
      data: {
        entityType: "EXPENSE",
        entityId: expense.id,
        approverUserId: dbUser.id,
        status: parsed.decision,
        comment,
        isAutomatic: false,
      },
    });
    await tx.auditEvent.create({
      data: buildAuditEventData({
        actorUserId: dbUser.id,
        entityType: "Expense",
        entityId: expense.id,
        action: auditAction,
        after: { comment },
      }),
    });
  });

  revalidatePath(APROVACOES_PATH);
  revalidatePath(DESPESAS_PATH);
  revalidatePath(FINANCEIRO_PATH);
  return { ok: true, data: { id: expense.id, status: nextStatus } };
}

export async function decideAsManager(
  input: DecideExpenseInput,
): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole(["ADMIN", "AREA_MANAGER", "PROJECT_MANAGER"]);
    return await decideExpense(user, input, MANAGER_STAGE);
  } catch (error) {
    return toFailure(error);
  }
}

export async function decideAsFinance(
  input: DecideExpenseInput,
): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole(FINANCIAL_ROLES);
    return await decideExpense(user, input, FINANCE_STAGE);
  } catch (error) {
    return toFailure(error);
  }
}

interface PaymentTransition {
  expectedStatus: "FINANCE_APPROVED" | "PAYMENT_SCHEDULED";
  nextStatus: "PAYMENT_SCHEDULED" | "PAID" | "FINANCE_APPROVED";
  auditAction: string;
}

const PAYMENT_TRANSITIONS: Record<SetPaymentInput["action"], PaymentTransition> =
  {
    SCHEDULE: {
      expectedStatus: "FINANCE_APPROVED",
      nextStatus: "PAYMENT_SCHEDULED",
      auditAction: "EXPENSE_PAYMENT_SCHEDULED",
    },
    MARK_PAID: {
      expectedStatus: "PAYMENT_SCHEDULED",
      nextStatus: "PAID",
      auditAction: "EXPENSE_PAID",
    },
    CANCEL_SCHEDULE: {
      expectedStatus: "PAYMENT_SCHEDULED",
      nextStatus: "FINANCE_APPROVED",
      auditAction: "EXPENSE_PAYMENT_CANCELLED",
    },
  };

/**
 * Payment lifecycle (finance only). Not an approval decision, so it writes
 * NO Approval row — only the status-guarded transition + AuditEvent in one
 * transaction. PAID is the only terminal status.
 */
export async function setPayment(
  input: SetPaymentInput,
): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(setPaymentSchema, input);
    const dbUser = await requireDbUser(user);

    const expense = await prisma.expense.findUnique({
      where: { id: parsed.expenseId },
      include: { consultant: { select: { userId: true, email: true } } },
    });
    if (!expense) {
      throw new ActionError("NOT_FOUND", "Despesa não encontrada.");
    }
    assertNotSelf(expense, dbUser.id, user, "pagar");

    const transition = PAYMENT_TRANSITIONS[parsed.action];
    const reason = parsed.reason?.trim() || null;

    await prisma.$transaction(async (tx) => {
      const updated = await tx.expense.updateMany({
        where: { id: expense.id, status: transition.expectedStatus },
        data: { status: transition.nextStatus },
      });
      if (updated.count !== 1) {
        throw new ActionError(
          "ALREADY_DECIDED",
          "Esta despesa não está no status esperado para esta ação.",
        );
      }
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser.id,
          entityType: "Expense",
          entityId: expense.id,
          action: transition.auditAction,
          after: reason ? { reason } : { amount: Number(expense.amount) },
        }),
      });
    });

    revalidatePath(FINANCEIRO_PATH);
    revalidatePath(DESPESAS_PATH);
    return { ok: true, data: { id: expense.id, status: transition.nextStatus } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Thin server action so the client can request a receipt link on demand.
 * RBAC + signing happen in `getReceiptSignedUrl` (lib/db/expenses).
 */
export async function getReceiptUrl(input: {
  expenseId: string;
}): Promise<ActionResult<{ url: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const parsed = parseInput(receiptInputSchema, input);
    const result = await getReceiptSignedUrl(parsed.expenseId, user);
    if (result.ok) {
      const dbUser = await resolveDbUser(user);
      await recordAuditEvent({
        actorUserId: dbUser?.id ?? null,
        entityType: "Expense",
        entityId: parsed.expenseId,
        action: "EXPENSE_ATTACHMENT_SIGNED_URL_CREATED",
        after: { expiresInSeconds: 300 },
      });
    }
    return result;
  } catch (error) {
    return toFailure(error);
  }
}
