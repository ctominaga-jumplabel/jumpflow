import type { SurveyInvitationStatus } from "./types";

/**
 * Pure anonymity logic for the Pesquisa de Clima / NPS module (EP 7.1).
 *
 * ANONIMATO É REQUISITO CENTRAL (docs/backlog-talentos.md §3). This module is
 * the single source of truth for HOW a submission is recorded without linking
 * the response to the respondent's identity. It is pure (no I/O) so the
 * non-reidentification guarantee is unit-tested directly: the data we hand to
 * Prisma for an anonymous survey must NOT carry any identity (no consultantId,
 * and — by decision — no invitationId either, so the SetNull link cannot be
 * walked back to the SurveyInvitation that knows the consultant).
 */

/**
 * Decide o vínculo `invitationId` a gravar na SurveyResponse.
 *
 * Em pesquisa ANÔNIMA (anonymous=true, default): retorna `null`. Mesmo o schema
 * permitindo invitationId (SetNull), deliberadamente NÃO gravamos o vínculo, de
 * modo que não exista nenhum caminho — nem indireto via SurveyInvitation —
 * para correlacionar a resposta ao consultor. O "quem respondeu" é controlado
 * apenas por `SurveyInvitation.status = ANSWERED`.
 *
 * Em pesquisa NÃO anônima (anonymous=false): o vínculo via invitationId é
 * permitido (auditoria/feedback identificado), então retornamos o invitationId.
 */
export function resolveResponseInvitationLink(params: {
  anonymous: boolean;
  invitationId: string;
}): string | null {
  return params.anonymous ? null : params.invitationId;
}

/** Resposta a uma questão, já validada (sem identidade). */
export interface AnonymousAnswerInput {
  questionId: string;
  scoreValue: number | null;
  choiceValue: string | null;
  textValue: string | null;
}

/** Dados prontos para `prisma.surveyResponse.create` — provadamente sem identidade. */
export interface SurveyResponseCreateData {
  surveyId: string;
  /** null em pesquisa anônima (ver resolveResponseInvitationLink). */
  invitationId: string | null;
  submittedAt: Date;
  answers: {
    create: {
      questionId: string;
      scoreValue: number | null;
      choiceValue: string | null;
      textValue: string | null;
    }[];
  };
}

/** Conjunto de chaves que JAMAIS podem aparecer em uma resposta anônima. */
export const FORBIDDEN_IDENTITY_KEYS = [
  "consultantId",
  "userId",
  "respondentId",
  "email",
  "name",
] as const;

/**
 * Monta o objeto de criação da SurveyResponse de forma anônima-segura.
 *
 * Garantias (testadas):
 *  - NUNCA inclui consultantId/userId/qualquer identidade (o tipo nem permite).
 *  - Em pesquisa anônima, `invitationId` é forçado a null (sem vínculo reverso).
 *  - As respostas carregam só valor por questão, sem qualquer marca do autor.
 *
 * Pura: o caller (server action) faz I/O (marcar invitation ANSWERED + criar a
 * resposta) numa transação; esta função só decide a forma dos dados.
 */
export function buildAnonymousSurveyResponse(params: {
  surveyId: string;
  anonymous: boolean;
  invitationId: string;
  submittedAt: Date;
  answers: AnonymousAnswerInput[];
}): SurveyResponseCreateData {
  const invitationId = resolveResponseInvitationLink({
    anonymous: params.anonymous,
    invitationId: params.invitationId,
  });
  return {
    surveyId: params.surveyId,
    invitationId,
    submittedAt: params.submittedAt,
    answers: {
      create: params.answers.map((a) => ({
        questionId: a.questionId,
        scoreValue: a.scoreValue,
        choiceValue: a.choiceValue,
        textValue: a.textValue,
      })),
    },
  };
}

/**
 * Próximo status do convite ao submeter: PENDING → ANSWERED. Idempotente: um
 * convite já ANSWERED/EXPIRED não regride. Pura para teste direto e reuso.
 */
export function nextInvitationStatusOnSubmit(
  current: SurveyInvitationStatus,
): SurveyInvitationStatus {
  return current === "PENDING" ? "ANSWERED" : current;
}

/** Um convite só aceita resposta quando ainda está PENDING. */
export function invitationCanRespond(
  current: SurveyInvitationStatus,
): boolean {
  return current === "PENDING";
}
