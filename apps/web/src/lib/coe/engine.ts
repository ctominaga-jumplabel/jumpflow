import { computeFit } from "@/lib/allocation-ai/engine";
import { skillLevelOrder, type SkillLevel } from "@/lib/competencies/types";
import type { AvailabilityPeriod } from "@/lib/availability/types";
import type {
  FitTargetInput,
  RequiredSkillInput,
} from "@/lib/allocation-ai/types";
import type {
  CoeAvailabilityRow,
  CoeCandidateInput,
  CoeCapacitySummary,
  CoeCapacityWeek,
  CoeComposition,
  CoeCoverageSummary,
  CoeSkillCoverage,
  CoeSlotAssignment,
  CoeSlotCandidate,
  CoeSlotInput,
} from "./types";

/**
 * Núcleo DETERMINÍSTICO do COE — Centro Operacional de Excelência.
 *
 * Funções puras: sem I/O, sem RBAC, sem LLM. Recebem os slots (frentes a
 * paralelizar) e os candidatos já moldados pelo servidor, e devolvem a
 * composição do time, a cobertura de skills do CONJUNTO e a capacidade agregada
 * por semana. Por serem puras, rodam também no cliente — é o que permite trocar
 * uma pessoa de slot e ver cobertura/capacidade se refazerem na hora, sem
 * roundtrip e sem duplicar a regra.
 *
 * O score por (slot, candidato) reusa `computeFit` da IA de Alocação: o COE NÃO
 * redefine os pesos de skills/disponibilidade/histórico/financeiro. Sobre esse
 * score o COE aplica um único ajuste próprio e explícito — a aderência de
 * senioridade ao slot — sempre exibido em separado.
 *
 * COMPOSIÇÃO É SUGESTÃO: a proposta ordena e distribui candidatos, não cria
 * Allocation. A alocação continua sendo decisão humana.
 */

// ── Aderência de senioridade ────────────────────────────────────────────────

/**
 * Escada de senioridade para COMPARAÇÃO (não é hierarquia de cargo). O enum
 * Prisma `Seniority` cresceu por append para espelhar o CRM, então a ordem de
 * declaração não serve; este mapa é a ordem semântica. Trilhas paralelas
 * compartilham degrau de propósito (TECH_LEAD e SPECIALIST; ARCHITECT e
 * COORDINATOR; MANAGER e PRINCIPAL): trocar entre elas não é subir nem descer.
 */
export const SENIORITY_RANK: Record<string, number> = {
  TRAINEE: 0,
  INTERN: 0,
  JUNIOR: 1,
  MID_LEVEL: 2,
  SENIOR: 3,
  TECH_LEAD: 4,
  SPECIALIST: 4,
  ARCHITECT: 5,
  COORDINATOR: 5,
  MANAGER: 6,
  PRINCIPAL: 6,
};

/**
 * Pontos somados ao score do fit conforme a senioridade do candidato frente à
 * exigida pelo slot. Valores pequenos e documentados: a senioridade DESEMPATA e
 * orienta a distribuição entre frentes, não domina a decisão técnica (skills
 * continuam pesando 50% dentro do fit).
 *
 * - `EXACT` (+8): o encaixe ideal para o slot.
 * - `ABOVE` (+2): serve, mas queimar um sênior numa frente júnior tem custo de
 *   oportunidade — por isso menos que o encaixe exato, e nunca negativo.
 * - `BELOW_ONE` (−8) e `BELOW_MANY` (−16): risco crescente de a frente não
 *   entregar sozinha, que é justamente o que a paralelização não tolera.
 */
export const SENIORITY_DELTA = {
  EXACT: 8,
  ABOVE: 2,
  BELOW_ONE: -8,
  BELOW_MANY: -16,
} as const;

/** Quantos candidatos do topo de CADA frente entram na população de troca. */
export const MAX_ALTERNATIVES_PER_SLOT = 5;

