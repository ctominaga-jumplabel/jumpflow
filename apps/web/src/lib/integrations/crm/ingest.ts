import { Prisma, prisma } from "@jumpflow/database";
import { buildAuditEventData } from "@/lib/db/audit";
import type { CrmProjectPayload } from "./contract";
import { resolveBillingTypeId } from "./billing-map";
import { resolveClientId } from "./client-match";
import { mapSeniority } from "./seniority-map";

/**
 * Idempotent ingestion handler for the CRM-Jumplabel -> JumpFlow project
 * payload (FASE 1, contrato v1 §2). This is the "coracao" of the ingestion:
 *
 * - Claim-first idempotency via `IntegrationEvent (@@unique(provider,
 *   idempotencyKey))`: the very same key can be replayed without side effects.
 * - Correlation by `commercialContractRef` decides CREATED / LINKED_EXISTING /
 *   UPDATED; a stale `revision` yields IGNORED.
 * - Upsert of Project (+ Client, ProjectSaleRate, ProjectPlannedProfile,
 *   AuditEvent, IntegrationEvent update) inside a single `prisma.$transaction`
 *   so "no side effects on failure" holds.
 *
 * Fronteira D9 (invariante): apenas dados de VENDA e escopo. Nada de
 * custo/remuneracao/margem entra ou sai aqui.
 */

/** Provider key for this ingestion channel (schema enum). */
const PROVIDER = "CRM_JUMPLABEL" as const;

/** Outcome kinds mirrored in the ACK `result` field (contrato v1 §1.1). */
export type CrmIngestResult =
  | "CREATED"
  | "UPDATED"
  | "DUPLICATE"
  | "LINKED_EXISTING"
  | "IGNORED";

export interface CrmIngestOutcome {
  result: CrmIngestResult;
  /** Id of the JumpFlow Project when applicable, else null. */
  targetId: string | null;
  warnings: string[];
}

/** Prefix warnings emitted by this handler (mapping warnings live in helpers). */
export const WARNING_STALE_REVISION = "STALE_REVISION";
export const WARNING_EXECUTIVE_UNMATCHED = "EXECUTIVE_UNMATCHED";
export const WARNING_SALE_RATE_NOT_DERIVED = "SALE_RATE_NOT_DERIVED";
export const WARNING_NO_TIMESHEET_PROFILES_SKIPPED = "NO_TIMESHEET_PROFILES_SKIPPED";
export const WARNING_CANCELLED_WITH_LOGGED_HOURS = "CANCELLED_WITH_LOGGED_HOURS";
export const WARNING_PROJECT_NOT_FOUND_FOR_CANCELLATION =
  "PROJECT_NOT_FOUND_FOR_CANCELLATION";

type Tx = Prisma.TransactionClient;

