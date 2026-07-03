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
import {
  getConsultantProfile,
  type ConsultantProfile,
} from "@/lib/db/consultants";
import { resolveDbUser } from "@/lib/db/users";
import { getCnpjProvider } from "@/lib/cnpj/provider";
import { getCepProvider } from "@/lib/cep/provider";
import { signedHourBankHours } from "@/lib/consultants/hour-bank";
import {
  CONSULTANT_DOCUMENTS_BUCKET,
  getConsultantDocumentStorageProvider,
  isStorageConfigured,
} from "@/lib/storage/provider";
import {
  buildConsultantDocumentKey,
  validatePhotoFile,
  validateReceiptFile,
} from "@/lib/storage/file-validation";
import {
  buildConsultantCurriculum,
  type ConsultantCurriculum,
} from "@/lib/consultants/curriculum";
import {
  addressSchema,
  bankAccountSchema,
  benefitSchema,
  companyInfoSchema,
  compensationSchema,
  consultantDocumentDeleteSchema,
  curriculumBioSchema,
  generateCurriculumSnapshotSchema,
  consultantDocumentUploadSchema,
  consultantIdentitySchema,
  consultantPhotoDeleteSchema,
  cltInfoSchema,
  deleteEducationSchema,
  deleteHourBankEntrySchema,
  deleteLanguageSchema,
  deleteVacationSchema,
  educationSchema,
  hourBankEntrySchema,
  languageSchema,
  legalRepresentativeSchema,
  lookupInputSchema,
  personalInfoSchema,
  pjInfoSchema,
  vacationSchema,
  voucherBenefitsSchema,
  VOUCHER_TYPE_BY_KEY,
  type AddressInput,
  type BankAccountInput,
  type BenefitInput,
  type CltInfoInput,
  type CompanyInfoInput,
  type CompensationInput,
  type ConsultantIdentityInput,
  type CurriculumBioInput,
  type EducationInput,
  type GenerateCurriculumSnapshotInput,
  type HourBankEntryInput,
  type LanguageInput,
  type LegalRepresentativeInput,
  type PersonalInfoInput,
  type PjInfoInput,
  type VacationInput,
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

/**
 * Carrega o perfil completo do consultor para o modal de edicao (dados
 * pessoais, empresa, endereco e documentos com URLs assinadas). Leitura
 * protegida por papel; chamada sob demanda ao abrir o modal.
 */
export async function loadConsultantProfile(
  consultantId: string,
): Promise<ActionResult<ConsultantProfile>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    const profile = await getConsultantProfile(consultantId);
    if (!profile) {
      throw new ActionError("NOT_FOUND", "Consultor nao encontrado.");
    }
    return { ok: true, data: profile };
  } catch (error) {
    return toFailure(error);
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
      contractType: parsed.contractType,
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
      socialName: parsed.socialName,
      rg: parsed.rg,
      gender: parsed.gender,
      maritalStatus: parsed.maritalStatus,
      nationality: parsed.nationality,
      personalEmail: parsed.personalEmail,
      corporateEmail: parsed.corporateEmail,
      mobilePhone: parsed.mobilePhone,
      emergencyPhone: parsed.emergencyPhone,
      emergencyContact: parsed.emergencyContact,
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
      stateRegistration: parsed.stateRegistration,
      cnaePrimary: parsed.cnaePrimary,
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
): Promise<
  ActionResult<{
    applied: boolean;
    company: { cnpj: string; legalName: string | null; tradeName: string | null };
  }>
> {
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
    return {
      ok: true,
      data: {
        applied: true,
        company: {
          cnpj: result.document,
          legalName: result.legalName ?? null,
          tradeName: result.tradeName ?? null,
        },
      },
    };
  } catch (error) {
    return toFailure(error);
  }
}

export async function lookupConsultantCep(
  input: { consultantId: string; value: string },
): Promise<
  ActionResult<{
    applied: boolean;
    address: {
      postalCode: string;
      street: string | null;
      district: string | null;
      city: string | null;
      state: string | null;
    };
  }>
