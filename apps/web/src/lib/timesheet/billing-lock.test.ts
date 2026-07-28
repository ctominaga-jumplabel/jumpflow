import { describe, expect, it, vi } from "vitest";

import {
  closingCompetenceKey,
  entryCompetenceKey,
} from "@/lib/financial/receivables-journey-core";
import { ActionError } from "@/lib/timesheet/action-error";

import {
  BILLING_RELEASED_MESSAGE,
  assertCompetenceBillingOpen,
  isCompetenceBillingReleased,
  listBillingLockedCompetenceKeys,
} from "./billing-lock";

/**
 * Testes da Trava A (docs/proposta-cockpit-gestor-area §4.1). NÃO tocam banco
 * real: um FAKE do client Prisma expõe apenas `revenueClosing.findMany`,
 * aplicando fielmente o `where` que a produção monta (filtro por `projectId` e
 * por `status ∈ {CLOSED, INVOICED}`). Assim o teste valida tanto o cruzamento de
 * competência (chave mês/ano) quanto a INTENÇÃO da produção de só considerar
 * fechamentos bloqueantes.
 */

interface RcRow {
  projectId: string | null;
  status: string;
  month: number;
  year: number;
}

type Db = Parameters<typeof isCompetenceBillingReleased>[0];

/**
 * Fake do client Prisma. `findMany` honra o `where` real da produção:
 * - `projectId` pode ser string ou `{ in: string[] }` (linhas com projectId
 *   null nunca casam um projectId concreto — igual ao Postgres);
 * - `status.in` restringe aos status pedidos pela produção.
 * Retorna apenas os campos do `select` (projectId, month, year).
 */
function makeDb(rows: RcRow[]) {
  const findMany = vi.fn(
    async (args: {
      where?: {
        projectId?: string | { in: string[] };
        status?: { in: string[] };
      };
    }) => {
      const where = args?.where ?? {};
      return rows
        .filter((r) => {
          const pid = where.projectId;
          if (pid !== undefined) {
            if (typeof pid === "object") {
              if (r.projectId === null || !pid.in.includes(r.projectId)) {
                return false;
              }
            } else if (r.projectId !== pid) {
              return false;
            }
          }
          if (where.status?.in && !where.status.in.includes(r.status)) {
            return false;
          }
          return true;
        })
        .map((r) => ({ projectId: r.projectId, month: r.month, year: r.year }));
    },
  );
  const db = { revenueClosing: { findMany } } as unknown as Db;
  return { db, findMany };
}

/** Data ISO date-only (meia-noite UTC) para uma competência. */
function dateOf(year: number, month: number, day = 15): Date {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return new Date(`${year}-${mm}-${dd}T00:00:00.000Z`);
}

const PROJECT = "proj-alpha";
const JUL = dateOf(2026, 7);

describe("isCompetenceBillingReleased", () => {
  it("CLOSED na mesma competência bloqueia", async () => {
    const { db } = makeDb([
      { projectId: PROJECT, status: "CLOSED", month: 7, year: 2026 },
    ]);
    expect(await isCompetenceBillingReleased(db, PROJECT, JUL)).toBe(true);
  });

  it("INVOICED na mesma competência bloqueia (imutável)", async () => {
    const { db } = makeDb([
      { projectId: PROJECT, status: "INVOICED", month: 7, year: 2026 },
    ]);
    expect(await isCompetenceBillingReleased(db, PROJECT, JUL)).toBe(true);
  });

  it.each(["OPEN", "IN_REVIEW", "READY_TO_CLOSE", "CANCELLED"])(
    "status %s NÃO bloqueia (fora de {CLOSED, INVOICED})",
    async (status) => {
      const { db } = makeDb([
        { projectId: PROJECT, status, month: 7, year: 2026 },
      ]);
      expect(await isCompetenceBillingReleased(db, PROJECT, JUL)).toBe(false);
    },
  );

  it("projeto sem nenhum fechamento fica livre", async () => {
    const { db } = makeDb([]);
    expect(await isCompetenceBillingReleased(db, PROJECT, JUL)).toBe(false);
  });

  it("CLOSED em OUTRA competência (mês) não bloqueia a competência do lançamento", async () => {
    const { db } = makeDb([
      { projectId: PROJECT, status: "CLOSED", month: 6, year: 2026 },
    ]);
    // Lançamento em julho, fechamento de junho → chaves diferentes.
    expect(await isCompetenceBillingReleased(db, PROJECT, JUL)).toBe(false);
  });

  it("CLOSED em OUTRO ano não bloqueia", async () => {
    const { db } = makeDb([
      { projectId: PROJECT, status: "CLOSED", month: 7, year: 2025 },
    ]);
    expect(await isCompetenceBillingReleased(db, PROJECT, JUL)).toBe(false);
  });

  it("CLOSED de OUTRO projeto não bloqueia este projeto", async () => {
    const { db } = makeDb([
      { projectId: "proj-beta", status: "CLOSED", month: 7, year: 2026 },
    ]);
    expect(await isCompetenceBillingReleased(db, PROJECT, JUL)).toBe(false);
  });

  it("dentre vários fechamentos, casa a competência certa", async () => {
    const { db } = makeDb([
      { projectId: PROJECT, status: "CANCELLED", month: 7, year: 2026 },
      { projectId: PROJECT, status: "CLOSED", month: 6, year: 2026 },
      { projectId: PROJECT, status: "INVOICED", month: 7, year: 2026 },
    ]);
    // O INVOICED de julho é o que casa a competência do lançamento.
    expect(await isCompetenceBillingReleased(db, PROJECT, JUL)).toBe(true);
  });

  it("borda de mês: lançamento no dia 01 casa a competência do próprio mês (UTC)", async () => {
    const { db } = makeDb([
      { projectId: PROJECT, status: "CLOSED", month: 7, year: 2026 },
    ]);
    expect(
      await isCompetenceBillingReleased(db, PROJECT, dateOf(2026, 7, 1)),
    ).toBe(true);
  });
});