/**
 * Teto da população de troca (a lista de alternativas, igual em todas as
 * frentes). A CORREÇÃO da troca manual vem de a população ser GLOBAL e fechada,
 * não de ela ser grande — então limitá-la não reintroduz o bug de esvaziar uma
 * frente; apenas reduz o leque oferecido.
 *
 * O teto existe porque o payload cresce com população × frentes: sem ele, um
 * projeto no limite (12 frentes, quadro inteiro, muitas skills exigidas) chega a
 * centenas de KB de RSC. Os já atribuídos NUNCA são cortados — eles precisam
 * estar na lista para a troca resolver.
 */
export const MAX_SWAP_POPULATION = 10;

export interface SeniorityAdherence {
  delta: number;
  detail: string;
}

/**
 * Ajuste de senioridade de um candidato para um slot. Sem exigência no slot, ou
 * senioridade desconhecida em qualquer um dos lados, o ajuste é 0 (neutro) —
 * dado ausente nunca penaliza.
 */
export function seniorityAdherence(
  slotSeniority: string | null,
  candidateSeniority: string,
): SeniorityAdherence {
  if (!slotSeniority) {
    return { delta: 0, detail: "Slot sem senioridade exigida (neutro)." };
  }
  const required = SENIORITY_RANK[slotSeniority];
  const current = SENIORITY_RANK[candidateSeniority];
  if (required === undefined || current === undefined) {
    return { delta: 0, detail: "Senioridade não comparável (neutro)." };
  }
  const diff = current - required;
  if (diff === 0) {
    return {
      delta: SENIORITY_DELTA.EXACT,
      detail: "Senioridade exata do slot.",
    };
  }
  if (diff > 0) {
    return {
      delta: SENIORITY_DELTA.ABOVE,
      detail:
        diff === 1
          ? "Um nível acima do exigido."
          : `${diff} níveis acima do exigido.`,
    };
  }
  if (diff === -1) {
    return {
      delta: SENIORITY_DELTA.BELOW_ONE,
      detail: "Um nível abaixo do exigido.",
    };
  }
  return {
    delta: SENIORITY_DELTA.BELOW_MANY,
    detail: `${Math.abs(diff)} níveis abaixo do exigido.`,
  };
}

// ── Score por (slot, candidato) ─────────────────────────────────────────────

function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Avalia UM candidato para UM slot. O fit vem íntegro da engine da IA de
 * Alocação; o delta de senioridade fica separado e a soma é saturada em 0..100.
 */
export function evaluateSlotCandidate(
  slot: CoeSlotInput,
  candidate: CoeCandidateInput,
  includeFinancial: boolean,
): CoeSlotCandidate {
  const target: FitTargetInput = {
    requiredSkills: slot.requiredSkills,
    saleRate: slot.saleRate,
  };
  const fit = computeFit(target, candidate, includeFinancial);
  const seniority = seniorityAdherence(slot.seniority, candidate.seniority);
  return {
    consultantId: candidate.consultantId,
    consultantName: candidate.consultantName,
    fit,
    seniorityDelta: seniority.delta,
    seniorityDetail: seniority.detail,
    slotScore: clampScore(fit.score + seniority.delta),
    isCoeMember: candidate.isCoeMember,
    coeFocusArea: candidate.coeFocusArea,
  };
}

/**
 * Ordem estável de candidatos dentro de um slot: score do slot, depois skills
 * atendidas, depois nome (pt-BR). Sem empate irresolvido — a mesma entrada
 * sempre produz a mesma composição.
 */
function compareCandidates(a: CoeSlotCandidate, b: CoeSlotCandidate): number {
  return (
    b.slotScore - a.slotScore ||
    b.fit.skillsMet - a.fit.skillsMet ||
    a.consultantName.localeCompare(b.consultantName, "pt-BR")
  );
}

// ── Composição do time (atribuição slot ↔ pessoa) ───────────────────────────

interface Pair {
  slotIndex: number;
  candidate: CoeSlotCandidate;
}

