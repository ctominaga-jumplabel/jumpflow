import { describe, expect, it } from "vitest";
import {
  aggregateCapacity,
  aggregateSkillCoverage,
  applyManualAssignment,
  assignedMembers,
  clearAssignment,
  composeSquad,
  evaluateSlotCandidate,
  seniorityAdherence,
  MAX_SWAP_POPULATION,
  SENIORITY_DELTA,
} from "./engine";
import type {
  CoeAvailabilityRow,
  CoeCandidateInput,
  CoeSlotCandidate,
  CoeSlotInput,
} from "./types";
import type { RequiredSkillInput } from "@/lib/allocation-ai/types";
import type { AvailabilityPeriod } from "@/lib/availability/types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function req(
  skillId: string,
  requiredLevel: RequiredSkillInput["requiredLevel"] = null,
): RequiredSkillInput {
  return { skillId, skillName: skillId, requiredLevel };
}

function slot(over: Partial<CoeSlotInput> = {}): CoeSlotInput {
  return {
    key: "slot-1",
    label: "Frente 1",
    roleName: "Desenvolvedor",
    seniority: null,
    requiredSkills: [],
    saleRate: null,
    sourceProfileId: null,
    ...over,
  };
}

function candidate(over: Partial<CoeCandidateInput> = {}): CoeCandidateInput {
  return {
    consultantId: "c1",
    consultantName: "Consultor",
    seniority: "MID_LEVEL",
    area: null,
    jobTitle: null,
    skills: [],
    availabilityState: null,
    pastAllocationsWithClient: 0,
    hourlyCost: null,
    status: "ACTIVE",
    isCoeMember: true,
    coeFocusArea: null,
    ...over,
  };
}

function period(key: string): AvailabilityPeriod {
  return {
    key,
    shortLabel: key,
    label: key,
    start: key,
    end: key,
  };
}

// ── Aderência de senioridade ────────────────────────────────────────────────

describe("seniorityAdherence", () => {
  it("é neutra quando o slot não exige senioridade", () => {
    expect(seniorityAdherence(null, "SENIOR")).toEqual({
      delta: 0,
      detail: expect.stringContaining("neutro"),
    });
  });

  it("é neutra quando a senioridade não é comparável", () => {
    expect(seniorityAdherence("SENIOR", "DESCONHECIDA").delta).toBe(0);
    expect(seniorityAdherence("DESCONHECIDA", "SENIOR").delta).toBe(0);
  });

  it("premia o encaixe exato", () => {
    expect(seniorityAdherence("SENIOR", "SENIOR").delta).toBe(
      SENIORITY_DELTA.EXACT,
    );
  });

  it("premia menos quem está acima do exigido (custo de oportunidade)", () => {
    const above = seniorityAdherence("JUNIOR", "SENIOR");
    expect(above.delta).toBe(SENIORITY_DELTA.ABOVE);
    expect(above.delta).toBeLessThan(SENIORITY_DELTA.EXACT);
    expect(above.delta).toBeGreaterThan(0);
  });

  it("penaliza progressivamente quem está abaixo", () => {
    expect(seniorityAdherence("SENIOR", "MID_LEVEL").delta).toBe(
      SENIORITY_DELTA.BELOW_ONE,
    );
    expect(seniorityAdherence("SENIOR", "JUNIOR").delta).toBe(
      SENIORITY_DELTA.BELOW_MANY,
    );
  });

  it("trata trilhas paralelas do mesmo degrau como encaixe exato", () => {
    // TECH_LEAD e SPECIALIST compartilham degrau: trocar entre elas não é
    // subir nem descer.
    expect(seniorityAdherence("TECH_LEAD", "SPECIALIST").delta).toBe(
      SENIORITY_DELTA.EXACT,
    );
  });
});

// ── Score por slot ──────────────────────────────────────────────────────────

