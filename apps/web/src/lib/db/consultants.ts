import { prisma } from "@jumpflow/database";
import type {
  Consultant,
  ConsultantSkillTag,
  Seniority,
} from "@/lib/mock-data/consultants";
import {
  getConsultantDocumentStorageProvider,
  isStorageConfigured,
} from "@/lib/storage/provider";
import { isDatabaseConfigured } from "./config";

/** TTL curto para URLs assinadas de documentos/foto (nunca persistir). */
const SIGNED_URL_TTL_SECONDS = 300;

export interface ConsultantDocumentView {
  id: string;
  type: string;
  fileName: string;
  contentType: string;
  size: number;
  createdAt: string;
  /** URL assinada de curta duracao, ou null quando storage indisponivel. */
  url: string | null;
}

export interface ConsultantProfile {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  area: string | null;
  seniority: string;
  status: string;
  contractType: string | null;
  personal: {
    cpf: string | null;
    birthDate: string | null;
    phone: string | null;
    socialName: string | null;
    rg: string | null;
    gender: string | null;
    maritalStatus: string | null;
    nationality: string | null;
    personalEmail: string | null;
    corporateEmail: string | null;
    mobilePhone: string | null;
    emergencyPhone: string | null;
    emergencyContact: string | null;
    photoUrl: string | null;
  };
  company: {
    cnpj: string | null;
    legalName: string | null;
    tradeName: string | null;
    municipalRegistration: string | null;
    stateRegistration: string | null;
    cnaePrimary: string | null;
    taxRegime: string | null;
  };
  address: {
    postalCode: string | null;
    street: string | null;
    district: string | null;
    city: string | null;
    state: string | null;
    number: string | null;
    complement: string | null;
  };
  documents: ConsultantDocumentView[];
  languages: {
    id: string;
    name: string;
    level: string;
  }[];
  educations: {
    id: string;
    institution: string;
    course: string;
    degree: string;
    startYear: number | null;
    endYear: number | null;
    completed: boolean;
  }[];
  cltInfo: {
    registrationNumber: string | null;
    pisPasep: string | null;
    ctpsNumber: string | null;
    ctpsSeries: string | null;
    admissionDate: string | null;
    dismissalDate: string | null;
    contractKind: string | null;
    workSchedule: string | null;
    workShift: string | null;
    union: string | null;
    registeredRole: string | null;
  };
  vacations: {
    id: string;
    accrualPeriodStart: string;
    accrualPeriodEnd: string;
    entitledDays: number;
    takenDays: number;
    balanceDays: number;
    note: string | null;
  }[];
  hourBank: {
    balance: number;
    entries: {
      id: string;
      occurredAt: string;
      kind: string;
      hours: number;
      note: string | null;
    }[];
  };
  pjInfo: {
    contractStart: string | null;
    contractEnd: string | null;
    contractTermMonths: number | null;
    autoRenew: boolean;
    issuesInvoice: boolean;
    invoiceType: string | null;
    issuingMunicipality: string | null;
    issRate: number | null;
  };
  legalRep: {
    name: string | null;
    cpf: string | null;
    email: string | null;
    phone: string | null;
  };
}