/**
 * Compõe o time: distribui candidatos pelos slots SEM repetir ninguém.
 *
 * Estratégia: guloso GLOBAL. Todos os pares (slot × candidato) são pontuados e
 * ordenados por score desc; o par de maior score cujo slot E cuja pessoa ainda
 * estão livres é fixado, e assim por diante. É determinístico, explicável e
 * resolve o essencial que o ranking por vaga não resolve — a mesma pessoa não
 * ocupa duas frentes, e a melhor pessoa não é gasta num slot em que outra serve
 * igualmente bem enquanto o slot difícil fica vazio.
 *
 * Não é o ótimo global do problema de atribuição (Hungarian): é uma
 * aproximação gulosa, coerente com o princípio de que a IA SUGERE e o humano
 * decide — por isso cada slot também devolve alternativas para troca manual.
 *
 * Consultores INACTIVE são descartados (não são sugestão válida), espelhando
 * `rankCandidates` da IA de Alocação.
 */
export function composeSquad(
  slots: ReadonlyArray<CoeSlotInput>,
  candidates: ReadonlyArray<CoeCandidateInput>,
  includeFinancial: boolean,
): CoeComposition {
  const pool = candidates.filter((c) => c.status !== "INACTIVE");

  // Matriz de scores: por slot, todos os candidatos já ordenados.
  const rankedBySlot: CoeSlotCandidate[][] = slots.map((slot) =>
    pool
      .map((c) => evaluateSlotCandidate(slot, c, includeFinancial))
      .sort(compareCandidates),
  );

  // Pares ordenados globalmente. O desempate por índice do slot mantém a ordem
  // das frentes como critério final estável.
  const pairs: Pair[] = [];
  rankedBySlot.forEach((ranked, slotIndex) => {
    for (const candidate of ranked) pairs.push({ slotIndex, candidate });
  });
  pairs.sort(
    (a, b) =>
      compareCandidates(a.candidate, b.candidate) || a.slotIndex - b.slotIndex,
  );

  const assignedBySlot = new Map<number, CoeSlotCandidate>();
  const takenConsultants = new Set<string>();
  for (const pair of pairs) {
    if (assignedBySlot.size === slots.length) break;
    if (assignedBySlot.has(pair.slotIndex)) continue;
    if (takenConsultants.has(pair.candidate.consultantId)) continue;
    assignedBySlot.set(pair.slotIndex, pair.candidate);
    takenConsultants.add(pair.candidate.consultantId);
  }

  // Alternativas: TODA frente recebe a MESMA população — a união dos melhores
  // de cada frente com os que ficaram atribuídos — cada pessoa avaliada para a
  // frente em que aparece (o score muda de frente para frente).
  //
  // Essa população fechada é o que sustenta a troca manual. Quem pode ocupar um
  // slot em algum momento é exatamente A₀ ∪ (∪ dos tops de cada frente): se uma
  // frente listasse só o próprio top, puxar alguém de fora do conjunto inicial
  // criaria um ocupante ausente das listas das outras, e a troca seguinte
  // esvaziaria uma frente em vez de trocar as duas. Fechar a união elimina essa
  // classe de bug de uma vez, em vez de tratá-la caso a caso.
  //
  // A lista NÃO exclui o ocupante atual — quem decide o que exibir é a UI, e
  // assim o conjunto permanece estável ao longo de várias trocas.
  const populationIds = new Set(
    [...assignedBySlot.values()].map((c) => c.consultantId),
  );
  // Candidatos do topo de cada frente, oferecidos por MÉRITO: entra primeiro
  // quem alcança o melhor score em alguma frente, até o teto. Assim o corte não
  // depende da ordem das frentes.
  const bestScoreByCandidate = new Map<string, number>();
  for (const ranked of rankedBySlot) {
    for (const candidate of ranked.slice(0, MAX_ALTERNATIVES_PER_SLOT)) {
      if (populationIds.has(candidate.consultantId)) continue;
      const best = bestScoreByCandidate.get(candidate.consultantId) ?? -1;
      if (candidate.slotScore > best) {
        bestScoreByCandidate.set(candidate.consultantId, candidate.slotScore);
      }
    }
  }
  const extras = [...bestScoreByCandidate.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, MAX_SWAP_POPULATION - populationIds.size));
  for (const [consultantId] of extras) populationIds.add(consultantId);
  const assignments: CoeSlotAssignment[] = slots.map((slot, slotIndex) => {
    const alternatives = rankedBySlot[slotIndex]!.filter((c) =>
      populationIds.has(c.consultantId),
    );
    return {
      slot,
      assigned: assignedBySlot.get(slotIndex) ?? null,
      alternatives,
    };
  });

  return {
    assignments,
    unfilled: assignments.filter((a) => a.assigned === null).length,
  };
}