describe("evaluateSlotCandidate", () => {
  it("expõe o fit e o ajuste de senioridade separadamente", () => {
    const result = evaluateSlotCandidate(
      slot({ seniority: "SENIOR", requiredSkills: [req("react")] }),
      candidate({
        seniority: "SENIOR",
        skills: [{ skillId: "react", level: "ADVANCED" }],
      }),
      false,
    );
    expect(result.seniorityDelta).toBe(SENIORITY_DELTA.EXACT);
    expect(result.slotScore).toBe(result.fit.score + SENIORITY_DELTA.EXACT);
  });

  it("satura o score do slot em 0..100", () => {
    // Fit alto (skills + disponibilidade + histórico) mais o bônus estoura 100.
    const high = evaluateSlotCandidate(
      slot({ seniority: "SENIOR", requiredSkills: [req("react")] }),
      candidate({
        seniority: "SENIOR",
        skills: [{ skillId: "react", level: "SPECIALIST" }],
        availabilityState: "FREE",
        pastAllocationsWithClient: 5,
      }),
      false,
    );
    expect(high.fit.score).toBe(100);
    expect(high.slotScore).toBe(100);

    // Fit zerado com penalidade não vira negativo.
    const low = evaluateSlotCandidate(
      slot({ seniority: "MANAGER", requiredSkills: [req("react")] }),
      candidate({
        seniority: "TRAINEE",
        skills: [],
        availabilityState: "VACATION",
      }),
      false,
    );
    expect(low.slotScore).toBe(0);
  });
});

// ── Composição ──────────────────────────────────────────────────────────────

