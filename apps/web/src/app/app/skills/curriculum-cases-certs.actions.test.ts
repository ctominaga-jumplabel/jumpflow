import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Importação de currículo por IA — CERTIFICADOS e CASES.
 *
 * Governança (docs/agentes.md — Skills Intelligence): a IA só PROPÕE. Aqui
 * provamos o outro lado, a aplicação já confirmada por um humano:
 *  - certificado nasce PENDING (nunca VALIDATED direto do PDF);
 *  - case nasce candidato (DRAFT_INSIGHT/PENDING, aiGenerated) — um currículo
 *    nunca estabelece consentimento do cliente;
 *  - reimportar o mesmo currículo NÃO duplica certificado/case;
 *  - escopo de dono: grava sempre no consultor do usuário logado;
 *  - leitura própria devolve os registros COM status de curadoria;
 *  - remoção só é permitida enquanto o item é candidato.
 *
 * Mock de Prisma em memória, no padrão dos demais testes de action.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

interface CertRec {
  id: string;
  consultantId: string;
  name: string;
  issuer: string;
  issuedAt: Date;
  expiresAt: Date | null;
  credentialId: string | null;
  credentialUrl: string | null;
  status: string;
}

interface CaseRec {
  id: string;
  consultantId: string | null;
  title: string;
  summary: string | null;
  outcome: string | null;
  sourceQuote: string | null;
  aiGenerated: boolean;
  stage: string;
  status: string;
  createdAt: Date;
}

const h = vi.hoisted(() => {
  const store = {
    certificates: [] as CertRec[],
    cases: [] as CaseRec[],
    audits: [] as Record<string, unknown>[],
    resolvedConsultant: { id: "con-mine", userId: "user-1" } as {
      id: string;
      userId: string | null;
    } | null,
    seq: 0,
  };

  /** Igualdade case-insensitive do filtro `{ equals, mode: "insensitive" }`. */
  const matches = (value: string, filter: unknown) => {
    if (typeof filter === "string") return value === filter;
    const f = filter as { equals?: string; mode?: string };
    if (typeof f?.equals !== "string") return true;
    return f.mode === "insensitive"
      ? value.toLowerCase() === f.equals.toLowerCase()
      : value === f.equals;
  };

  const prismaMock = {
    consultant: { update: async () => ({}) },
    consultantExperience: { create: async () => ({}) },
    skill: { findMany: async () => [], findUnique: async () => null },
    consultantSkill: { findUnique: async () => null, upsert: async () => ({}) },
    skillSuggestion: { upsert: async () => ({}) },
    certificate: {
      findMany: async ({ where }: { where: Where }) =>
        store.certificates
          .filter((row) => row.consultantId === where.consultantId)
          .map((row) => ({ ...row })),
      findFirst: async ({ where }: { where: Where }) =>
        store.certificates.find(
          (row) =>
            row.consultantId === where.consultantId &&
            matches(row.name, where.name) &&
            matches(row.issuer, where.issuer),
        ) ?? null,
      findUnique: async ({ where }: { where: Where }) =>
        store.certificates.find((row) => row.id === where.id) ?? null,
      create: async ({ data }: { data: Where }) => {
        const row = { id: `cert-${++store.seq}`, ...data } as CertRec;
        store.certificates.push(row);
        return { ...row };
      },
      delete: async ({ where }: { where: Where }) => {
        store.certificates = store.certificates.filter(
          (row) => row.id !== where.id,
        );
        return {};
      },
    },
    case: {
      findMany: async ({ where }: { where: Where }) =>
        store.cases
          .filter((row) => row.consultantId === where.consultantId)
          .map((row) => ({ ...row })),
      findFirst: async ({ where }: { where: Where }) =>
        store.cases.find(
          (row) =>
            row.consultantId === where.consultantId &&
            matches(row.title, where.title),
        ) ?? null,
      findUnique: async ({ where }: { where: Where }) =>
        store.cases.find((row) => row.id === where.id) ?? null,
      create: async ({ data }: { data: Where }) => {
        const row = {
          id: `case-${++store.seq}`,
          createdAt: new Date(),
          ...data,
        } as CaseRec;
        store.cases.push(row);
        return { ...row };
      },
      delete: async ({ where }: { where: Where }) => {
        store.cases = store.cases.filter((row) => row.id !== where.id);
        return {};
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.audits.push(data);
        return { id: `audit-${++store.seq}` };
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prismaMock),
  };

  return { store, prismaMock };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code = "";
    },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Matriz de permissões: libera tudo por padrão; cada teste nega códigos em
// `perm.denied` para provar a recusa da subtela.
const perm = vi.hoisted(() => ({ denied: new Set<string>() }));
vi.mock("@/lib/auth/permissions", () => ({
  can: vi.fn(async (code: string) => !perm.denied.has(code)),
  canEach: vi.fn(async (codes: string[]) =>
    Object.fromEntries(codes.map((code) => [code, !perm.denied.has(code)])),
  ),
}));
vi.mock("@/lib/db/config", () => ({ isDatabaseConfigured: () => true }));
vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => ({
    id: "user-1",
    name: "Bia Souza",
    email: "bia@jumplabel.com.br",
    roles: ["CONSULTANT"],
  })),
  requireRole: vi.fn(),
}));
vi.mock("@/lib/db/timesheet", () => ({
  getConsultantForUser: vi.fn(async () => h.store.resolvedConsultant),
}));
vi.mock("@/lib/db/users", () => ({
  resolveDbUser: vi.fn(async () => ({ id: "user-1" })),
}));
vi.mock("@/lib/db/audit", () => ({
  buildAuditEventData: (data: Record<string, unknown>) => data,
}));
vi.mock("@/lib/consultants/curriculum", () => ({
  buildConsultantCurriculum: vi.fn(async () => null),
}));