/**
 * Troca manual: coloca `consultantId` no slot `slotKey`.
 *
 * Regra de integridade — ninguém ocupa duas frentes. Se a pessoa escolhida já
 * está em outro slot, os dois slots TROCAM de ocupante: quem ocupava o slot de
 * destino assume o slot de origem. Nenhuma frente é esvaziada por efeito
 * colateral. Se a pessoa escolhida estava fora da composição, o ocupante
 * anterior do slot de destino volta ao pool e o slot de origem não existe.
 *
 * A troca sempre resolve porque `composeSquad` garante que todo candidato
 * atribuído aparece nas alternativas de TODOS os slots, avaliado para cada um —
 * o score exibido é sempre o daquele slot, nunca herdado de outro.
 *
 * Função pura: devolve uma nova composição, sem mutar a recebida. Retorna a
 * composição inalterada quando o slot ou o candidato não existem.
 */
export function applyManualAssignment(
  composition: CoeComposition,
  slotKey: string,
  consultantId: string,
): CoeComposition {
  const targetIndex = composition.assignments.findIndex(
    (a) => a.slot.key === slotKey,
  );
  if (targetIndex < 0) return composition;

  const target = composition.assignments[targetIndex]!;
  if (target.assigned?.consultantId === consultantId) return composition;

  // A pessoa escolhida, avaliada PARA ESTE slot (o score muda de slot a slot).
  const incoming =
    target.alternatives.find((c) => c.consultantId === consultantId) ?? null;
  if (!incoming) return composition;

  const sourceIndex = composition.assignments.findIndex(
    (a, i) => i !== targetIndex && a.assigned?.consultantId === consultantId,
  );

  const outgoing = target.assigned;
  const next = composition.assignments.map((assignment, index) => {
    if (index === targetIndex) return { ...assignment, assigned: incoming };
    if (index === sourceIndex) {
      // A pessoa que saiu do slot de destino assume o slot de origem — avaliada
      // para ELE, buscando entre as suas alternativas.
      const replacement = outgoing
        ? (assignment.alternatives.find(
            (c) => c.consultantId === outgoing.consultantId,
          ) ?? null)
        : null;
      return { ...assignment, assigned: replacement };
    }
    return assignment;
  });

  return {
    assignments: next,
    unfilled: next.filter((a) => a.assigned === null).length,
  };
}

/** Remove o ocupante de um slot (deixa a frente vazia). Pura. */
export function clearAssignment(
  composition: CoeComposition,
  slotKey: string,
): CoeComposition {
  const assignments = composition.assignments.map((assignment) =>
    assignment.slot.key === slotKey
      ? { ...assignment, assigned: null }
      : assignment,
  );
  return {
    assignments,
    unfilled: assignments.filter((a) => a.assigned === null).length,
  };
}

// ── Cobertura de skills do TIME ─────────────────────────────────────────────

function levelRank(level: SkillLevel | null): number {
  return level === null ? -1 : skillLevelOrder.indexOf(level);
}

/**
 * Cobertura AGREGADA: para cada skill exigida, o melhor nível presente no time e
 * quem a atende. Basta UMA pessoa cobrir — é a diferença entre ler o gap pessoa
 * a pessoa e ler o gap do conjunto que vai tocar o projeto.
 *
 * O nível de cada membro sai de `fit.skillDetails`, que a engine já resolveu
 * apenas com skills VALIDADAS.
 */