function parseDate(value: string | null | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

/** Max `revision` already applied to a project (from prior COMPLETED events). */
function maxAppliedRevision(
  events: Array<{ requestMeta: Prisma.JsonValue | null }>,
): number {
  return events.reduce((max, event) => {
    const meta = event.requestMeta;
    const revision =
      meta && typeof meta === "object" && !Array.isArray(meta)
        ? Number((meta as Record<string, unknown>).revision ?? 0)
        : 0;
    return Number.isFinite(revision) && revision > max ? revision : max;
  }, 0);
}

/**
 * Ingest one CRM project payload. Idempotent and transactional.
 *
 * Determinacao do `result`:
 * - key ja processado (P2002 no claim) => DUPLICATE (sem efeito colateral)
 * - Project inexistente por commercialContractRef => CREATED (status ACTIVE)
 * - Project existe SEM evento CRM COMPLETED anterior => LINKED_EXISTING
 * - Project existe COM evento CRM COMPLETED anterior => UPDATED
 * - Project existe e revision <= maior aplicada => IGNORED (STALE_REVISION)
 * - project.cancelled sobre Project existente => UPDATED/LINKED_EXISTING + CANCELLED
 * - project.cancelled sem Project => IGNORED (PROJECT_NOT_FOUND_FOR_CANCELLATION)
 */
export async function ingestCrmProject(
  payload: CrmProjectPayload,
): Promise<CrmIngestOutcome> {
  const ref = payload.correlation.commercialContractRef;

  const requestMeta = {
    commercialContractRef: ref,
    revision: payload.revision,
    eventType: payload.eventType,
  };

  // 1) Claim-first idempotency. Try to CREATE the IntegrationEvent (PENDING).
  //    A P2002 on @@unique(provider, idempotencyKey) means the key already
  //    exists, but that alone is NOT a duplicate:
  //      - SUCCESS  => already processed => DUPLICATE, no side effects.
  //      - FAILED / PENDING (orphan) => a prior attempt did not persist =>
  //        RECLAIM the event (back to PENDING, clear `error`) and reprocess.
  //        This honors the contract's retry model (§1: "responde 2xx só após
  //        persistir"); the same key reprocesses until it succeeds.
  let eventId: string;
  try {
    const event = await prisma.integrationEvent.create({
      data: {
        provider: PROVIDER,
        operation: payload.eventType,
        status: "PENDING",
        idempotencyKey: payload.idempotencyKey,
        attemptedAt: new Date(),
        requestMeta,
      },
      select: { id: true },
    });
    eventId = event.id;
  } catch (error) {
    if (
      !(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
    ) {
      throw error;
    }

    const existing = await prisma.integrationEvent.findUnique({
      where: {
        provider_idempotencyKey: {
          provider: PROVIDER,
          idempotencyKey: payload.idempotencyKey,
        },
      },
      select: { id: true, status: true, entityId: true, responseMeta: true },
    });

    // Already succeeded => idempotent DUPLICATE with the persisted targetId.
    if (!existing || existing.status === "SUCCESS") {
      const targetId =
        existing?.entityId ??
        readTargetId(existing?.responseMeta ?? null) ??
        null;
      return { result: "DUPLICATE", targetId, warnings: [] };
    }

    // Not SUCCESS => reclaim atomically (conditional on it still being
    // FAILED/PENDING/RETRYING, so a concurrent success is never overwritten).
    const reclaimed = await prisma.integrationEvent.updateMany({
      where: {
        id: existing.id,
        status: { in: ["FAILED", "PENDING", "RETRYING"] },
      },
      data: {
        status: "PENDING",
        operation: payload.eventType,
        attemptedAt: new Date(),
        error: null,
        requestMeta,
      },
    });
    if (reclaimed.count === 0) {
      // Someone else just completed it => treat as DUPLICATE.
      const after = await prisma.integrationEvent.findUnique({
        where: { id: existing.id },
        select: { entityId: true, responseMeta: true },
      });
      const targetId =
        after?.entityId ?? readTargetId(after?.responseMeta ?? null) ?? null;
      return { result: "DUPLICATE", targetId, warnings: [] };
    }
    eventId = existing.id;
  }

  // 2) Do all the work in a single transaction. On success, flip the event to
  //    SUCCESS inside the same tx. On failure, mark it FAILED and rethrow (500).
  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const result = await applyIngestion(tx, payload, ref);

      await tx.integrationEvent.update({
        where: { id: eventId },
        data: {
          status: "SUCCESS",
          completedAt: new Date(),
          entityType: result.targetId ? "Project" : null,
          entityId: result.targetId,
          responseMeta: {
            result: result.result,
            targetId: result.targetId,
            warnings: result.warnings,
          },
        },
      });

      return result;
    });

    return outcome;
  } catch (error) {
    await prisma.integrationEvent
      .update({
        where: { id: eventId },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          error: error instanceof Error ? error.message : String(error),
        },
      })
      .catch(() => {
        /* best-effort: never mask the original error */
      });
    throw error;
  }
}

