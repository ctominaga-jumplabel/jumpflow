import { describe, expect, it, vi } from "vitest";

const past = new Date(Date.UTC(2020, 0, 1));

vi.mock("@jumpflow/database", () => ({
  prisma: {
    project: {
      findMany: async () => [
        {
          id: "prj-1",
          name: "Alpha",
          client: { name: "Acme" },
          saleRates: [
            {
              id: "sr-1",
              projectId: "prj-1",
              consultantId: "c1",
              allocationId: "a1",
              startsAt: past,
              endsAt: null,
              hourlyRate: 100,
            },
          ],
          allocations: [
            {
              id: "a1",
              role: "Dev",
              allocationPercent: 100,
              consultantId: "c1",
              consultant: { name: "Bia" },
              costRates: [
                { startsAt: past, endsAt: null, hourlyCostEncrypted: "60.00" },
              ],
            },
          ],
        },
      ],
    },
  },
}));

import { listProjectMargins } from "@/lib/db/margin";

describe("listProjectMargins — custo do consultor (grupo Dados Sensíveis)", () => {
  it("fora do grupo, a linha não traz custo/h, custo nem margem", async () => {
    const [project] = await listProjectMargins();
    expect(project.allocations[0]).toMatchObject({
      saleRate: 100,
      costRate: null,
      cost: null,
      margin: null,
      marginPct: null,
      hasCost: true,
    });
  });

  it("para o grupo, a linha traz o custo/h decifrado", async () => {
    const [project] = await listProjectMargins({ includeCostDetail: true });
    expect(project.allocations[0].costRate).toBe(60);
  });
});