export function aggregateSkillCoverage(
  requiredSkills: ReadonlyArray<RequiredSkillInput>,
  members: ReadonlyArray<CoeSlotCandidate>,
): CoeCoverageSummary {
  const skills: CoeSkillCoverage[] = requiredSkills.map((required) => {
    let bestLevel: SkillLevel | null = null;
    const coveredBy: string[] = [];
    for (const member of members) {
      const detail = member.fit.skillDetails.find(
        (d) => d.skillId === required.skillId,
      );
      if (!detail) continue;
      if (levelRank(detail.currentLevel) > levelRank(bestLevel)) {
        bestLevel = detail.currentLevel;
      }
      if (detail.meets) coveredBy.push(member.consultantName);
    }
    return {
      skillId: required.skillId,
      skillName: required.skillName,
      requiredLevel: required.requiredLevel,
      bestLevel,
      coveredBy,
      covered: coveredBy.length > 0,
    };
  });

  const covered = skills.filter((s) => s.covered).length;
  const required = skills.length;
  return {
    skills,
    covered,
    required,
    coverage01: required === 0 ? 1 : covered / required,
  };
}

// ── Capacidade agregada do TIME ─────────────────────────────────────────────

/**
 * % de capacidade LIVRE de uma célula. Férias, afastamento e inatividade zeram a
 * capacidade independentemente do percentual alocado — coerente com o read-model
 * do Mapa de Disponibilidade, que já reporta 0% de alocação nesses estados.
 */
function freePercentForCell(
  state: CoeAvailabilityRow["cells"][number]["state"],
  allocationPercent: number,
): number {
  if (state === "VACATION" || state === "ON_LEAVE" || state === "INACTIVE") {
    return 0;
  }
  return Math.max(0, 100 - allocationPercent);
}

/**
 * Capacidade do time por semana da janela: quanto sobra somando os membros
 * efetivamente atribuídos. `headcountEquivalent` converte o total em
 * pessoas-integrais e responde de forma direta quantas frentes o time consegue
 * sustentar em paralelo na janela.
 *
 * Membro sem linha de disponibilidade (janela não informada) é contado como
 * BLOQUEADO na semana, não como livre: capacidade não medida nunca vira
 * capacidade presumida.
 */
export function aggregateCapacity(
  members: ReadonlyArray<CoeSlotCandidate>,
  rows: ReadonlyArray<CoeAvailabilityRow>,
  periods: ReadonlyArray<AvailabilityPeriod>,
): CoeCapacitySummary {
  const rowById = new Map(rows.map((r) => [r.consultantId, r]));

  const weeks: CoeCapacityWeek[] = periods.map((period) => {
    let freePercent = 0;
    let membersWithCapacity = 0;
    let membersBlocked = 0;
    for (const member of members) {
      const cell = rowById
        .get(member.consultantId)
        ?.cells.find((c) => c.periodKey === period.key);
      const free = cell
        ? freePercentForCell(cell.state, cell.allocationPercent)
        : 0;
      freePercent += free;
      if (free > 0) membersWithCapacity += 1;
      else membersBlocked += 1;
    }
    return {
      periodKey: period.key,
      shortLabel: period.shortLabel,
      label: period.label,
      freePercent,
      membersWithCapacity,
      membersBlocked,
    };
  });

  const totalFreePercent = weeks.reduce((acc, w) => acc + w.freePercent, 0);
  const denominator = 100 * weeks.length;
  return {
    weeks,
    totalFreePercent,
    headcountEquivalent: denominator === 0 ? 0 : totalFreePercent / denominator,
    members: members.length,
  };
}

/** Os ocupantes atuais da composição, na ordem dos slots. */
export function assignedMembers(
  composition: CoeComposition,
): CoeSlotCandidate[] {
  return composition.assignments
    .map((a) => a.assigned)
    .filter((c): c is CoeSlotCandidate => c !== null);
}