/** Read `targetId` from a persisted responseMeta JSON, if present. */
function readTargetId(meta: Prisma.JsonValue | null): string | null {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const value = (meta as Record<string, unknown>).targetId;
    if (typeof value === "string") return value;
  }
  return null;
}

/**
 * Core apply step (inside the transaction). Returns the outcome; the caller
 * persists the IntegrationEvent update.
 */
async function applyIngestion(
  tx: Tx,
  payload: CrmProjectPayload,
  ref: string,
): Promise<CrmIngestOutcome> {
  const existingProject = await tx.project.findFirst({
    where: { commercialContractRef: ref },
    select: { id: true, status: true, billingTypeId: true },
  });

  // Prior COMPLETED (SUCCESS) CRM events for THIS project decide the result and
  // the revision baseline. Our just-created event is still PENDING (entityId
  // null), so it is naturally excluded.
  const priorEvents = existingProject
    ? await tx.integrationEvent.findMany({
        where: {
          provider: PROVIDER,
          status: "SUCCESS",
          entityType: "Project",
          entityId: existingProject.id,
        },
        select: { requestMeta: true },
      })
    : [];

  const firstTouch = priorEvents.length === 0;

  // --- Reversao (project.cancelled) ------------------------------------------
  if (payload.eventType === "project.cancelled") {
    if (!existingProject) {
      // Nunca cria projeto so para cancelar.
      return {
        result: "IGNORED",
        targetId: null,
        warnings: [WARNING_PROJECT_NOT_FOUND_FOR_CANCELLATION],
      };
    }

    // Revision guard (I3): um project.cancelled reenviado/fora de ordem NAO pode
    // re-cancelar um projeto que ja avancou de revisao (ex.: reativado a mao e
    // atualizado depois). So cancela se a revisao for nova.
    if (!firstTouch) {
      const maxApplied = maxAppliedRevision(priorEvents);
      if (payload.revision <= maxApplied) {
        return {
          result: "IGNORED",
          targetId: existingProject.id,
          warnings: [`${WARNING_STALE_REVISION}:${payload.revision}`],
        };
      }
    }

    const warnings: string[] = [];
    const loggedHours = await tx.timeEntry.count({
      where: { projectId: existingProject.id },
    });
    if (loggedHours > 0) {
      // DECISAO DE NEGOCIO EM ABERTO: bloquear cancelamento com horas lancadas
      // ou apenas marcar. Nesta fase apenas MARCA (nao bloqueia).
      warnings.push(WARNING_CANCELLED_WITH_LOGGED_HOURS);
    }

    await tx.project.update({
      where: { id: existingProject.id },
      data: { status: "CANCELLED" },
    });

    const result: CrmIngestResult = firstTouch ? "LINKED_EXISTING" : "UPDATED";

    await tx.auditEvent.create({
      data: buildAuditEventData({
        actorUserId: null,
        entityType: "Project",
        entityId: existingProject.id,
        action: "PROJECT_CANCELLED_BY_CRM",
        before: { status: existingProject.status },
        after: {
          status: "CANCELLED",
          commercialContractRef: ref,
          revision: payload.revision,
          result,
        },
      }),
    });

    return { result, targetId: existingProject.id, warnings };
  }

  // --- Determinacao do result (won / updated) --------------------------------
  const result: CrmIngestResult = !existingProject
    ? "CREATED"
    : firstTouch
      ? "LINKED_EXISTING"
      : "UPDATED";

  // --- Revision guard (somente projeto existente com historico) --------------
  if (existingProject && !firstTouch) {
    const maxApplied = maxAppliedRevision(priorEvents);
    if (payload.revision <= maxApplied) {
      return {
        result: "IGNORED",
        targetId: existingProject.id,
        warnings: [`${WARNING_STALE_REVISION}:${payload.revision}`],
      };
    }
  }

  const warnings: string[] = [];

  // --- Mapeamentos (cliente, executivo, faturamento) -------------------------
  const clientResolution = await resolveClientId(tx, payload.client);
  warnings.push(...clientResolution.warnings);

  const executive = await resolveManager(tx, payload);
  warnings.push(...executive.warnings);

  const billing = await resolveBillingTypeId(
    tx,
    payload.project.billing.crmBillingModel,
  );
  if (billing.warning) warnings.push(billing.warning);

  // --- Datas / campos escalares ----------------------------------------------
  const contractStart = parseDate(payload.project.contractStart);
  const contractEnd = parseDate(payload.project.contractEnd);
  const occurredAt = new Date(payload.occurredAt);
  const startDate = contractStart ?? occurredAt ?? new Date();
  const endDate = contractEnd ?? null;
  const budgetHours = payload.project.budgetHoursTotal ?? null;

  // --- Upsert do Project -----------------------------------------------------
  let projectId: string;
  if (!existingProject) {
    // won ganho => ACTIVE (proposta ganha).
    const created = await tx.project.create({
      data: {
        clientId: clientResolution.clientId,
        name: payload.project.title,
        status: "ACTIVE",
        startDate,
        endDate,
        budgetHours,
        commercialContractRef: ref,
        managerUserId: executive.managerUserId,
        billingTypeId: billing.billingTypeId,
      },
      select: { id: true },
    });
    projectId = created.id;
  } else {
    // LINKED_EXISTING / UPDATED => NAO altera o status vigente.
    const updated = await tx.project.update({
      where: { id: existingProject.id },
      data: {
        clientId: clientResolution.clientId,
        name: payload.project.title,
        startDate,
        endDate,
        budgetHours,
        commercialContractRef: ref,
        managerUserId: executive.managerUserId,
        billingTypeId: billing.billingTypeId,
      },
      select: { id: true },
    });
    projectId = updated.id;
  }

  // --- Valor de venda -> ProjectSaleRate (blended = total / horas) -----------
  await reconcileProjectSaleRate(tx, {
    projectId,
    totalContractValue: payload.project.totalContractValue,
    budgetHoursTotal: payload.project.budgetHoursTotal,
    currency: payload.project.currency,
    startsAt: contractStart ?? occurredAt,
    warnings,
  });

  // --- plannedProfiles -> ProjectPlannedProfile (G1) -------------------------
  reconcilePlannedProfilesWarnings(payload, warnings);
  await reconcilePlannedProfiles(tx, projectId, payload, warnings);

  // --- Auditoria -------------------------------------------------------------
  const action =
    result === "CREATED"
      ? "PROJECT_CREATED_FROM_CRM"
      : result === "LINKED_EXISTING"
        ? "PROJECT_LINKED_FROM_CRM"
        : "PROJECT_UPDATED_FROM_CRM";

  await tx.auditEvent.create({
    data: buildAuditEventData({
      actorUserId: null,
      entityType: "Project",
      entityId: projectId,
      action,
      before: existingProject
        ? {
            status: existingProject.status,
            billingTypeId: existingProject.billingTypeId,
          }
        : null,
      after: {
        commercialContractRef: ref,
        revision: payload.revision,
        result,
        billingTypeId: billing.billingTypeId,
        managerUserId: executive.managerUserId,
      },
    }),
  });

  return { result, targetId: projectId, warnings };
}