import {
  applyCurriculumImport,
  deleteMyCase,
  deleteMyCertificate,
  loadMyCases,
  loadMyCertificates,
} from "./actions";

const CERT = {
  name: "AWS Solutions Architect",
  issuer: "Amazon Web Services",
  issuedAt: "2025-03-10",
  expiresAt: "2028-03-10",
  credentialId: "ABC-123",
  credentialUrl: "https://verify.example.com/abc",
};
const CASE = {
  title: "Migracao de data warehouse",
  summary: "Migrou o DW para nuvem.",
  outcome: "Custo mensal reduzido.",
  evidence: "Liderou a migracao do DW",
};

beforeEach(() => {
  h.store.certificates = [];
  h.store.cases = [];
  h.store.audits = [];
  h.store.resolvedConsultant = { id: "con-mine", userId: "user-1" };
  h.store.seq = 0;
  vi.clearAllMocks();
});

describe("applyCurriculumImport — certificados", () => {
  it("grava o certificado como PENDING no consultor do usuario logado", async () => {
    const result = await applyCurriculumImport({ certificates: [CERT] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.certificates).toBe(1);

    expect(h.store.certificates).toHaveLength(1);
    const row = h.store.certificates[0];
    // NUNCA validado direto do PDF: a validacao e humana.
    expect(row.status).toBe("PENDING");
    expect(row.consultantId).toBe("con-mine");
    expect(row.name).toBe(CERT.name);
    expect(row.issuer).toBe(CERT.issuer);
    expect(row.issuedAt.toISOString()).toBe("2025-03-10T00:00:00.000Z");
    expect(row.expiresAt?.toISOString()).toBe("2028-03-10T00:00:00.000Z");
    expect(row.credentialUrl).toBe(CERT.credentialUrl);
  });

  it("nao duplica o mesmo certificado ao reimportar o curriculo", async () => {
    await applyCurriculumImport({ certificates: [CERT] });
    const again = await applyCurriculumImport({
      // Mesmo certificado com caixa diferente — ainda e o mesmo registro.
      certificates: [{ ...CERT, name: CERT.name.toUpperCase() }],
    });
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.data.certificates).toBe(0);
    expect(h.store.certificates).toHaveLength(1);
  });

  it("descarta credentialUrl com esquema perigoso", async () => {
    await applyCurriculumImport({
      certificates: [{ ...CERT, credentialUrl: "javascript:alert(1)" }],
    });
    expect(h.store.certificates[0].credentialUrl).toBeNull();
  });

  it("rejeita certificado sem data de emissao valida", async () => {
    const result = await applyCurriculumImport({
      certificates: [{ ...CERT, issuedAt: "2025" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INVALID_INPUT");
    expect(h.store.certificates).toHaveLength(0);
  });
});

describe("applyCurriculumImport — cases", () => {
  it("grava o case como candidato de curadoria, marcado como sugerido por IA", async () => {
    const result = await applyCurriculumImport({ cases: [CASE] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.cases).toBe(1);

    const row = h.store.cases[0];
    expect(row.consultantId).toBe("con-mine");
    expect(row.stage).toBe("DRAFT_INSIGHT");
    expect(row.status).toBe("PENDING");
    expect(row.aiGenerated).toBe(true);
    // A evidencia do CV vira a citacao de origem do case.
    expect(row.sourceQuote).toBe(CASE.evidence);
    expect(row.outcome).toBe(CASE.outcome);
  });

  it("nao duplica o mesmo case ao reimportar o curriculo", async () => {
    await applyCurriculumImport({ cases: [CASE] });
    const again = await applyCurriculumImport({ cases: [CASE] });
    if (again.ok) expect(again.data.cases).toBe(0);
    expect(h.store.cases).toHaveLength(1);
  });

  it("audita as contagens aplicadas sem conteudo bruto do curriculo", async () => {
    await applyCurriculumImport({ certificates: [CERT], cases: [CASE] });
    const audit = h.store.audits.at(-1) as Record<string, unknown>;
    expect(audit.action).toBe("CONSULTANT_CURRICULUM_IMPORT_APPLIED");
    expect(audit.after).toMatchObject({ certificates: 1, cases: 1 });
    expect(JSON.stringify(audit)).not.toContain(CASE.evidence);
  });

  it("rejeita a aplicacao quando o usuario nao tem consultor vinculado", async () => {
    h.store.resolvedConsultant = null;
    const result = await applyCurriculumImport({
      certificates: [CERT],
      cases: [CASE],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NO_CONSULTANT");
    expect(h.store.certificates).toHaveLength(0);
    expect(h.store.cases).toHaveLength(0);
  });
});

describe("leitura propria de certificados e cases", () => {
  it("devolve os registros do dono com o status de curadoria", async () => {
    await applyCurriculumImport({ certificates: [CERT], cases: [CASE] });

    const certs = await loadMyCertificates();
    expect(certs.ok).toBe(true);
    if (certs.ok) {
      expect(certs.data).toHaveLength(1);
      expect(certs.data[0].status).toBe("PENDING");
      // Data serializada como YYYY-MM-DD para a tela.
      expect(certs.data[0].issuedAt).toBe("2025-03-10");
    }

    const cases = await loadMyCases();
    expect(cases.ok).toBe(true);
    if (cases.ok) {
      expect(cases.data).toHaveLength(1);
      expect(cases.data[0].status).toBe("PENDING");
      expect(cases.data[0].aiGenerated).toBe(true);
    }
  });

  it("nao devolve registros de outro consultor", async () => {
    h.store.certificates.push({
      id: "cert-alheio",
      consultantId: "con-other",
      name: "Cert alheio",
      issuer: "Outro",
      issuedAt: new Date("2025-01-01T00:00:00.000Z"),
      expiresAt: null,
      credentialId: null,
      credentialUrl: null,
      status: "VALIDATED",
    });
    const certs = await loadMyCertificates();
    if (certs.ok) expect(certs.data).toHaveLength(0);
  });
});

describe("remocao pelo dono", () => {
  it("remove um certificado proprio ainda PENDING e audita", async () => {
    await applyCurriculumImport({ certificates: [CERT] });
    const id = h.store.certificates[0].id;
    const result = await deleteMyCertificate({ id });
    expect(result.ok).toBe(true);
    expect(h.store.certificates).toHaveLength(0);
    expect(h.store.audits.at(-1)).toMatchObject({
      action: "CONSULTANT_CERTIFICATE_SELF_DELETED",
    });
  });

  it("recusa remover certificado ja validado", async () => {
    await applyCurriculumImport({ certificates: [CERT] });
    h.store.certificates[0].status = "VALIDATED";
    const result = await deleteMyCertificate({
      id: h.store.certificates[0].id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("FORBIDDEN");
    expect(h.store.certificates).toHaveLength(1);
  });

  it("responde NOT_FOUND para certificado de outra pessoa (nao revela a linha)", async () => {
    h.store.certificates.push({
      id: "cert-alheio",
      consultantId: "con-other",
      name: "Cert alheio",
      issuer: "Outro",
      issuedAt: new Date("2025-01-01T00:00:00.000Z"),
      expiresAt: null,
      credentialId: null,
      credentialUrl: null,
      status: "PENDING",
    });
    const result = await deleteMyCertificate({ id: "cert-alheio" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");
    expect(h.store.certificates).toHaveLength(1);
  });

  it("remove um case proprio ainda candidato e recusa um ja aceito", async () => {
    await applyCurriculumImport({ cases: [CASE] });
    const id = h.store.cases[0].id;

    h.store.cases[0].status = "ACCEPTED";
    const blocked = await deleteMyCase({ id });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toBe("FORBIDDEN");

    h.store.cases[0].status = "PENDING";
    const removed = await deleteMyCase({ id });
    expect(removed.ok).toBe(true);
    expect(h.store.cases).toHaveLength(0);
  });
});
