"use server";

import { revalidatePath } from "next/cache";
import { Prisma, prisma } from "@jumpflow/database";
import type { ZodType } from "zod";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { FINANCIAL_ROLES, hasRole } from "@/lib/auth/route-permissions";
import type { RoleName } from "@/lib/auth/types";
import { recordAuditEvent } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { resolveDbUser } from "@/lib/db/users";
import {
  billingTypeInputSchema,
  billingTypeUpdateSchema,
  clientInputSchema,
  clientUpdateSchema,
  cnpjLookupSchema,
  type BillingTypeInput,
  type BillingTypeUpdateInput,
  type ClientInput,
  type ClientUpdateInput,
} from "@/lib/clients/schemas";
import { getCnpjProvider } from "@/lib/cnpj/provider";
import type { CnpjLookupResult } from "@/lib/clients/types";

const CLIENTES_PATH = "/app/clientes";
const CLIENT_WRITE_ROLES: RoleName[] = [
  "ADMIN",
  "AREA_MANAGER",
  "FINANCE",
  "SALES",
];

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
      "Banco de dados nao configurado para clientes.",
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
  console.error("[clients action] unexpected error", error);
  return {
    ok: false,
    error: "UNEXPECTED",
    message: "Nao foi possivel concluir a acao.",
  };
}

function parseTaxRules(value?: string): Prisma.InputJsonValue | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as Prisma.InputJsonValue;
  } catch {
    return { note: value };
  }
}

function clientData(
  input: ClientInput,
  includeFinancialFields: boolean,
): Prisma.ClientUncheckedCreateInput {
  const data: Prisma.ClientUncheckedCreateInput = {
    name: input.name,
    document: input.document,
    logoUrl: input.logoUrl,
    status: input.status,
  };
  if (!includeFinancialFields) return data;
  return {
    ...data,
    billingTypeId: input.billingTypeId,
    defaultHourlyRate: input.defaultHourlyRate,
    monthlyFee: input.monthlyFee,
    hourLimit: input.hourLimit,
    roundingRule: input.roundingRule,
    billingDay: input.billingDay,
    dueDay: input.dueDay,
    invoiceKind: input.invoiceKind,
    municipality: input.municipality,
    issRate: input.issRate,
    taxRules: parseTaxRules(input.taxRules),
  };
}

async function audit(
  action: string,
  entityId: string,
  before: unknown,
  after: unknown,
) {
  const user = await requireUser();
  const dbUser = await resolveDbUser(user);
  await recordAuditEvent({
    actorUserId: dbUser?.id ?? null,
    entityType: "Client",
    entityId,
    action,
    before,
    after,
  });
}

export async function createClient(
  input: ClientInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole(CLIENT_WRITE_ROLES);
    const parsed = parseInput(clientInputSchema, input);
    const canWriteFinancials = hasRole(user, FINANCIAL_ROLES);
    const data = clientData(parsed, canWriteFinancials);
    const client = await prisma.client.create({ data });
    await audit("CLIENT_CREATED", client.id, null, data);
    revalidatePath(CLIENTES_PATH);
    return { ok: true, data: { id: client.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateClient(
  input: ClientUpdateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole(CLIENT_WRITE_ROLES);
    const parsed = parseInput(clientUpdateSchema, input);
    const previous = await prisma.client.findUnique({ where: { id: parsed.id } });
    if (!previous) {
      throw new ActionError("NOT_FOUND", "Cliente nao encontrado.");
    }
    const canWriteFinancials = hasRole(user, FINANCIAL_ROLES);
    const data = clientData(parsed, canWriteFinancials);
    await prisma.client.update({
      where: { id: parsed.id },
      data,
    });
    await audit("CLIENT_UPDATED", parsed.id, previous, data);
    revalidatePath(CLIENTES_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function createBillingType(
  input: BillingTypeInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(billingTypeInputSchema, input);
    const billingType = await prisma.billingType.create({ data: parsed });
    const dbUser = await resolveDbUser(await requireUser());
    await recordAuditEvent({
      actorUserId: dbUser?.id ?? null,
      entityType: "BillingType",
      entityId: billingType.id,
      action: "BILLING_TYPE_CREATED",
      before: null,
      after: parsed,
    });
    revalidatePath(CLIENTES_PATH);
    return { ok: true, data: { id: billingType.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateBillingType(
  input: BillingTypeUpdateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(billingTypeUpdateSchema, input);
    const previous = await prisma.billingType.findUnique({
      where: { id: parsed.id },
    });
    if (!previous) {
      throw new ActionError("NOT_FOUND", "Tipo de cobranca nao encontrado.");
    }
    await prisma.billingType.update({
      where: { id: parsed.id },
      data: {
        name: parsed.name,
        chargeType: parsed.chargeType,
        roundingRule: parsed.roundingRule,
        description: parsed.description,
        active: parsed.active,
      },
    });
    const dbUser = await resolveDbUser(await requireUser());
    await recordAuditEvent({
      actorUserId: dbUser?.id ?? null,
      entityType: "BillingType",
      entityId: parsed.id,
      action: "BILLING_TYPE_UPDATED",
      before: previous,
      after: parsed,
    });
    revalidatePath(CLIENTES_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function lookupCnpj(input: {
  document: string;
}): Promise<ActionResult<CnpjLookupResult>> {
  try {
    await requireRole(CLIENT_WRITE_ROLES);
    const parsed = parseInput(cnpjLookupSchema, input);
    const result = await getCnpjProvider().lookup(parsed.document);
    if (!result) {
      throw new ActionError(
        "NOT_FOUND",
        "CNPJ nao encontrado ou provider nao configurado.",
      );
    }
    await audit("CLIENT_CNPJ_LOOKUP", parsed.document, null, {
      provider: result.provider,
    });
    return { ok: true, data: result };
  } catch (error) {
    return toFailure(error);
  }
}