/**
 * Executivo (e-mail) -> managerUserId. Match por User.email @unique. Sem match,
 * grava a REF SOLTA (o proprio e-mail; managerUserId e String sem FK) + warning,
 * nunca bloqueia (decisao congelada em respostas-fase1 D11).
 */
async function resolveManager(
  tx: Tx,
  payload: CrmProjectPayload,
): Promise<{ managerUserId: string; warnings: string[] }> {
  const email = payload.accountExecutive.email;
  const user = await tx.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (user) {
    return { managerUserId: user.id, warnings: [] };
  }
  return {
    managerUserId: email,
    warnings: [`${WARNING_EXECUTIVE_UNMATCHED}:${email}`],
  };
}

/** Reconcile the project-level, CRM-imported ProjectSaleRate (blended rate). */
async function reconcileProjectSaleRate(
  tx: Tx,
  args: {
    projectId: string;
    totalContractValue: number | undefined;
    budgetHoursTotal: number | undefined;
    currency: string;
    startsAt: Date;
    warnings: string[];
  },
): Promise<void> {
  // Idempotent reconciliation: drop only the project-level CRM-imported rates
  // (consultant/allocation null + note prefix). Manual per-consultant/allocation
  // rates are never touched.
  await tx.projectSaleRate.deleteMany({
    where: {
      projectId: args.projectId,
      consultantId: null,
      allocationId: null,
      note: { startsWith: "Importado do CRM" },
    },
  });

  const total = args.totalContractValue;
  const hours = args.budgetHoursTotal;
  if (total == null || hours == null || hours <= 0) {
    // DECISAO DE NEGOCIO EM ABERTO: CRM manda VALOR TOTAL e o ProjectSaleRate e
    // por HORA. Derivamos "blended = total / horas". Sem os dois => nao deriva.
    args.warnings.push(WARNING_SALE_RATE_NOT_DERIVED);
    return;
  }

  const blended = total / hours;
  await tx.projectSaleRate.create({
    data: {
      projectId: args.projectId,
      consultantId: null,
      allocationId: null,
      startsAt: args.startsAt,
      hourlyRate: new Prisma.Decimal(blended.toFixed(2)),
      currency: args.currency,
      note: "Importado do CRM (blended)",
    },
  });
}

