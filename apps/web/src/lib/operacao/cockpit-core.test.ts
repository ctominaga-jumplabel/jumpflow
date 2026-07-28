import { describe, expect, it } from "vitest";

import {
  businessDaysOfMonth,
  classifyProjectPhase,
  computeConsultantMetrics,
  isWeekend,
} from "./cockpit-core";

/**
 * Testes mínimos do núcleo puro (a Fase 5 amplia). Competência fixa: julho/2026
 * — 1º = quarta-feira; 31 dias; 23 dias úteis (sem feriados).
 */
const JUL_2026 = { month: 7, year: 2026 } as const;
// Fevereiro/2026 — 1º = domingo; 28 dias (2026 não é bissexto); 20 dias úteis;
// 28/02 cai num sábado. Usado para cobrir "mês inteiro" e mês com 28 dias.
const FEV_2026 = { month: 2, year: 2026 } as const;

describe("isWeekend", () => {
  it("marca sábado e domingo (UTC)", () => {
    expect(isWeekend("2026-07-04")).toBe(true); // sábado
    expect(isWeekend("2026-07-05")).toBe(true); // domingo
    expect(isWeekend("2026-07-06")).toBe(false); // segunda
  });

  it("cobre a semana inteira de dias úteis (ter–sex)", () => {
    expect(isWeekend("2026-07-07")).toBe(false); // terça
    expect(isWeekend("2026-07-08")).toBe(false); // quarta
    expect(isWeekend("2026-07-09")).toBe(false); // quinta
    expect(isWeekend("2026-07-10")).toBe(false); // sexta
  });

  it("independe do fuso (avaliação em UTC na virada do mês)", () => {
    expect(isWeekend("2026-07-01")).toBe(false); // quarta
    expect(isWeekend("2026-07-31")).toBe(false); // sexta
  });
});

describe("businessDaysOfMonth", () => {
  it("exclui fins de semana", () => {
    expect(businessDaysOfMonth(JUL_2026, new Set())).toHaveLength(23);
  });

  it("exclui também os feriados aplicáveis", () => {
    // 2026-07-09 (Revolução Constitucionalista, quinta) como feriado.
    const days = businessDaysOfMonth(JUL_2026, new Set(["2026-07-09"]));
    expect(days).toHaveLength(22);
    expect(days).not.toContain("2026-07-09");
  });

  it("um feriado que cai no fim de semana não conta em dobro", () => {
    // 2026-07-04 é sábado: já excluído por ser fim de semana. Marcá-lo como
    // feriado NÃO pode subtrair um dia útil adicional (nada a descontar).
    const days = businessDaysOfMonth(JUL_2026, new Set(["2026-07-04"]));
    expect(days).toHaveLength(23);
    expect(days).not.toContain("2026-07-04");
  });

  it("desconta múltiplos feriados em dias úteis e ignora feriado fora do mês", () => {
    const days = businessDaysOfMonth(
      JUL_2026,
      new Set(["2026-07-09", "2026-07-10", "2026-08-01"]), // 08/01 é de outro mês
    );
    expect(days).toHaveLength(21); // 23 − 2 feriados úteis do mês
    expect(days).not.toContain("2026-07-09");
    expect(days).not.toContain("2026-07-10");
  });

  it("mês inteiro: só dias úteis, em ordem crescente, primeiro e último", () => {
    const days = businessDaysOfMonth(JUL_2026, new Set());
    expect(days[0]).toBe("2026-07-01"); // quarta
    expect(days.at(-1)).toBe("2026-07-31"); // sexta
    // Sem sábados/domingos e estritamente crescente.
    expect(days.some((iso) => isWeekend(iso))).toBe(false);
    const sorted = [...days].sort();
    expect(days).toEqual(sorted);
    expect(new Set(days).size).toBe(days.length); // sem duplicatas
  });

  it("mês de 28 dias (fev/2026): 20 dias úteis", () => {
    const days = businessDaysOfMonth(FEV_2026, new Set());
    expect(days).toHaveLength(20);
    expect(days[0]).toBe("2026-02-02"); // 01/02 é domingo → 1º útil é segunda
    expect(days.at(-1)).toBe("2026-02-27"); // 28/02 é sábado
    expect(days).not.toContain("2026-02-28");
  });
});

