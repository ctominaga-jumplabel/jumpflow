import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-action tests for consultant document attachments. Stateful in-memory
 * Prisma mock + fake storage provider, mirroring actions.test.ts. Asserts the
 * "one attachment per type" rule (replace + old-object cleanup), that OTHER may
 * repeat, deletion, and honest NO_STORAGE degradation.
 */

interface DocRec {
  id: string;
  consultantId: string;
  type: string;
  fileName: string;
  contentType: string;
  size: number;
  storageBucket: string;
  storageKey: string;
  uploadedByUserId: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

const h = vi.hoisted(() => {
  const store = {
    consultants: ["seed-consultant-1"],
    docs: [] as DocRec[],
    audits: [] as Record<string, unknown>[],
    uploaded: [] as string[],
    deleted: [] as string[],
    storageConfigured: true,
    seq: 0,
  };
  const nextId = (prefix: string) => `${prefix}-${++store.seq}`;

  const prismaMock = {
    consultant: {
      findUnique: async ({ where }: { where: Where }) =>
        store.consultants.includes(where.id) ? { id: where.id } : null,
    },
    consultantDocument: {
      findFirst: async ({ where, orderBy }: { where: Where; orderBy?: Where }) => {
        let rows = store.docs.filter(
          (d) => d.consultantId === where.consultantId && d.type === where.type,
        );
        if (orderBy) rows = [...rows].reverse();
        return rows[0] ? { ...rows[0] } : null;
      },
      findUnique: async ({ where }: { where: Where }) => {
        const doc = store.docs.find((d) => d.id === where.id);
        return doc ? { ...doc } : null;
      },
      create: async ({ data }: { data: Where }) => {
        const doc: DocRec = {
          id: nextId("doc"),
          consultantId: data.consultantId,
          type: data.type,
          fileName: data.fileName,
          contentType: data.contentType,
          size: data.size,
          storageBucket: data.storageBucket,
          storageKey: data.storageKey,
          uploadedByUserId: data.uploadedByUserId ?? null,
        };
        store.docs.push(doc);
        return { ...doc };
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        const doc = store.docs.find((d) => d.id === where.id)!;
        Object.assign(doc, data);
        return { ...doc };
      },
      delete: async ({ where }: { where: Where }) => {
        const index = store.docs.findIndex((d) => d.id === where.id);
        const [removed] = store.docs.splice(index, 1);
        return removed;
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.audits.push(data);
        return data;
      },
    },
  };

  const provider = {
    upload: async (key: string) => {
      store.uploaded.push(key);
    },
    delete: async (key: string) => {
      store.deleted.push(key);
    },
    getSignedUrl: async (key: string) => `https://signed/${key}`,
  };

  return { store, prismaMock, provider };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(message: string, opts: { code: string }) {
        super(message);
        this.code = opts.code;
      }
    },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => ({ id: "dev-user", roles: ["ADMIN"] })),
  requireRole: vi.fn(async () => ({ id: "dev-user", roles: ["ADMIN"] })),
}));

vi.mock("@/lib/db/users", () => ({
  resolveDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/storage/provider", () => ({
  CONSULTANT_DOCUMENTS_BUCKET: "consultant-documents",
  isStorageConfigured: () => h.store.storageConfigured,
  getConsultantDocumentStorageProvider: () =>
    h.store.storageConfigured ? h.provider : null,
}));

import {
  deleteConsultantDocument,
  uploadConsultantDocument,
} from "./actions";

const CONSULTANT_ID = "seed-consultant-1";

function pdf(name = "doc.pdf"): File {
  return new File([new Uint8Array([1, 2, 3])], name, {
    type: "application/pdf",
  });
}

function formData(type: string, file: File): FormData {
  const fd = new FormData();
  fd.set("consultantId", CONSULTANT_ID);
  fd.set("type", type);
  fd.set("file", file);
  return fd;
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.seq = 0;
  h.store.docs = [];
  h.store.audits = [];
  h.store.uploaded = [];
  h.store.deleted = [];
  h.store.storageConfigured = true;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("uploadConsultantDocument", () => {
  it("creates a document for a new type", async () => {
    const result = await uploadConsultantDocument(formData("RG", pdf()));
    expect(result.ok).toBe(true);
    expect(h.store.docs).toHaveLength(1);
    expect(h.store.docs[0].type).toBe("RG");
    expect(h.store.uploaded).toHaveLength(1);
    expect(
      h.store.audits.some((a) => a.action === "CONSULTANT_DOCUMENT_ADDED"),
    ).toBe(true);
  });

  it("replaces the existing document of the same type and removes the old object", async () => {
    await uploadConsultantDocument(formData("RG", pdf("old.pdf")));
    const firstKey = h.store.docs[0].storageKey;
    const result = await uploadConsultantDocument(formData("RG", pdf("new.pdf")));
    expect(result.ok).toBe(true);
    // Still a single RG row, now pointing at the new file.
    expect(h.store.docs.filter((d) => d.type === "RG")).toHaveLength(1);
    expect(h.store.docs[0].fileName).toBe("new.pdf");
    // Old object cleaned up only after persisting the new metadata.
    expect(h.store.deleted).toContain(firstKey);
    expect(
      h.store.audits.some((a) => a.action === "CONSULTANT_DOCUMENT_REPLACED"),
    ).toBe(true);
  });

  it("allows multiple OTHER documents (no replace)", async () => {
    await uploadConsultantDocument(formData("OTHER", pdf("a.pdf")));
    await uploadConsultantDocument(formData("OTHER", pdf("b.pdf")));
    expect(h.store.docs.filter((d) => d.type === "OTHER")).toHaveLength(2);
    expect(h.store.deleted).toHaveLength(0);
  });

  it("rejects a non-whitelisted file type", async () => {
    const exe = new File([new Uint8Array([1])], "malware.exe", {
      type: "application/x-msdownload",
    });
    const result = await uploadConsultantDocument(formData("RG", exe));
    expect(result).toMatchObject({ ok: false, error: "INVALID_FILE" });
    expect(h.store.docs).toHaveLength(0);
    expect(h.store.uploaded).toHaveLength(0);
  });

  it("fails closed with NO_STORAGE when storage is not configured", async () => {
    h.store.storageConfigured = false;
    const result = await uploadConsultantDocument(formData("RG", pdf()));
    expect(result).toMatchObject({ ok: false, error: "NO_STORAGE" });
    expect(h.store.docs).toHaveLength(0);
  });
});

describe("deleteConsultantDocument", () => {
  it("removes the metadata row and the storage object", async () => {
    await uploadConsultantDocument(formData("RG", pdf()));
    const { id, storageKey } = h.store.docs[0];
    const result = await deleteConsultantDocument({ documentId: id });
    expect(result.ok).toBe(true);
    expect(h.store.docs).toHaveLength(0);
    expect(h.store.deleted).toContain(storageKey);
    expect(
      h.store.audits.some((a) => a.action === "CONSULTANT_DOCUMENT_DELETED"),
    ).toBe(true);
  });
});