/** Push the NO_TIMESHEET warning (perfis nao materializados) when applicable. */
function reconcilePlannedProfilesWarnings(
  payload: CrmProjectPayload,
  warnings: string[],
): void {
  if (payload.project.timesheetMode === "NO_TIMESHEET") {
    warnings.push(WARNING_NO_TIMESHEET_PROFILES_SKIPPED);
  }
}

/**
 * Materialize plannedProfiles -> ProjectPlannedProfile (G1, Opcao A).
 * Reconciliacao idempotente: SEMPRE limpa os perfis do projeto primeiro
 * (deleteMany) e so recria quando timesheetMode === TIMESHEET. Isso evita
 * ORFAOS (N3): um projeto que era TIMESHEET e recebe uma revisao NO_TIMESHEET
 * tem os perfis antigos removidos em vez de ficarem pendurados.
 */
async function reconcilePlannedProfiles(
  tx: Tx,
  projectId: string,
  payload: CrmProjectPayload,
  warnings: string[],
): Promise<void> {
  // Limpa em ambos os modos (reconciliacao idempotente / anti-orfao).
  await tx.projectPlannedProfile.deleteMany({ where: { projectId } });

  // NO_TIMESHEET => nao materializa (o warning ja foi emitido); apenas limpou.
  if (payload.project.timesheetMode !== "TIMESHEET") return;

  for (const profile of payload.plannedProfiles) {
    const seniority = mapSeniority(profile.seniority);
    if (seniority.warning) warnings.push(seniority.warning);

    await tx.projectPlannedProfile.create({
      data: {
        projectId,
        crmLineId:
          profile.crmLineId != null ? String(profile.crmLineId) : null,
        roleName: profile.jobRoleName ?? profile.jobRoleSlug ?? "",
        seniority: seniority.seniority,
        quantity: profile.quantity,
        budgetHours: new Prisma.Decimal(profile.budgetHours.toFixed(2)),
        saleUnitValue: new Prisma.Decimal(profile.saleUnitValue.toFixed(2)),
        saleLineValue: new Prisma.Decimal(profile.saleLineValue.toFixed(2)),
      },
    });
  }
}
