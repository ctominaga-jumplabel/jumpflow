import { beforeEach, describe, expect, it, vi } from "vitest";

/** Impressão do próprio currículo: serve só a aba "Meu Currículo". */

const h = vi.hoisted(() => ({
  allowed: true,
  getConsultantForUser: vi.fn(async () => ({ id: "con-mine" })),
  buildConsultantCurriculum: vi.fn(async () => ({ consultantId: "con-mine" })),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => ({ id: "u", roles: ["CONSULTANT"] })),
}));
vi.mock("@/lib/auth/permissions", () => ({
  can: vi.fn(async () => h.allowed),
}));
vi.mock("@/lib/db/config", () => ({ isDatabaseConfigured: () => true }));
vi.mock("@/lib/db/timesheet", () => ({
  getConsultantForUser: h.getConsultantForUser,
}));
vi.mock("@/lib/consultants/curriculum", () => ({
  buildConsultantCurriculum: h.buildConsultantCurriculum,
}));
vi.mock("@/lib/consultants/curriculum-html", () => ({
  renderCurriculumHtml: () => "<html>cv</html>",
}));

import { GET } from "./route";

beforeEach(() => {
  h.allowed = true;
  h.getConsultantForUser.mockClear();
  h.buildConsultantCurriculum.mockClear();
});

describe("GET /app/skills/curriculo/print — subtela da matriz", () => {
  it("concedida: devolve o HTML do próprio currículo", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("cv");
  });

  it("negada: 403 sem carregar o currículo", async () => {
    h.allowed = false;
    const res = await GET();
    expect(res.status).toBe(403);
    expect(h.getConsultantForUser).not.toHaveBeenCalled();
    expect(h.buildConsultantCurriculum).not.toHaveBeenCalled();
  });
});
