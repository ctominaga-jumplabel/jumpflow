"use server";

import { revalidatePath } from "next/cache";
import { Prisma, prisma } from "@jumpflow/database";
import type { ZodType } from "zod";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { FINANCIAL_ROLES } from "@/lib/auth/route-permissions";
import type { RoleName } from "@/lib/auth/types";
import { recordAuditEvent } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { resolveDbUser } from "@/lib/db/users";
import { getCnpjProvider } from "@/lib/cnpj/provider";
import { getCepProvider } from "@/lib/cep/provider";
import {
  addressSchema,
  bankAccountSchema,
  benefitSchema,
  companyInfoSchema,
  compensationSchema,
  consultantIdentitySchema,
  lookupInputSchema,
  personalInfoSchema,
  voucherBenefitsSchema,
  VOUCHER_TYPE_BY_KEY,
  type AddressInput,
  type BankAccountInput,
  type BenefitInput,
  type CompanyInfoInput,
  type CompensationInput,
  type ConsultantIdentityInput,
  type PersonalInfoInput,
  type VoucherBenefitsInput,
  type VoucherKey,
} from "@/lib/consultants/schemas";

const CONSULTORES_PATH = "/app/consultores";
const PEOPLE_ROLES: RoleName[] = ["ADMIN", "PEOPLE"];
const BANK_ROLES: RoleName[] = ["ADMIN", "PEOPLE"];

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
      message: "Ja existe um cadastro com estes dados.",
    };
  }
  console.error("[consultants action] unexpected error", error);
  return {
    ok: false,
    error: "UNEXPECTED",
    message: "Nao foi possivel concluir a acao.",
  };
}

function toDate(value?: string): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function parseJson(value?: string): Prisma.InputJsonValue | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as Prisma.InputJsonValue;
  } catch {
    return { version: 1, note: value };
  }
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

async function ensureFlexBankAccounts(consultantId: string) {
  const accounts = await prisma.consultantBankAccount.findMany({
    where: { consultantId, active: true, kind: { in: ["CLT", "PJ"] } },
    select: {
      kind: true,
      pixKey: true,
      bankCode: true,
      agency: true,
      accountNumber: true,
    },
  });
  const usable = accounts.filter(
    (account) =>
      account.pixKey ||
      (account.bankCode && account.agency && account.accountNumber),
  );
  const kinds = new Set(usable.map((account) => account.kind));
  if (!kinds.has("CLT") || !kinds.has("PJ")) {
    throw new ActionError(
      "INVALID_INPUT",
      "CLT FLEX exige contas bancarias CLT e PJ ativas.",
    );
  }
}

