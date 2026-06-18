import { describe, expect, it } from "vitest";
import {
  companyInfoSchema,
  consultantDocumentUploadSchema,
  consultantIdentitySchema,
  educationSchema,
  hourBankEntrySchema,
  languageSchema,
  legalRepresentativeSchema,
  personalInfoSchema,
  pjInfoSchema,
  vacationSchema,
} from "./schemas";

const CONSULTANT_ID = "seed-consultant-1";

describe("consultantIdentitySchema.contractType", () => {
  const base = {
    name: "Ana Martins",
    email: "ana@jumplabel.com.br",
    seniority: "SENIOR" as const,
    status: "ACTIVE" as const,
  };

  it("accepts the three contract types", () => {
    for (const contractType of ["CLT", "PJ", "CLT_FLEX"] as const) {
      expect(
        consultantIdentitySchema.safeParse({ ...base, contractType }).success,
      ).toBe(true);
    }
  });

  it("treats empty string as undefined (not set)", () => {
    const parsed = consultantIdentitySchema.parse({ ...base, contractType: "" });
    expect(parsed.contractType).toBeUndefined();
  });

  it("rejects an unknown contract type", () => {
    expect(
      consultantIdentitySchema.safeParse({ ...base, contractType: "MEI" }).success,
    ).toBe(false);
  });
});

describe("personalInfoSchema (Story 1 fields)", () => {
  it("accepts the new personal/contact fields", () => {
    const parsed = personalInfoSchema.parse({
      consultantId: CONSULTANT_ID,
      socialName: "Ana",
      rg: "12.345.678-9",
      gender: "FEMALE",
      maritalStatus: "MARRIED",
      nationality: "Brasileira",
      personalEmail: "ana@pessoal.com",
      corporateEmail: "ana@jumplabel.com.br",
      mobilePhone: "11999990000",
      emergencyPhone: "1133334444",
      emergencyContact: "Joao (irmao)",
    });
    expect(parsed.gender).toBe("FEMALE");
    expect(parsed.personalEmail).toBe("ana@pessoal.com");
  });

  it("coerces empty enum/email to undefined", () => {
    const parsed = personalInfoSchema.parse({
      consultantId: CONSULTANT_ID,
      gender: "",
      maritalStatus: "",
      personalEmail: "",
    });
    expect(parsed.gender).toBeUndefined();
    expect(parsed.maritalStatus).toBeUndefined();
    expect(parsed.personalEmail).toBeUndefined();
  });

  it("rejects an invalid e-mail and an unknown gender", () => {
    expect(
      personalInfoSchema.safeParse({
        consultantId: CONSULTANT_ID,
        personalEmail: "not-an-email",
      }).success,
    ).toBe(false);
    expect(
      personalInfoSchema.safeParse({
        consultantId: CONSULTANT_ID,
        gender: "WHATEVER",
      }).success,
    ).toBe(false);
  });
});

describe("companyInfoSchema (Story 1 fields)", () => {
  it("accepts stateRegistration and cnaePrimary", () => {
    const parsed = companyInfoSchema.parse({
      consultantId: CONSULTANT_ID,
      stateRegistration: "123.456.789.000",
      cnaePrimary: "6201-5/01",
    });
    expect(parsed.stateRegistration).toBe("123.456.789.000");
    expect(parsed.cnaePrimary).toBe("6201-5/01");
  });
});

describe("languageSchema", () => {
  it("accepts a valid language + level", () => {
    expect(
      languageSchema.safeParse({
        consultantId: CONSULTANT_ID,
        name: "Ingles",
        level: "ADVANCED",
      }).success,
    ).toBe(true);
  });

  it("rejects an empty name and an unknown level", () => {
    expect(
      languageSchema.safeParse({
        consultantId: CONSULTANT_ID,
        name: "",
        level: "ADVANCED",
      }).success,
    ).toBe(false);
    expect(
      languageSchema.safeParse({
        consultantId: CONSULTANT_ID,
        name: "Ingles",
        level: "C2",
      }).success,
    ).toBe(false);
  });
});