describe("computeConsultantMetrics", () => {
  it("consultor sem nenhum lançamento: todos os dias úteis pendentes de lançamento", () => {
    const metrics = computeConsultantMetrics(JUL_2026, new Set(), []);
    expect(metrics.diasSemLancamento).toBe(23);
    expect(metrics.diasPendentes).toBe(0);
  });

  it("conta dias úteis sem lançamento e dias pendentes (SUBMITTED)", () => {
    const metrics = computeConsultantMetrics(JUL_2026, new Set(), [
      { date: "2026-07-06", status: "APPROVED" },
      { date: "2026-07-07", status: "SUBMITTED" },
      { date: "2026-07-07", status: "SUBMITTED" }, // mesmo dia → 1 dia pendente
      { date: "2026-07-08", status: "DRAFT" },
    ]);
    // 23 úteis − 3 dias com lançamento = 20 sem lançamento.
    expect(metrics.diasSemLancamento).toBe(20);
    expect(metrics.diasPendentes).toBe(1);
  });

  it("qualquer status (inclusive REJECTED) conta como 'lançou' e reduz dias sem lançamento", () => {
    const metrics = computeConsultantMetrics(JUL_2026, new Set(), [
      { date: "2026-07-06", status: "APPROVED" },
      { date: "2026-07-07", status: "REJECTED" },
      { date: "2026-07-08", status: "CLOSED" },
    ]);
    // 3 dias distintos com lançamento (independe do status) → 23 − 3 = 20.
    expect(metrics.diasSemLancamento).toBe(20);
    // Nenhum SUBMITTED → 0 pendentes.
    expect(metrics.diasPendentes).toBe(0);
  });

  it("um mesmo dia com DRAFT + SUBMITTED conta 1 dia pendente e 1 dia lançado", () => {
    const metrics = computeConsultantMetrics(JUL_2026, new Set(), [
      { date: "2026-07-06", status: "DRAFT" },
      { date: "2026-07-06", status: "SUBMITTED" },
    ]);
    expect(metrics.diasSemLancamento).toBe(22); // 23 − 1 dia lançado
    expect(metrics.diasPendentes).toBe(1);
  });

  it("um lançamento em fim de semana não reduz dias úteis sem lançamento", () => {
    const metrics = computeConsultantMetrics(JUL_2026, new Set(), [
      { date: "2026-07-04", status: "APPROVED" }, // sábado
    ]);
    expect(metrics.diasSemLancamento).toBe(23);
    expect(metrics.diasPendentes).toBe(0);
  });

  it("SUBMITTED em fim de semana conta como pendente sem afetar dias sem lançamento", () => {
    const metrics = computeConsultantMetrics(JUL_2026, new Set(), [
      { date: "2026-07-04", status: "SUBMITTED" }, // sábado
    ]);
    // Pendência de aprovação existe em qualquer dia; base útil intacta.
    expect(metrics.diasSemLancamento).toBe(23);
    expect(metrics.diasPendentes).toBe(1);
  });

  it("lançamento em feriado não reduz 'dias sem lançamento' indevidamente, mas conta pendente", () => {
    // Feriado útil (quinta 09/07) → base útil cai para 22. Um SUBMITTED nesse
    // feriado NÃO desconta mais um dia útil (feriado não está na base), mas
    // conta como pendência.
    const metrics = computeConsultantMetrics(JUL_2026, new Set(["2026-07-09"]), [
      { date: "2026-07-09", status: "SUBMITTED" },
    ]);
    expect(metrics.diasSemLancamento).toBe(22);
    expect(metrics.diasPendentes).toBe(1);
  });
});

describe("classifyProjectPhase", () => {
  it("HISTORICO só quando os dois eixos liberam (projeto em andamento)", () => {
    expect(classifyProjectPhase(true, true)).toBe("HISTORICO");
    expect(classifyProjectPhase(true, false)).toBe("ATIVO");
    expect(classifyProjectPhase(false, true)).toBe("ATIVO");
    expect(classifyProjectPhase(false, false)).toBe("ATIVO");
  });

  it("projeto ENCERRADO é sempre HISTORICO, independentemente das liberações", () => {
    expect(classifyProjectPhase(false, false, true)).toBe("HISTORICO");
    expect(classifyProjectPhase(true, false, true)).toBe("HISTORICO");
    expect(classifyProjectPhase(false, true, true)).toBe("HISTORICO");
    expect(classifyProjectPhase(true, true, true)).toBe("HISTORICO");
  });

  it("projectClosed=false mantém a regra dos dois eixos", () => {
    expect(classifyProjectPhase(false, false, false)).toBe("ATIVO");
    expect(classifyProjectPhase(true, true, false)).toBe("HISTORICO");
  });
});