> {
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
    return {
      ok: true,
      data: {
        applied: true,
        address: {
          postalCode: result.postalCode,
          street: result.street ?? null,
          district: result.district ?? null,
          city: result.city ?? null,
          state: result.state ?? null,
        },
      },
    };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Anexa um documento ao consultor (bucket consultant-documents). Regra "um
 * anexo por tipo": para tipos != OTHER, um novo upload substitui o documento
 * do mesmo tipo (o objeto antigo so e removido apos persistir o novo). OTHER
 * pode repetir. Degrada honestamente quando storage nao esta configurado;
 * nunca finge um upload.
 */
export async function uploadConsultantDocument(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    if (!isStorageConfigured()) {
      throw new ActionError(
        "NO_STORAGE",
        "Anexos indisponiveis: storage nao configurado.",
      );
    }
    const parsed = parseInput(consultantDocumentUploadSchema, {
      consultantId: formData.get("consultantId"),
      type: formData.get("type"),
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

    const consultant = await prisma.consultant.findUnique({
      where: { id: parsed.consultantId },
      select: { id: true },
    });
    if (!consultant) {
      throw new ActionError("NOT_FOUND", "Consultor nao encontrado.");
    }

    const user = await requireUser();
    const dbUser = await resolveDbUser(user);

    const provider = getConsultantDocumentStorageProvider()!;
    const storageKey = buildConsultantDocumentKey(
      parsed.consultantId,
      parsed.type,
      file.name,
    );
    await provider.upload(storageKey, await file.arrayBuffer(), file.type);

    // "Um anexo por tipo": reaproveita a linha do mesmo tipo (exceto OTHER).
    const existing =
      parsed.type === "OTHER"
        ? null
        : await prisma.consultantDocument.findFirst({
            where: { consultantId: parsed.consultantId, type: parsed.type },
            orderBy: { createdAt: "desc" },
          });
    const previousKey = existing?.storageKey ?? null;
    const data = {
      type: parsed.type,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      storageBucket: CONSULTANT_DOCUMENTS_BUCKET,
      storageKey,
      uploadedByUserId: dbUser?.id ?? null,
    };

    let documentId: string;
    try {
      const row = existing
        ? await prisma.consultantDocument.update({
            where: { id: existing.id },
            data,
          })
        : await prisma.consultantDocument.create({
            data: { consultantId: parsed.consultantId, ...data },
          });
      documentId = row.id;
      await audit(
        "ConsultantDocument",
        row.id,
        existing ? "CONSULTANT_DOCUMENT_REPLACED" : "CONSULTANT_DOCUMENT_ADDED",
        existing,
        { type: parsed.type, fileName: file.name, size: file.size },
      );
    } catch (error) {
      // O objeto novo ja foi enviado; remove-o best-effort para nao acumular
      // arquivos orfaos no bucket.
      try {
        await provider.delete(storageKey);
      } catch (cleanupError) {
        console.error(
          "[consultores] falha ao limpar documento orfao",
          cleanupError,
        );
      }
      throw error;
    }

    // Objeto antigo removido somente APOS persistir o novo metadado.
    if (previousKey && previousKey !== storageKey) {
      try {
        await provider.delete(previousKey);
      } catch (error) {
        console.error(
          "[consultores] falha ao remover documento substituido",
          error,
        );
      }
    }

    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { id: documentId } };
  } catch (error) {
    return toFailure(error);
  }
}

/** Remove um documento do consultor (metadado + objeto no storage). */
export async function deleteConsultantDocument(
  input: { documentId: string },
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    const parsed = parseInput(consultantDocumentDeleteSchema, input);
    const doc = await prisma.consultantDocument.findUnique({
      where: { id: parsed.documentId },
    });
    if (!doc) {
      throw new ActionError("NOT_FOUND", "Documento nao encontrado.");
    }
    await prisma.consultantDocument.delete({ where: { id: doc.id } });
    await audit("ConsultantDocument", doc.id, "CONSULTANT_DOCUMENT_DELETED", doc, null);

    if (isStorageConfigured()) {
      try {
        await getConsultantDocumentStorageProvider()?.delete(doc.storageKey);
      } catch (error) {
        console.error("[consultores] falha ao remover objeto do storage", error);
      }
    }

    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { id: doc.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Define a foto do consultor (imagem, bucket consultant-documents). Guarda a
 * chave de storage em ConsultantPersonalInfo.photoStorageKey e remove a foto
 * anterior apos persistir a nova. Degrada honestamente sem storage.
 */
export async function uploadConsultantPhoto(
  formData: FormData,
): Promise<ActionResult<{ consultantId: string }>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    if (!isStorageConfigured()) {
      throw new ActionError(
        "NO_STORAGE",
        "Foto indisponivel: storage nao configurado.",
      );
    }
    const parsed = parseInput(consultantPhotoDeleteSchema, {
      consultantId: formData.get("consultantId"),
    });
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new ActionError("INVALID_FILE", "Nenhum arquivo enviado.");
    }
    const invalid = validatePhotoFile({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (invalid) {
      throw new ActionError(invalid.code, invalid.message);
    }

    const previous = await prisma.consultantPersonalInfo.findUnique({
      where: { consultantId: parsed.consultantId },
      select: { photoStorageKey: true },
    });
    const previousKey = previous?.photoStorageKey ?? null;

    const provider = getConsultantDocumentStorageProvider()!;
    const storageKey = buildConsultantDocumentKey(
      parsed.consultantId,
      "photo",
      file.name,
    );
    await provider.upload(storageKey, await file.arrayBuffer(), file.type);

    try {
      await prisma.consultantPersonalInfo.upsert({
        where: { consultantId: parsed.consultantId },
        update: { photoStorageKey: storageKey },
        create: { consultantId: parsed.consultantId, photoStorageKey: storageKey },
      });
      await audit(
        "ConsultantPersonalInfo",
        parsed.consultantId,
        "CONSULTANT_PHOTO_SAVED",
        { photoStorageKey: previousKey },
        { photoStorageKey: storageKey },
      );
    } catch (error) {
      try {
        await provider.delete(storageKey);
      } catch (cleanupError) {
        console.error("[consultores] falha ao limpar foto orfa", cleanupError);
      }
      throw error;
    }

    if (previousKey && previousKey !== storageKey) {
      try {
        await provider.delete(previousKey);
      } catch (error) {
        console.error("[consultores] falha ao remover foto anterior", error);
      }
    }

    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { consultantId: parsed.consultantId } };
  } catch (error) {
    return toFailure(error);
  }
}

/** Cria ou atualiza um idioma do consultor (Competencias). */
export async function saveConsultantLanguage(
  input: LanguageInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    const parsed = parseInput(languageSchema, input);
    const data = {
      consultantId: parsed.consultantId,
      name: parsed.name,
      level: parsed.level,
    };
    const previous = parsed.id
      ? await prisma.consultantLanguage.findUnique({ where: { id: parsed.id } })
      : null;
    const row = parsed.id
      ? await prisma.consultantLanguage.update({ where: { id: parsed.id }, data })
      : await prisma.consultantLanguage.create({ data });
    await audit(
      "ConsultantLanguage",
      row.id,
      previous ? "CONSULTANT_LANGUAGE_UPDATED" : "CONSULTANT_LANGUAGE_CREATED",
      previous,
      data,
    );
    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/** Remove um idioma do consultor. */
export async function deleteConsultantLanguage(
  input: { id: string },
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    const parsed = parseInput(deleteLanguageSchema, input);
    const previous = await prisma.consultantLanguage.findUnique({
      where: { id: parsed.id },
    });
    if (!previous) throw new ActionError("NOT_FOUND", "Idioma nao encontrado.");
    await prisma.consultantLanguage.delete({ where: { id: parsed.id } });
    await audit("ConsultantLanguage", parsed.id, "CONSULTANT_LANGUAGE_DELETED", previous, null);
    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/** Cria ou atualiza uma formacao academica do consultor (Competencias). */
export async function saveConsultantEducation(
  input: EducationInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    const parsed = parseInput(educationSchema, input);
    const data = {
      consultantId: parsed.consultantId,
      institution: parsed.institution,
      course: parsed.course,
      degree: parsed.degree,
      startYear: parsed.startYear ?? null,
      endYear: parsed.endYear ?? null,
      completed: parsed.completed,
    };
    const previous = parsed.id
      ? await prisma.consultantEducation.findUnique({ where: { id: parsed.id } })
      : null;
    const row = parsed.id
      ? await prisma.consultantEducation.update({ where: { id: parsed.id }, data })
      : await prisma.consultantEducation.create({ data });
    await audit(
      "ConsultantEducation",
      row.id,
      previous ? "CONSULTANT_EDUCATION_UPDATED" : "CONSULTANT_EDUCATION_CREATED",
      previous,
      data,
    );
    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/** Remove uma formacao academica do consultor. */
export async function deleteConsultantEducation(
  input: { id: string },
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    const parsed = parseInput(deleteEducationSchema, input);
    const previous = await prisma.consultantEducation.findUnique({
      where: { id: parsed.id },
    });
    if (!previous) throw new ActionError("NOT_FOUND", "Formacao nao encontrada.");
    await prisma.consultantEducation.delete({ where: { id: parsed.id } });
    await audit("ConsultantEducation", parsed.id, "CONSULTANT_EDUCATION_DELETED", previous, null);
    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/** Cria/atualiza os dados CLT (contratacao + dados trabalhistas) — upsert 1:1. */
export async function saveCltInfo(
  input: CltInfoInput,
): Promise<ActionResult<{ consultantId: string }>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    const parsed = parseInput(cltInfoSchema, input);
    const previous = await prisma.consultantCltInfo.findUnique({
      where: { consultantId: parsed.consultantId },
    });
    const data = {
      registrationNumber: parsed.registrationNumber,
      pisPasep: parsed.pisPasep,
      ctpsNumber: parsed.ctpsNumber,
      ctpsSeries: parsed.ctpsSeries,
      admissionDate: toDate(parsed.admissionDate),
      dismissalDate: toDate(parsed.dismissalDate),
      contractKind: parsed.contractKind,
      workSchedule: parsed.workSchedule,
      workShift: parsed.workShift,
      union: parsed.union,
      registeredRole: parsed.registeredRole,
    };
    await prisma.consultantCltInfo.upsert({
      where: { consultantId: parsed.consultantId },
      update: data,
      create: { consultantId: parsed.consultantId, ...data },
    });
    await audit(
      "ConsultantCltInfo",
      parsed.consultantId,
      "CONSULTANT_CLT_INFO_SAVED",
      previous,
      data,
    );
    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { consultantId: parsed.consultantId } };
  } catch (error) {
    return toFailure(error);
  }
}

/** Cria/atualiza um periodo de ferias. balanceDays = entitled - taken. */
export async function saveVacation(
  input: VacationInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    const parsed = parseInput(vacationSchema, input);
    const entitledDays = parsed.entitledDays ?? 30;
    const takenDays = parsed.takenDays ?? 0;
    const data = {
      consultantId: parsed.consultantId,
      accrualPeriodStart: new Date(`${parsed.accrualPeriodStart}T00:00:00.000Z`),
      accrualPeriodEnd: new Date(`${parsed.accrualPeriodEnd}T00:00:00.000Z`),
      entitledDays,
      takenDays,
      balanceDays: entitledDays - takenDays,
      note: parsed.note,
    };
    const previous = parsed.id
      ? await prisma.consultantVacation.findUnique({ where: { id: parsed.id } })
      : null;
    const row = parsed.id
      ? await prisma.consultantVacation.update({ where: { id: parsed.id }, data })
      : await prisma.consultantVacation.create({ data });
    await audit(
      "ConsultantVacation",
      row.id,
      previous ? "CONSULTANT_VACATION_UPDATED" : "CONSULTANT_VACATION_CREATED",
      previous,
      data,
    );
    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/** Remove um periodo de ferias. */
export async function deleteVacation(
  input: { id: string },
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    const parsed = parseInput(deleteVacationSchema, input);
    const previous = await prisma.consultantVacation.findUnique({
      where: { id: parsed.id },
    });
    if (!previous) throw new ActionError("NOT_FOUND", "Periodo nao encontrado.");
    await prisma.consultantVacation.delete({ where: { id: parsed.id } });
    await audit("ConsultantVacation", parsed.id, "CONSULTANT_VACATION_DELETED", previous, null);
    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Lanca uma entrada no banco de horas. A magnitude vem positiva do formulario;
 * o sinal e definido pelo tipo: COMPENSATION debita (negativo), OVERTIME e
 * ADJUSTMENT creditam (positivo). Saldo = SUM(hours).
 */
export async function addHourBankEntry(
  input: HourBankEntryInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    const parsed = parseInput(hourBankEntrySchema, input);
    const signedHours = signedHourBankHours(parsed.kind, parsed.hours);
    const data = {
      consultantId: parsed.consultantId,
      occurredAt: new Date(`${parsed.occurredAt}T00:00:00.000Z`),
      kind: parsed.kind,
      hours: signedHours,
      note: parsed.note,
    };
    const previous = parsed.id
      ? await prisma.consultantHourBankEntry.findUnique({ where: { id: parsed.id } })
      : null;
    const row = parsed.id
      ? await prisma.consultantHourBankEntry.update({ where: { id: parsed.id }, data })
      : await prisma.consultantHourBankEntry.create({ data });
    await audit(
      "ConsultantHourBankEntry",
      row.id,
      previous ? "CONSULTANT_HOUR_BANK_UPDATED" : "CONSULTANT_HOUR_BANK_CREATED",
      previous,
      { ...data, hours: signedHours },
    );
    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/** Remove uma entrada do banco de horas. */
export async function deleteHourBankEntry(
  input: { id: string },
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    const parsed = parseInput(deleteHourBankEntrySchema, input);
    const previous = await prisma.consultantHourBankEntry.findUnique({
      where: { id: parsed.id },
    });
    if (!previous) throw new ActionError("NOT_FOUND", "Lancamento nao encontrado.");
    await prisma.consultantHourBankEntry.delete({ where: { id: parsed.id } });
    await audit("ConsultantHourBankEntry", parsed.id, "CONSULTANT_HOUR_BANK_DELETED", previous, null);
    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/** Cria/atualiza os dados PJ (contratacao + faturamento) — upsert 1:1. */
export async function savePjInfo(
  input: PjInfoInput,
): Promise<ActionResult<{ consultantId: string }>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    const parsed = parseInput(pjInfoSchema, input);
    const previous = await prisma.consultantPjInfo.findUnique({
      where: { consultantId: parsed.consultantId },
    });
    const data = {
      contractStart: toDate(parsed.contractStart),
      contractEnd: toDate(parsed.contractEnd),
      contractTermMonths: parsed.contractTermMonths ?? null,
      autoRenew: parsed.autoRenew,
      issuesInvoice: parsed.issuesInvoice,
      invoiceType: parsed.invoiceType,
      issuingMunicipality: parsed.issuingMunicipality,
      issRate: parsed.issRate ?? null,
    };
    await prisma.consultantPjInfo.upsert({
      where: { consultantId: parsed.consultantId },
      update: data,
      create: { consultantId: parsed.consultantId, ...data },
    });
    await audit(
      "ConsultantPjInfo",
      parsed.consultantId,
      "CONSULTANT_PJ_INFO_SAVED",
      previous,
      data,
    );
    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { consultantId: parsed.consultantId } };
  } catch (error) {
    return toFailure(error);
  }
}

/** Cria/atualiza o responsavel legal da empresa PJ — upsert 1:1. */
export async function saveLegalRepresentative(
  input: LegalRepresentativeInput,
): Promise<ActionResult<{ consultantId: string }>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    const parsed = parseInput(legalRepresentativeSchema, input);
    const previous = await prisma.consultantLegalRepresentative.findUnique({
      where: { consultantId: parsed.consultantId },
    });
    const data = {
      name: parsed.name,
      cpf: parsed.cpf,
      email: parsed.email,
      phone: parsed.phone,
    };
    await prisma.consultantLegalRepresentative.upsert({
      where: { consultantId: parsed.consultantId },
      update: data,
      create: { consultantId: parsed.consultantId, ...data },
    });
    await audit(
      "ConsultantLegalRepresentative",
      parsed.consultantId,
      "CONSULTANT_LEGAL_REP_SAVED",
      previous,
      data,
    );
    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { consultantId: parsed.consultantId } };
  } catch (error) {
    return toFailure(error);
  }
}