describe("assertCompetenceBillingOpen", () => {
  it("lança ActionError('BILLING_RELEASED') quando bloqueado", async () => {
    const { db } = makeDb([
      { projectId: PROJECT, status: "CLOSED", month: 7, year: 2026 },
    ]);
    await expect(
      assertCompetenceBillingOpen(db, PROJECT, JUL),
    ).rejects.toBeInstanceOf(ActionError);
    await expect(
      assertCompetenceBillingOpen(db, PROJECT, JUL),
    ).rejects.toMatchObject({
      code: "BILLING_RELEASED",
      message: BILLING_RELEASED_MESSAGE,
    });
  });

  it("resolve sem lançar quando a competência está aberta", async () => {
    const { db } = makeDb([
      { projectId: PROJECT, status: "OPEN", month: 7, year: 2026 },
    ]);
    await expect(
      assertCompetenceBillingOpen(db, PROJECT, JUL),
    ).resolves.toBeUndefined();
  });
});

describe("listBillingLockedCompetenceKeys", () => {
  it("retorna [] e NÃO consulta quando não há projetos", async () => {
    const { db, findMany } = makeDb([
      { projectId: PROJECT, status: "CLOSED", month: 7, year: 2026 },
    ]);
    expect(await listBillingLockedCompetenceKeys(db, [])).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("deduplica os projectIds na consulta", async () => {
    const { db, findMany } = makeDb([]);
    await listBillingLockedCompetenceKeys(db, [PROJECT, PROJECT, "proj-beta"]);
    const arg = findMany.mock.calls[0][0] as {
      where: { projectId: { in: string[] } };
    };
    expect(arg.where.projectId.in).toEqual([PROJECT, "proj-beta"]);
  });

  it("devolve chaves de competência CLOSED/INVOICED de múltiplos projetos", async () => {
    const { db } = makeDb([
      { projectId: PROJECT, status: "CLOSED", month: 7, year: 2026 },
      { projectId: "proj-beta", status: "INVOICED", month: 6, year: 2026 },
    ]);
    const keys = await listBillingLockedCompetenceKeys(db, [PROJECT, "proj-beta"]);
    expect(new Set(keys)).toEqual(
      new Set([
        closingCompetenceKey(PROJECT, 7, 2026),
        closingCompetenceKey("proj-beta", 6, 2026),
      ]),
    );
  });

  it("exclui status não-bloqueantes (OPEN/CANCELLED)", async () => {
    const { db } = makeDb([
      { projectId: PROJECT, status: "OPEN", month: 7, year: 2026 },
      { projectId: PROJECT, status: "CANCELLED", month: 8, year: 2026 },
      { projectId: PROJECT, status: "CLOSED", month: 9, year: 2026 },
    ]);
    const keys = await listBillingLockedCompetenceKeys(db, [PROJECT]);
    expect(keys).toEqual([closingCompetenceKey(PROJECT, 9, 2026)]);
  });

  it("chave gerada casa a chave de um lançamento na mesma competência", async () => {
    const { db } = makeDb([
      { projectId: PROJECT, status: "CLOSED", month: 7, year: 2026 },
    ]);
    const keys = await listBillingLockedCompetenceKeys(db, [PROJECT]);
    // O client cruza (projeto, competência) do lançamento contra o Set.
    expect(new Set(keys).has(entryCompetenceKey(PROJECT, "2026-07-20"))).toBe(
      true,
    );
  });
});