export async function saveConsultantIdentity(
  input: ConsultantIdentityInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    const parsed = parseInput(consultantIdentitySchema, input);
    const data = {
      name: parsed.name,
      email: parsed.email.trim().toLowerCase(),
      jobTitle: parsed.jobTitle,
      seniority: parsed.seniority,
      area: parsed.area,
      status: parsed.status,
    };
    const previous = parsed.id
      ? await prisma.consultant.findUnique({ where: { id: parsed.id } })
      : null;
    const consultant = parsed.id
      ? await prisma.consultant.update({ where: { id: parsed.id }, data })
      : await prisma.consultant.create({ data });
    await audit(
      "Consultant",
      consultant.id,
      previous ? "CONSULTANT_UPDATED" : "CONSULTANT_CREATED",
      previous,
      data,
    );
    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { id: consultant.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function savePersonalInfo(
  input: PersonalInfoInput,
): Promise<ActionResult<{ consultantId: string }>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    const parsed = parseInput(personalInfoSchema, input);
    const previous = await prisma.consultantPersonalInfo.findUnique({
      where: { consultantId: parsed.consultantId },
    });
    const data = {
      cpf: parsed.cpf,
      birthDate: toDate(parsed.birthDate),
      phone: parsed.phone,
    };
    await prisma.consultantPersonalInfo.upsert({
      where: { consultantId: parsed.consultantId },
      update: data,
      create: { consultantId: parsed.consultantId, ...data },
    });
    await audit(
      "ConsultantPersonalInfo",
      parsed.consultantId,
      "CONSULTANT_PERSONAL_INFO_SAVED",
      previous,
      data,
    );
    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { consultantId: parsed.consultantId } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function saveCompanyInfo(
  input: CompanyInfoInput,
): Promise<ActionResult<{ consultantId: string }>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    const parsed = parseInput(companyInfoSchema, input);
    const previous = await prisma.consultantCompanyInfo.findUnique({
      where: { consultantId: parsed.consultantId },
    });
    const data = {
      cnpj: parsed.cnpj,
      legalName: parsed.legalName,
      tradeName: parsed.tradeName,
      municipalRegistration: parsed.municipalRegistration,
      taxRegime: parsed.taxRegime,
    };
    await prisma.consultantCompanyInfo.upsert({
      where: { consultantId: parsed.consultantId },
      update: data,
      create: { consultantId: parsed.consultantId, ...data },
    });
    await audit(
      "ConsultantCompanyInfo",
      parsed.consultantId,
      "CONSULTANT_COMPANY_INFO_SAVED",
      previous,
      data,
    );
    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { consultantId: parsed.consultantId } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function saveAddress(
  input: AddressInput,
): Promise<ActionResult<{ consultantId: string }>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    const parsed = parseInput(addressSchema, input);
    const previous = await prisma.consultantAddress.findUnique({
      where: { consultantId: parsed.consultantId },
    });
    const data = {
      postalCode: parsed.postalCode,
      street: parsed.street,
      district: parsed.district,
      city: parsed.city,
      state: parsed.state,
      number: parsed.number,
      complement: parsed.complement,
    };
    await prisma.consultantAddress.upsert({
      where: { consultantId: parsed.consultantId },
      update: data,
      create: { consultantId: parsed.consultantId, ...data },
    });
    await audit(
      "ConsultantAddress",
      parsed.consultantId,
      "CONSULTANT_ADDRESS_SAVED",
      previous,
      data,
    );
    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { consultantId: parsed.consultantId } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function saveBankAccount(
  input: BankAccountInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(BANK_ROLES);
    const parsed = parseInput(bankAccountSchema, input);
    const data = {
      consultantId: parsed.consultantId,
      kind: parsed.kind,
      bankCode: parsed.bankCode,
      bankName: parsed.bankName,
      agency: parsed.agency,
      accountNumber: parsed.accountNumber,
      accountDigit: parsed.accountDigit,
      pixKey: parsed.pixKey,
      holderDocument: parsed.holderDocument,
      active: parsed.active,
    };
    const previous = parsed.id
      ? await prisma.consultantBankAccount.findUnique({ where: { id: parsed.id } })
      : null;
    const account = parsed.id
      ? await prisma.consultantBankAccount.update({
          where: { id: parsed.id },
          data,
        })
      : await prisma.consultantBankAccount.create({ data });
    await audit(
      "ConsultantBankAccount",
      account.id,
      previous ? "CONSULTANT_BANK_ACCOUNT_UPDATED" : "CONSULTANT_BANK_ACCOUNT_CREATED",
      previous,
      data,
    );
    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { id: account.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function saveCompensation(
  input: CompensationInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(compensationSchema, input);
    if (parsed.contractType === "CLT_FLEX") {
      await ensureFlexBankAccounts(parsed.consultantId);
    }
    const data = {
      consultantId: parsed.consultantId,
      contractType: parsed.contractType,
      startsAt: new Date(`${parsed.startsAt}T00:00:00.000Z`),
      endsAt: toDate(parsed.endsAt),
      hourlyRate: parsed.hourlyRate,
      cltAmount: parsed.cltAmount,
      pjAmount: parsed.pjAmount,
      benefitCardAmount: parsed.benefitCardAmount,
      discountRules: parseJson(parsed.discountRulesJson),
      note: parsed.note,
    };
    const previous = parsed.id
      ? await prisma.consultantCompensation.findUnique({ where: { id: parsed.id } })
      : null;
    const compensation = parsed.id
      ? await prisma.consultantCompensation.update({
          where: { id: parsed.id },
          data,
        })
      : await prisma.consultantCompensation.create({ data });
    await audit(
      "ConsultantCompensation",
      compensation.id,
      previous
        ? "CONSULTANT_COMPENSATION_UPDATED"
        : "CONSULTANT_COMPENSATION_CREATED",
      previous,
      data,
    );
    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { id: compensation.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function saveBenefit(
  input: BenefitInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(benefitSchema, input);
    const data = {
      consultantId: parsed.consultantId,
      type: parsed.type,
      amount: parsed.amount,
      startsAt: new Date(`${parsed.startsAt}T00:00:00.000Z`),
      endsAt: toDate(parsed.endsAt),
      note: parsed.note,
    };
    const previous = parsed.id
      ? await prisma.consultantBenefit.findUnique({ where: { id: parsed.id } })
      : null;
    const benefit = parsed.id
      ? await prisma.consultantBenefit.update({ where: { id: parsed.id }, data })
      : await prisma.consultantBenefit.create({ data });
    await audit(
      "ConsultantBenefit",
      benefit.id,
      previous ? "CONSULTANT_BENEFIT_UPDATED" : "CONSULTANT_BENEFIT_CREATED",
      previous,
      data,
    );
    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { id: benefit.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Persists the VA/VR/VT shortcuts shown in "Valor acordado". For each voucher
 * type it keeps a single active ConsultantBenefit row with the current
 * vigencia (startsAt). Behaviour per type:
 *  - amount > 0: closes any other active row of that type (endsAt = day before
 *    startsAt) and upserts one active row for the new vigencia.
 *  - amount cleared/0: closes any active row of that type (no zero-amount row,
 *    since benefit.amount must be positive).
 * Every create/update/close emits an AuditEvent (financial data).
 */
export async function saveVoucherBenefits(
  input: VoucherBenefitsInput,
): Promise<ActionResult<{ consultantId: string }>> {
  try {
    ensureDatabase();
    await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(voucherBenefitsSchema, input);
    const startsAt = new Date(`${parsed.startsAt}T00:00:00.000Z`);
    const closedAt = new Date(startsAt.getTime() - 24 * 60 * 60 * 1000);

    const entries: Array<[VoucherKey, number | undefined]> = [
      ["vr", parsed.vr],
      ["va", parsed.va],
      ["vt", parsed.vt],
    ];

    for (const [key, rawAmount] of entries) {
      const type = VOUCHER_TYPE_BY_KEY[key];
      const amount = Number(rawAmount ?? 0);
      const active = await prisma.consultantBenefit.findMany({
        where: { consultantId: parsed.consultantId, type, endsAt: null },
        orderBy: { startsAt: "desc" },
      });

      if (amount <= 0) {
        // Clearing the voucher: close every active row of this type.
        for (const row of active) {
          await prisma.consultantBenefit.update({
            where: { id: row.id },
            data: { endsAt: closedAt },
          });
          await audit(
            "ConsultantBenefit",
            row.id,
            "CONSULTANT_BENEFIT_ENDED",
            row,
            { endsAt: closedAt },
          );
        }
        continue;
      }

      // Keep one active row: reuse the most recent active one if present,
      // close any extras, and create a fresh row otherwise.
      const [current, ...extras] = active;
      for (const extra of extras) {
        await prisma.consultantBenefit.update({
          where: { id: extra.id },
          data: { endsAt: closedAt },
        });
        await audit(
          "ConsultantBenefit",
          extra.id,
          "CONSULTANT_BENEFIT_ENDED",
          extra,
          { endsAt: closedAt },
        );
      }

      const data = {
        consultantId: parsed.consultantId,
        type,
        amount,
        startsAt,
        endsAt: null,
        note: null,
      };
      if (current) {
        const updated = await prisma.consultantBenefit.update({
          where: { id: current.id },
          data: { amount, startsAt, endsAt: null },
        });
        await audit(
          "ConsultantBenefit",
          updated.id,
          "CONSULTANT_BENEFIT_UPDATED",
          current,
          data,
        );
      } else {
        const created = await prisma.consultantBenefit.create({ data });
        await audit(
          "ConsultantBenefit",
          created.id,
          "CONSULTANT_BENEFIT_CREATED",
          null,
          data,
        );
      }
    }

    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { consultantId: parsed.consultantId } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function lookupConsultantCnpj(
  input: { consultantId: string; value: string },
): Promise<ActionResult<{ applied: boolean }>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    const parsed = parseInput(lookupInputSchema, input);
    const result = await getCnpjProvider().lookup(parsed.value);
    if (!result) throw new ActionError("NOT_FOUND", "CNPJ nao encontrado.");
    await prisma.consultantCompanyInfo.upsert({
      where: { consultantId: parsed.consultantId },
      update: {
        cnpj: result.document,
        legalName: result.legalName,
        tradeName: result.tradeName,
        providerSnapshot: result.raw as Prisma.InputJsonValue,
      },
      create: {
        consultantId: parsed.consultantId,
        cnpj: result.document,
        legalName: result.legalName,
        tradeName: result.tradeName,
        providerSnapshot: result.raw as Prisma.InputJsonValue,
      },
    });
    await audit("ConsultantCompanyInfo", parsed.consultantId, "CNPJ_LOOKUP_APPLIED", null, {
      provider: result.provider,
    });
    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { applied: true } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function lookupConsultantCep(
  input: { consultantId: string; value: string },
): Promise<ActionResult<{ applied: boolean }>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    const parsed = parseInput(lookupInputSchema, input);
    const result = await getCepProvider().lookup(parsed.value);
    if (!result) throw new ActionError("NOT_FOUND", "CEP nao encontrado.");
    await prisma.consultantAddress.upsert({
      where: { consultantId: parsed.consultantId },
      update: {
        postalCode: result.postalCode,
        street: result.street,
        district: result.district,
        city: result.city,
        state: result.state,
        providerSnapshot: result.raw as Prisma.InputJsonValue,
      },
      create: {
        consultantId: parsed.consultantId,
        postalCode: result.postalCode,
        street: result.street,
        district: result.district,
        city: result.city,
        state: result.state,
        providerSnapshot: result.raw as Prisma.InputJsonValue,
      },
    });
    await audit("ConsultantAddress", parsed.consultantId, "CEP_LOOKUP_APPLIED", null, {
      provider: result.provider,
    });
    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { applied: true } };
  } catch (error) {
    return toFailure(error);
  }
}