// ---------------------------------------------------------------------------
// Curriculo do Consultor (EP-M06)
// ---------------------------------------------------------------------------

export interface CurriculumSnapshotSummary {
  id: string;
  createdAt: string;
  generatedByName: string | null;
}

export interface CurriculumView {
  curriculum: ConsultantCurriculum;
  snapshots: CurriculumSnapshotSummary[];
}

/**
 * Carrega o curriculo derivado (sempre atualizado) + o historico de snapshots.
 * Leitura protegida por People. Sem dados financeiros.
 */
export async function loadConsultantCurriculum(
  consultantId: string,
): Promise<ActionResult<CurriculumView>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    const curriculum = await buildConsultantCurriculum(consultantId);
    if (!curriculum) {
      throw new ActionError("NOT_FOUND", "Consultor nao encontrado.");
    }
    const snapshots = await prisma.consultantCurriculumSnapshot.findMany({
      where: { consultantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        generatedBy: { select: { name: true, email: true } },
      },
    });
    return {
      ok: true,
      data: {
        curriculum,
        snapshots: snapshots.map((row) => ({
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          generatedByName:
            row.generatedBy?.name ?? row.generatedBy?.email ?? null,
        })),
      },
    };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Salva a bio curada (headline/summary) do curriculo — a UNICA parte
 * nao-derivada. RBAC People, auditado. Sem dados financeiros.
 */