describe("educationSchema", () => {
  const base = {
    consultantId: CONSULTANT_ID,
    institution: "USP",
    course: "Ciencia da Computacao",
    degree: "UNDERGRADUATE" as const,
  };

  it("accepts a minimal valid input and defaults completed to false", () => {
    const parsed = educationSchema.parse(base);
    expect(parsed.completed).toBe(false);
  });

  it("coerces year strings and rejects endYear before startYear", () => {
    const ok = educationSchema.parse({ ...base, startYear: "2015", endYear: "2019" });
    expect(ok.startYear).toBe(2015);
    expect(ok.endYear).toBe(2019);
    expect(
      educationSchema.safeParse({ ...base, startYear: 2019, endYear: 2015 }).success,
    ).toBe(false);
  });

  it("rejects an out-of-range year and an unknown degree", () => {
    expect(
      educationSchema.safeParse({ ...base, startYear: 1800 }).success,
    ).toBe(false);
    expect(
      educationSchema.safeParse({ ...base, degree: "PHD" }).success,
    ).toBe(false);
  });
});

describe("vacationSchema", () => {
  const base = {
    consultantId: CONSULTANT_ID,
    accrualPeriodStart: "2025-01-01",
    accrualPeriodEnd: "2025-12-31",
  };

  it("accepts a valid period and defaults days", () => {
    expect(vacationSchema.safeParse(base).success).toBe(true);
  });

  it("rejects end before start", () => {
    expect(
      vacationSchema.safeParse({
        ...base,
        accrualPeriodStart: "2025-12-31",
        accrualPeriodEnd: "2025-01-01",
      }).success,
    ).toBe(false);
  });

  it("rejects takenDays greater than entitledDays", () => {
    expect(
      vacationSchema.safeParse({ ...base, entitledDays: 30, takenDays: 40 })
        .success,
    ).toBe(false);
  });
});

describe("hourBankEntrySchema", () => {
  const base = {
    consultantId: CONSULTANT_ID,
    occurredAt: "2026-06-01",
    kind: "OVERTIME" as const,
  };

  it("accepts a positive hours value", () => {
    const parsed = hourBankEntrySchema.parse({ ...base, hours: "8.5" });
    expect(parsed.hours).toBe(8.5);
  });

  it("accepts a negative value (signed adjustment)", () => {
    const parsed = hourBankEntrySchema.parse({
      ...base,
      kind: "ADJUSTMENT",
      hours: -3,
    });
    expect(parsed.hours).toBe(-3);
  });

  it("rejects zero hours and unknown kind", () => {
    expect(hourBankEntrySchema.safeParse({ ...base, hours: 0 }).success).toBe(
      false,
    );
    expect(
      hourBankEntrySchema.safeParse({ ...base, kind: "HOLIDAY", hours: 2 })
        .success,
    ).toBe(false);
  });
});

describe("pjInfoSchema", () => {
  const base = { consultantId: CONSULTANT_ID };

  it("defaults autoRenew=false and issuesInvoice=true", () => {
    const parsed = pjInfoSchema.parse(base);
    expect(parsed.autoRenew).toBe(false);
    expect(parsed.issuesInvoice).toBe(true);
  });

  it("coerces issRate and contractTermMonths and validates ranges", () => {
    const parsed = pjInfoSchema.parse({
      ...base,
      issRate: "5",
      contractTermMonths: "12",
      invoiceType: "NFSE",
    });
    expect(parsed.issRate).toBe(5);
    expect(parsed.contractTermMonths).toBe(12);
    expect(pjInfoSchema.safeParse({ ...base, issRate: 150 }).success).toBe(false);
    expect(
      pjInfoSchema.safeParse({ ...base, invoiceType: "BOLETO" }).success,
    ).toBe(false);
  });
});

describe("legalRepresentativeSchema", () => {
  it("accepts a valid representative and rejects a bad e-mail", () => {
    expect(
      legalRepresentativeSchema.safeParse({
        consultantId: CONSULTANT_ID,
        name: "Maria",
        email: "maria@empresa.com",
      }).success,
    ).toBe(true);
    expect(
      legalRepresentativeSchema.safeParse({
        consultantId: CONSULTANT_ID,
        email: "nope",
      }).success,
    ).toBe(false);
  });
});

describe("consultantDocumentUploadSchema", () => {
  it("accepts a valid consultant id + document type", () => {
    expect(
      consultantDocumentUploadSchema.safeParse({
        consultantId: CONSULTANT_ID,
        type: "PROOF_OF_ADDRESS",
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown document type", () => {
    expect(
      consultantDocumentUploadSchema.safeParse({
        consultantId: CONSULTANT_ID,
        type: "PASSPORT",
      }).success,
    ).toBe(false);
  });
});
