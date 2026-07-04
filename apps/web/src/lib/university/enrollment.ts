import type { EnrollmentStatus } from "./types";

/**
 * Regras puras de matrícula da Universidade Jump (EP 7.3). Sem I/O.
 *
 * Centraliza a transição de status e a normalização de progresso para serem
 * testáveis isoladamente e reusadas pelo server action. A persistência e a
 * gravação de SkillEvidence ficam no action; aqui mora só a DECISÃO.
 */

/** Estado-alvo derivado de um update de progresso. */
export interface ProgressUpdate {
  status: EnrollmentStatus;
  /** 0-100, inteiro. */
  progressPct: number;
  hoursCompleted: number;
  /** true quando a transição ATINGE COMPLETED agora (gatilho de evidência). */
  becameCompleted: boolean;
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 100) return 100;
  return Math.round(value);
}

function clampHours(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

/**
 * Deriva o novo estado de uma matrícula a partir do progresso informado pelo
 * consultor e do status atual. Regras:
 * - Matrícula CANCELLED ou já COMPLETED é terminal: não muda por progresso.
 * - progressPct >= 100 → COMPLETED (atinge agora se ainda não estava).
 * - 0 < progressPct < 100 → IN_PROGRESS.
 * - progressPct == 0 → mantém ENROLLED (ainda não começou).
 * `becameCompleted` é true apenas na TRANSIÇÃO para COMPLETED (idempotência: se
 * já estava COMPLETED, não dispara o gatilho de evidência de novo).
 */
export function deriveProgressUpdate(
  current: EnrollmentStatus,
  rawProgressPct: number,
  rawHoursCompleted: number,
): ProgressUpdate | null {
  if (current === "CANCELLED" || current === "COMPLETED") {
    // Terminal: o progresso não reabre uma matrícula cancelada/concluída.
    return null;
  }
  const progressPct = clampPct(rawProgressPct);
  const hoursCompleted = clampHours(rawHoursCompleted);

  let status: EnrollmentStatus;
  if (progressPct >= 100) {
    status = "COMPLETED";
  } else if (progressPct > 0) {
    status = "IN_PROGRESS";
  } else {
    status = "ENROLLED";
  }

  // `current` já foi estreitado para ENROLLED|IN_PROGRESS (os terminais retornam
  // null acima), então atingir COMPLETED aqui é sempre uma TRANSIÇÃO nova — o que
  // garante idempotência do gatilho de evidência.
  const becameCompleted = status === "COMPLETED";
  return { status, progressPct, hoursCompleted, becameCompleted };
}

/**
 * Decide se, ao concluir um curso, devemos registrar uma SkillEvidence — e qual
 * sourceType usar. Pura.
 *
 * - Só registra quando: o curso tem skillId, existe ConsultantSkill do consultor
 *   para essa skill (consultantSkillId presente) e AINDA NÃO há evidência deste
 *   enrollment (idempotência por enrollment via sourceId == enrollmentId).
 * - sourceType: o enum SkillEvidenceSource (FEEDBACK|EVALUATION|CERTIFICATE|
 *   PROJECT|MANUAL) NÃO tem valor 'COURSE'/'TRAINING'. Usamos o mais próximo
 *   semanticamente: MANUAL — a conclusão de curso é uma evidência registrada
 *   pela plataforma (não um feedback, avaliação, certificado emitido nem projeto
 *   entregue). Documentado para não alterar o enum (proibido nesta história).
 */
export type SkillEvidenceSource =
  | "FEEDBACK"
  | "EVALUATION"
  | "CERTIFICATE"
  | "PROJECT"
  | "MANUAL";

/** sourceType usado para evidência de conclusão de curso (ver justificativa). */
export const COURSE_EVIDENCE_SOURCE: SkillEvidenceSource = "MANUAL";

export interface EvidenceDecision {
  shouldRecord: boolean;
  sourceType: SkillEvidenceSource;
  /** sourceId = enrollmentId, chave de idempotência (1 evidência por matrícula). */
  sourceId: string;
  note: string;
}

export function decideCourseEvidence(args: {
  enrollmentId: string;
  courseTitle: string;
  /** ConsultantSkill id do consultor para a skill do curso; null se não existe. */
  consultantSkillId: string | null;
  /** true se já existe SkillEvidence com sourceId == enrollmentId. */
  alreadyRecorded: boolean;
}): EvidenceDecision {
  const shouldRecord =
    args.consultantSkillId !== null && !args.alreadyRecorded;
  return {
    shouldRecord,
    sourceType: COURSE_EVIDENCE_SOURCE,
    sourceId: args.enrollmentId,
    note: `Conclusão do curso "${args.courseTitle}" na JumpAcademy.`,
  };
}