export async function saveCurriculumBio(
  input: CurriculumBioInput,
): Promise<ActionResult<{ consultantId: string }>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    const parsed = parseInput(curriculumBioSchema, input);
    const previous = await prisma.consultant.findUnique({
      where: { id: parsed.consultantId },
      select: { curriculumHeadline: true, curriculumSummary: true },
    });
    if (!previous) {
      throw new ActionError("NOT_FOUND", "Consultor nao encontrado.");
    }
    const data = {
      curriculumHeadline: parsed.headline ?? null,
      curriculumSummary: parsed.summary ?? null,
    };
    await prisma.consultant.update({
      where: { id: parsed.consultantId },
      data,
    });
    await audit(
      "Consultant",
      parsed.consultantId,
      "CONSULTANT_CURRICULUM_BIO_SAVED",
      previous,
      data,
    );
    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { consultantId: parsed.consultantId } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Congela o curriculo atual em um snapshot versionado (US-M06.04). RBAC People,
 * auditado. O content e o agregado derivado no momento; sem assinatura nem
 * dados financeiros.
 */
export async function generateCurriculumSnapshot(
  input: GenerateCurriculumSnapshotInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(PEOPLE_ROLES);
    const parsed = parseInput(generateCurriculumSnapshotSchema, input);
    const curriculum = await buildConsultantCurriculum(parsed.consultantId);
    if (!curriculum) {
      throw new ActionError("NOT_FOUND", "Consultor nao encontrado.");
    }
    const user = await requireUser();
    const dbUser = await resolveDbUser(user);
    const snapshot = await prisma.consultantCurriculumSnapshot.create({
      data: {
        consultantId: parsed.consultantId,
        content: curriculum as unknown as Prisma.InputJsonValue,
        generatedByUserId: dbUser?.id ?? null,
      },
    });
    await audit(
      "ConsultantCurriculumSnapshot",
      snapshot.id,
      "CONSULTANT_CURRICULUM_SNAPSHOT_GENERATED",
      null,
      { consultantId: parsed.consultantId, generatedAt: curriculum.generatedAt },
    );
    revalidatePath(CONSULTORES_PATH);
    return { ok: true, data: { id: snapshot.id } };
  } catch (error) {
    return toFailure(error);
  }
}