describe("composeSquad", () => {
  const slots = [
    slot({
      key: "s1",
      label: "Sênior",
      seniority: "SENIOR",
      requiredSkills: [req("react")],
    }),
    slot({
      key: "s2",
      label: "Pleno",
      seniority: "MID_LEVEL",
      requiredSkills: [req("react")],
    }),
  ];

  it("não repete a mesma pessoa em duas frentes", () => {
    const composition = composeSquad(
      slots,
      [
        candidate({
          consultantId: "a",
          consultantName: "Ana",
          seniority: "SENIOR",
          skills: [{ skillId: "react", level: "ADVANCED" }],
          availabilityState: "FREE",
        }),
        candidate({
          consultantId: "b",
          consultantName: "Bruno",
          seniority: "MID_LEVEL",
          skills: [{ skillId: "react", level: "ADVANCED" }],
          availabilityState: "FREE",
        }),
      ],
      false,
    );
    const ids = assignedMembers(composition).map((m) => m.consultantId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(composition.unfilled).toBe(0);
  });

  it("encaixa cada pessoa na frente da sua senioridade", () => {
    const composition = composeSquad(
      slots,
      [
        candidate({
          consultantId: "a",
          consultantName: "Ana",
          seniority: "SENIOR",
          skills: [{ skillId: "react", level: "ADVANCED" }],
          availabilityState: "FREE",
        }),
        candidate({
          consultantId: "b",
          consultantName: "Bruno",
          seniority: "MID_LEVEL",
          skills: [{ skillId: "react", level: "ADVANCED" }],
          availabilityState: "FREE",
        }),
      ],
      false,
    );
    expect(composition.assignments[0]!.assigned?.consultantId).toBe("a");
    expect(composition.assignments[1]!.assigned?.consultantId).toBe("b");
  });

  it("deixa a frente vazia quando o universo não cobre a demanda", () => {
    const composition = composeSquad(
      slots,
      [
        candidate({
          consultantId: "a",
          consultantName: "Ana",
          seniority: "SENIOR",
        }),
      ],
      false,
    );
    expect(composition.unfilled).toBe(1);
    expect(assignedMembers(composition)).toHaveLength(1);
  });

  it("descarta consultores inativos", () => {
    const composition = composeSquad(
      [slots[0]!],
      [
        candidate({
          consultantId: "x",
          consultantName: "Inativo",
          status: "INACTIVE",
          skills: [{ skillId: "react", level: "SPECIALIST" }],
        }),
      ],
      false,
    );
    expect(composition.assignments[0]!.assigned).toBeNull();
    expect(composition.unfilled).toBe(1);
  });

  it("é determinística: a mesma entrada produz a mesma composição", () => {
    const pool = [
      candidate({
        consultantId: "a",
        consultantName: "Ana",
        seniority: "SENIOR",
      }),
      candidate({
        consultantId: "b",
        consultantName: "Bruno",
        seniority: "SENIOR",
      }),
      candidate({
        consultantId: "c",
        consultantName: "Carla",
        seniority: "SENIOR",
      }),
    ];
    const first = composeSquad(slots, pool, false);
    const second = composeSquad(slots, pool, false);
    expect(assignedMembers(first).map((m) => m.consultantId)).toEqual(
      assignedMembers(second).map((m) => m.consultantId),
    );
  });

  it("garante que todo atribuído aparece nas alternativas de toda frente", () => {
    // Sem isso a troca manual não teria como puxar alguém de outra frente.
    const pool = Array.from({ length: 8 }, (_, i) =>
      candidate({
        consultantId: `c${i}`,
        consultantName: `Consultor ${i}`,
        seniority: i === 7 ? "MID_LEVEL" : "SENIOR",
      }),
    );
    const composition = composeSquad(slots, pool, false);
    const assignedIds = assignedMembers(composition).map((m) => m.consultantId);
    for (const assignment of composition.assignments) {
      for (const id of assignedIds) {
        expect(assignment.alternatives.map((a) => a.consultantId)).toContain(
          id,
        );
      }
    }
  });

  it("limita a população de troca ao teto documentado", () => {
    const pool = Array.from({ length: 40 }, (_, i) =>
      candidate({ consultantId: `c${i}`, consultantName: `Consultor ${i}` }),
    );
    const composition = composeSquad(slots, pool, false);
    for (const assignment of composition.assignments) {
      expect(assignment.alternatives.length).toBeLessThanOrEqual(
        Math.max(MAX_SWAP_POPULATION, slots.length),
      );
    }
  });

  it("oferece a MESMA população de troca em todas as frentes", () => {
    // É esta invariante que impede a troca manual de esvaziar uma frente: quem
    // pode ocupar um slot precisa estar listado em TODOS eles.
    const pool = Array.from({ length: 30 }, (_, i) =>
      candidate({
        consultantId: `c${i}`,
        consultantName: `Consultor ${String(i).padStart(2, "0")}`,
        seniority: i % 2 === 0 ? "SENIOR" : "MID_LEVEL",
        skills: [
          { skillId: "react", level: i % 3 === 0 ? "ADVANCED" : "BASIC" },
        ],
      }),
    );
    const composition = composeSquad(slots, pool, false);
    const sets = composition.assignments.map((a) =>
      [...a.alternatives.map((c) => c.consultantId)].sort(),
    );
    for (const set of sets) expect(set).toEqual(sets[0]);
  });

  it("pontua cada alternativa PARA A FRENTE em que aparece", () => {
    const composition = composeSquad(
      slots,
      [
        candidate({
          consultantId: "a",
          consultantName: "Ana",
          seniority: "SENIOR",
        }),
        candidate({
          consultantId: "b",
          consultantName: "Bruno",
          seniority: "MID_LEVEL",
        }),
      ],
      false,
    );
    // Bruno (pleno) vale mais na frente de pleno do que na de sênior.
    const onSenior = composition.assignments[0]!.alternatives.find(
      (c) => c.consultantId === "b",
    )!;
    const onMid = composition.assignments[1]!.assigned!;
    expect(onMid.consultantId).toBe("b");
    expect(onMid.slotScore).toBeGreaterThan(onSenior.slotScore);
  });
});

// ── Troca manual ────────────────────────────────────────────────────────────

describe("applyManualAssignment", () => {
  const slots = [
    slot({ key: "s1", label: "Frente 1", seniority: "SENIOR" }),
    slot({ key: "s2", label: "Frente 2", seniority: "MID_LEVEL" }),
  ];
  const pool = [
    candidate({
      consultantId: "a",
      consultantName: "Ana",
      seniority: "SENIOR",
    }),
    candidate({
      consultantId: "b",
      consultantName: "Bruno",
      seniority: "MID_LEVEL",
    }),
    candidate({
      consultantId: "c",
      consultantName: "Carla",
      seniority: "JUNIOR",
    }),
  ];

  it("troca as duas frentes quando a pessoa escolhida já ocupa outra", () => {
    const base = composeSquad(slots, pool, false);
    expect(base.assignments[0]!.assigned?.consultantId).toBe("a");
    expect(base.assignments[1]!.assigned?.consultantId).toBe("b");

    const swapped = applyManualAssignment(base, "s1", "b");
    expect(swapped.assignments[0]!.assigned?.consultantId).toBe("b");
    expect(swapped.assignments[1]!.assigned?.consultantId).toBe("a");
    expect(swapped.unfilled).toBe(0);
  });

  it("reavalia o score da pessoa para a frente de destino", () => {
    const base = composeSquad(slots, pool, false);
    const brunoOnMid = base.assignments[1]!.assigned!.slotScore;
    const swapped = applyManualAssignment(base, "s1", "b");
    const brunoOnSenior = swapped.assignments[0]!.assigned!.slotScore;
    // Mesmo consultor, frente diferente → score diferente (senioridade).
    expect(brunoOnSenior).not.toBe(brunoOnMid);
  });

  it("puxa alguém de fora sem esvaziar outra frente", () => {
    const base = composeSquad(slots, pool, false);
    const swapped = applyManualAssignment(base, "s1", "c");
    expect(swapped.assignments[0]!.assigned?.consultantId).toBe("c");
    expect(swapped.assignments[1]!.assigned?.consultantId).toBe("b");
  });

  it("é reversível: trocar e destrocar volta ao estado original", () => {
    const base = composeSquad(slots, pool, false);
    const back = applyManualAssignment(
      applyManualAssignment(base, "s1", "b"),
      "s1",
      "a",
    );
    expect(back.assignments[0]!.assigned?.consultantId).toBe("a");
    expect(back.assignments[1]!.assigned?.consultantId).toBe("b");
  });

  it("não muta a composição recebida", () => {
    const base = composeSquad(slots, pool, false);
    const before = base.assignments[0]!.assigned?.consultantId;
    applyManualAssignment(base, "s1", "b");
    expect(base.assignments[0]!.assigned?.consultantId).toBe(before);
  });

  it("nunca esvazia uma frente ao longo de uma sequência de trocas", () => {
    // REGRESSÃO. Antes, a população de troca era o top de CADA frente. Ao puxar
    // alguém de fora do conjunto inicialmente atribuído, essa pessoa passava a
    // ocupar um slot sem constar das listas das outras frentes; a troca seguinte
    // não encontrava o "outgoing" e ESVAZIAVA a frente de origem — a pessoa
    // sumia da composição e a UI dizia, falsamente, que faltavam candidatos.
    // Rankings DIVERGENTES por frente (skills disjuntas) são o que expõe o caso.
    const twoSlots = [
      slot({ key: "s1", label: "Frente A", requiredSkills: [req("A")] }),
      slot({ key: "s2", label: "Frente B", requiredSkills: [req("B")] }),
    ];
    const wide = [
      ...Array.from({ length: 8 }, (_, i) =>
        candidate({
          consultantId: `a${i}`,
          consultantName: `Alfa ${i}`,
          skills: [{ skillId: "A", level: "ADVANCED" }],
        }),
      ),
      ...Array.from({ length: 8 }, (_, i) =>
        candidate({
          consultantId: `b${i}`,
          consultantName: `Beta ${i}`,
          skills: [{ skillId: "B", level: "ADVANCED" }],
        }),
      ),
    ];

    const base = composeSquad(twoSlots, wide, false);
    expect(base.unfilled).toBe(0);

    // 1) traz para s1 alguém que NÃO estava atribuído.
    const assignedIds = assignedMembers(base).map((m) => m.consultantId);
    const outsider = base.assignments[0]!.alternatives.find(
      (c) => !assignedIds.includes(c.consultantId),
    )!;
    const step1 = applyManualAssignment(base, "s1", outsider.consultantId);
    expect(step1.unfilled).toBe(0);

    // 2) traz para s1 quem ocupa s2 → as duas frentes trocam, nenhuma esvazia.
    const occupantOfS2 = step1.assignments[1]!.assigned!.consultantId;
    const step2 = applyManualAssignment(step1, "s1", occupantOfS2);
    expect(step2.unfilled).toBe(0);
    expect(assignedMembers(step2)).toHaveLength(2);
    expect(step2.assignments[0]!.assigned?.consultantId).toBe(occupantOfS2);
    expect(step2.assignments[1]!.assigned?.consultantId).toBe(
      outsider.consultantId,
    );
  });

  it("ignora slot ou candidato inexistente", () => {
    const base = composeSquad(slots, pool, false);
    expect(applyManualAssignment(base, "inexistente", "b")).toBe(base);
    expect(applyManualAssignment(base, "s1", "zzz")).toBe(base);
  });
});

describe("clearAssignment", () => {
  it("esvazia a frente e atualiza o contador", () => {
    const base = composeSquad(
      [slot({ key: "s1" }), slot({ key: "s2" })],
      [
        candidate({ consultantId: "a", consultantName: "Ana" }),
        candidate({ consultantId: "b", consultantName: "Bruno" }),
      ],
      false,
    );
    const cleared = clearAssignment(base, "s1");
    expect(cleared.assignments[0]!.assigned).toBeNull();
    expect(cleared.unfilled).toBe(1);
  });
});

// ── Fronteira financeira ────────────────────────────────────────────────────

describe("fronteira financeira", () => {
  const financialSlot = slot({
    seniority: "SENIOR",
    requiredSkills: [req("react")],
    saleRate: 200,
  });
  const withCost = candidate({
    seniority: "SENIOR",
    skills: [{ skillId: "react", level: "ADVANCED" }],
    hourlyCost: 100,
  });

  it("não emite o fator financeiro quando includeFinancial=false", () => {
    // O fator não pode existir NEM zerado: o objeto serializado vai para o
    // cliente, e um campo presente já é informação.
    const result = evaluateSlotCandidate(financialSlot, withCost, false);
    expect(result.fit.factors.map((f) => f.key)).not.toContain("financial");
    expect(result.fit.financialIncluded).toBe(false);
    expect(JSON.stringify(result)).not.toContain("Margem");
  });

  it("emite o fator financeiro quando includeFinancial=true", () => {
    const result = evaluateSlotCandidate(financialSlot, withCost, true);
    expect(result.fit.factors.map((f) => f.key)).toContain("financial");
  });

  it("renormaliza os pesos para somar 1 nos dois modos", () => {
    for (const includeFinancial of [false, true]) {
      const result = evaluateSlotCandidate(
        financialSlot,
        withCost,
        includeFinancial,
      );
      const total = result.fit.factors.reduce((acc, f) => acc + f.weight, 0);
      expect(total).toBeCloseTo(1);
    }
  });

  it("a composição inteira respeita o gate para todos os candidatos", () => {
    const composition = composeSquad(
      [financialSlot],
      [
        withCost,
        candidate({
          consultantId: "c2",
          consultantName: "Outro",
          hourlyCost: 80,
        }),
      ],
      false,
    );
    const everyone = [
      ...assignedMembers(composition),
      ...composition.assignments.flatMap((a) => a.alternatives),
    ];
    expect(everyone.length).toBeGreaterThan(0);
    for (const person of everyone) {
      expect(person.fit.factors.map((f) => f.key)).not.toContain("financial");
    }
  });
});

// ── Cobertura de skills do time ─────────────────────────────────────────────

describe("aggregateSkillCoverage", () => {
  function member(
    name: string,
    skills: {
      skillId: string;
      level: "BASIC" | "INTERMEDIATE" | "ADVANCED" | "SPECIALIST";
    }[],
    required: RequiredSkillInput[],
  ): CoeSlotCandidate {
    return evaluateSlotCandidate(
      slot({ requiredSkills: required }),
      candidate({ consultantId: name, consultantName: name, skills }),
      false,
    );
  }

  it("cobre a skill quando UMA pessoa do time atende", () => {
    const required = [req("react", "ADVANCED"), req("sql", "INTERMEDIATE")];
    const coverage = aggregateSkillCoverage(required, [
      member("Ana", [{ skillId: "react", level: "ADVANCED" }], required),
      member("Bruno", [{ skillId: "sql", level: "SPECIALIST" }], required),
    ]);
    expect(coverage.covered).toBe(2);
    expect(coverage.required).toBe(2);
    expect(coverage.coverage01).toBe(1);
  });

  it("aponta a skill descoberta e o melhor nível presente", () => {
    const required = [req("react", "ADVANCED")];
    const coverage = aggregateSkillCoverage(required, [
      member("Ana", [{ skillId: "react", level: "BASIC" }], required),
      member("Bruno", [{ skillId: "react", level: "INTERMEDIATE" }], required),
    ]);
    expect(coverage.skills[0]!.covered).toBe(false);
    expect(coverage.skills[0]!.bestLevel).toBe("INTERMEDIATE");
    expect(coverage.skills[0]!.coveredBy).toEqual([]);
  });

  it("lista todos os que cobrem, não apenas o primeiro", () => {
    const required = [req("react")];
    const coverage = aggregateSkillCoverage(required, [
      member("Ana", [{ skillId: "react", level: "BASIC" }], required),
      member("Bruno", [{ skillId: "react", level: "ADVANCED" }], required),
    ]);
    expect(coverage.skills[0]!.coveredBy).toEqual(["Ana", "Bruno"]);
  });

  it("trata ausência de exigência como cobertura total", () => {
    expect(aggregateSkillCoverage([], []).coverage01).toBe(1);
  });

  it("não conta ninguém quando o time está vazio", () => {
    const required = [req("react")];
    const coverage = aggregateSkillCoverage(required, []);
    expect(coverage.covered).toBe(0);
    expect(coverage.skills[0]!.bestLevel).toBeNull();
  });
});

// ── Capacidade agregada ─────────────────────────────────────────────────────

describe("aggregateCapacity", () => {
  const periods = [period("w1"), period("w2")];

  function memberFor(id: string): CoeSlotCandidate {
    return evaluateSlotCandidate(
      slot(),
      candidate({ consultantId: id, consultantName: id }),
      false,
    );
  }

  function row(
    consultantId: string,
    cells: {
      state: CoeAvailabilityRow["cells"][number]["state"];
      allocationPercent: number;
    }[],
  ): CoeAvailabilityRow {
    return {
      consultantId,
      cells: cells.map((c, i) => ({
        periodKey: periods[i]!.key,
        state: c.state,
        allocationPercent: c.allocationPercent,
      })),
    };
  }

  it("soma o que sobra de cada membro por semana", () => {
    const capacity = aggregateCapacity(
      [memberFor("a"), memberFor("b")],
      [
        row("a", [
          { state: "FREE", allocationPercent: 0 },
          { state: "PARTIAL", allocationPercent: 50 },
        ]),
        row("b", [
          { state: "PARTIAL", allocationPercent: 25 },
          { state: "FULL", allocationPercent: 100 },
        ]),
      ],
      periods,
    );
    expect(capacity.weeks[0]!.freePercent).toBe(175); // 100 + 75
    expect(capacity.weeks[1]!.freePercent).toBe(50); // 50 + 0
    expect(capacity.totalFreePercent).toBe(225);
    expect(capacity.headcountEquivalent).toBeCloseTo(225 / 200);
  });

  it("zera a capacidade em férias, afastamento e inatividade", () => {
    for (const state of ["VACATION", "ON_LEAVE", "INACTIVE"] as const) {
      const capacity = aggregateCapacity(
        [memberFor("a")],
        [
          row("a", [
            { state, allocationPercent: 0 },
            { state, allocationPercent: 0 },
          ]),
        ],
        periods,
      );
      expect(capacity.totalFreePercent).toBe(0);
      expect(capacity.weeks[0]!.membersBlocked).toBe(1);
    }
  });

  it("conta membro sem linha de disponibilidade como bloqueado, não como livre", () => {
    const capacity = aggregateCapacity([memberFor("fantasma")], [], periods);
    expect(capacity.totalFreePercent).toBe(0);
    expect(capacity.weeks[0]!.membersBlocked).toBe(1);
    expect(capacity.weeks[0]!.membersWithCapacity).toBe(0);
  });

  it("não divide por zero quando não há janela", () => {
    const capacity = aggregateCapacity([memberFor("a")], [], []);
    expect(capacity.headcountEquivalent).toBe(0);
    expect(capacity.weeks).toEqual([]);
  });

  it("reporta o tamanho do time considerado", () => {
    const capacity = aggregateCapacity(
      [memberFor("a"), memberFor("b")],
      [],
      periods,
    );
    expect(capacity.members).toBe(2);
  });
});