/** Date -> yyyy-mm-dd (UTC), ou null. Consistente com toDate nas actions. */
function toDateInput(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

async function signKey(key: string | null): Promise<string | null> {
  if (!key || !isStorageConfigured()) return null;
  const provider = getConsultantDocumentStorageProvider();
  if (!provider) return null;
  try {
    return await provider.getSignedUrl(key, SIGNED_URL_TTL_SECONDS);
  } catch {
    return null;
  }
}

/**
 * Carrega o perfil completo de um consultor para edicao (dados pessoais,
 * empresa, endereco e documentos com URLs assinadas). Retorna null se o
 * consultor nao existe. A autorizacao e feita no chamador (Server Action).
 */
export async function getConsultantProfile(
  consultantId: string,
): Promise<ConsultantProfile | null> {
  if (!isDatabaseConfigured()) return null;
  const row = await prisma.consultant.findUnique({
    where: { id: consultantId },
    include: {
      personalInfo: true,
      companyInfo: true,
      address: true,
      documents: { orderBy: { createdAt: "desc" } },
      languages: { orderBy: { name: "asc" } },
      educations: { orderBy: [{ endYear: "desc" }, { startYear: "desc" }] },
      cltInfo: true,
      vacations: { orderBy: { accrualPeriodStart: "desc" } },
      hourBankEntries: { orderBy: { occurredAt: "desc" } },
      pjInfo: true,
      legalRepresentative: true,
    },
  });
  if (!row) return null;

  const documents: ConsultantDocumentView[] = await Promise.all(
    row.documents.map(async (doc) => ({
      id: doc.id,
      type: doc.type,
      fileName: doc.fileName,
      contentType: doc.contentType,
      size: doc.size,
      createdAt: doc.createdAt.toISOString(),
      url: await signKey(doc.storageKey),
    })),
  );

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    jobTitle: row.jobTitle,
    area: row.area,
    seniority: row.seniority,
    status: row.status,
    contractType: row.contractType,
    personal: {
      cpf: row.personalInfo?.cpf ?? null,
      birthDate: toDateInput(row.personalInfo?.birthDate ?? null),
      phone: row.personalInfo?.phone ?? null,
      socialName: row.personalInfo?.socialName ?? null,
      rg: row.personalInfo?.rg ?? null,
      gender: row.personalInfo?.gender ?? null,
      maritalStatus: row.personalInfo?.maritalStatus ?? null,
      nationality: row.personalInfo?.nationality ?? null,
      personalEmail: row.personalInfo?.personalEmail ?? null,
      corporateEmail: row.personalInfo?.corporateEmail ?? null,
      mobilePhone: row.personalInfo?.mobilePhone ?? null,
      emergencyPhone: row.personalInfo?.emergencyPhone ?? null,
      emergencyContact: row.personalInfo?.emergencyContact ?? null,
      photoUrl: await signKey(row.personalInfo?.photoStorageKey ?? null),
    },
    company: {
      cnpj: row.companyInfo?.cnpj ?? null,
      legalName: row.companyInfo?.legalName ?? null,
      tradeName: row.companyInfo?.tradeName ?? null,
      municipalRegistration: row.companyInfo?.municipalRegistration ?? null,
      stateRegistration: row.companyInfo?.stateRegistration ?? null,
      cnaePrimary: row.companyInfo?.cnaePrimary ?? null,
      taxRegime: row.companyInfo?.taxRegime ?? null,
    },
    address: {
      postalCode: row.address?.postalCode ?? null,
      street: row.address?.street ?? null,
      district: row.address?.district ?? null,
      city: row.address?.city ?? null,
      state: row.address?.state ?? null,
      number: row.address?.number ?? null,
      complement: row.address?.complement ?? null,
    },
    documents,
    languages: row.languages.map((lang) => ({
      id: lang.id,
      name: lang.name,
      level: lang.level,
    })),
    educations: row.educations.map((edu) => ({
      id: edu.id,
      institution: edu.institution,
      course: edu.course,
      degree: edu.degree,
      startYear: edu.startYear,
      endYear: edu.endYear,
      completed: edu.completed,
    })),
    cltInfo: {
      registrationNumber: row.cltInfo?.registrationNumber ?? null,
      pisPasep: row.cltInfo?.pisPasep ?? null,
      ctpsNumber: row.cltInfo?.ctpsNumber ?? null,
      ctpsSeries: row.cltInfo?.ctpsSeries ?? null,
      admissionDate: toDateInput(row.cltInfo?.admissionDate ?? null),
      dismissalDate: toDateInput(row.cltInfo?.dismissalDate ?? null),
      contractKind: row.cltInfo?.contractKind ?? null,
      workSchedule: row.cltInfo?.workSchedule ?? null,
      workShift: row.cltInfo?.workShift ?? null,
      union: row.cltInfo?.union ?? null,
      registeredRole: row.cltInfo?.registeredRole ?? null,
    },
    vacations: row.vacations.map((vac) => ({
      id: vac.id,
      accrualPeriodStart: vac.accrualPeriodStart.toISOString().slice(0, 10),
      accrualPeriodEnd: vac.accrualPeriodEnd.toISOString().slice(0, 10),
      entitledDays: vac.entitledDays,
      takenDays: vac.takenDays,
      balanceDays: vac.balanceDays,
      note: vac.note,
    })),
    hourBank: {
      balance: row.hourBankEntries.reduce(
        (sum, entry) => sum + Number(entry.hours),
        0,
      ),
      entries: row.hourBankEntries.map((entry) => ({
        id: entry.id,
        occurredAt: entry.occurredAt.toISOString().slice(0, 10),
        kind: entry.kind,
        hours: Number(entry.hours),
        note: entry.note,
      })),
    },
    pjInfo: {
      contractStart: toDateInput(row.pjInfo?.contractStart ?? null),
      contractEnd: toDateInput(row.pjInfo?.contractEnd ?? null),
      contractTermMonths: row.pjInfo?.contractTermMonths ?? null,
      autoRenew: row.pjInfo?.autoRenew ?? false,
      issuesInvoice: row.pjInfo?.issuesInvoice ?? true,
      invoiceType: row.pjInfo?.invoiceType ?? null,
      issuingMunicipality: row.pjInfo?.issuingMunicipality ?? null,
      issRate: row.pjInfo?.issRate != null ? Number(row.pjInfo.issRate) : null,
    },
    legalRep: {
      name: row.legalRepresentative?.name ?? null,
      cpf: row.legalRepresentative?.cpf ?? null,
      email: row.legalRepresentative?.email ?? null,
      phone: row.legalRepresentative?.phone ?? null,
    },
  };
}

function mapSeniority(value: string): Seniority {
  switch (value) {
    case "MID_LEVEL":
      return "PLENO";
    case "SENIOR":
      return "SENIOR";
    case "SPECIALIST":
    case "PRINCIPAL":
      return "ESPECIALISTA";
    case "INTERN":
    case "JUNIOR":
    default:
      return "JUNIOR";
  }
}

export async function listConsultantDirectory(): Promise<Consultant[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.consultant.findMany({
    include: {
      allocations: { select: { allocationPercent: true, status: true } },
      skills: {
        include: { skill: { select: { id: true, name: true } } },
        orderBy: [{ validationStatus: "asc" }, { updatedAt: "desc" }],
        take: 4,
      },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  return rows.map((row) => {
    const topSkills: ConsultantSkillTag[] = row.skills.map((item) => ({
      skillId: item.skill.id,
      name: item.skill.name,
    }));
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      jobTitle: row.jobTitle ?? "-",
      seniority: mapSeniority(row.seniority),
      area: row.area ?? "-",
      status: row.status === "ACTIVE" ? "ACTIVE" : "INACTIVE",
      allocationPercent: row.allocations
        .filter((allocation) => allocation.status === "ACTIVE")
        .reduce((sum, allocation) => sum + allocation.allocationPercent, 0),
      topSkills,
    };
  });
}

