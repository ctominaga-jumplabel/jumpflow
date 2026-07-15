import { z } from "zod";

/**
 * Zod contract for the CRM-Jumplabel → JumpFlow project ingestion payload
 * (integration Fase 1, contrato v1 §2), already reflecting the JumpFlow
 * answers in `respostas-jumpflow-fase1.md`:
 *
 * - `project.billing` carries ONLY `crmBillingModel`. The de/para to
 *   `billingTypeId` is a JumpFlow responsibility (D10) and is NOT part of the
 *   wire payload — do not add `jumpflowBillingType`/`jumpflowBillingChargeType`.
 * - `plannedProfiles[].jobRoleSlug` is only an OPTIONAL origin label (there is
 *   no JobRole catalog in JumpFlow); the target field is `roleName`/`jobRoleName`
 *   (free text, D6).
 *
 * Conventions (contrato §0):
 * - Dates travel as ISO-8601 UTC strings; conversion to `Date` is the handler's
 *   job, so we keep them as validated strings here.
 * - Money travels as decimal numbers (never localized strings).
 * - Absent field ≠ `null`. We model optional fields with `.optional()` (absent)
 *   and do not coerce `null` into a value; the ingest layer decides semantics.
 */

/** Contract schema version accepted by this endpoint. */
export const CRM_CONTRACT_SCHEMA_VERSION = "1.0" as const;

export const crmEventTypeSchema = z.enum([
  "project.won",
  "project.updated",
  "project.cancelled",
]);
export type CrmEventType = z.infer<typeof crmEventTypeSchema>;

export const crmOpportunityTypeSchema = z.enum([
  "PROJECT",
  "ALLOCATION",
  "SQUAD",
  "LICENSING",
  "BPO",
  "SUPPORT",
  "OTHER",
]);
export type CrmOpportunityType = z.infer<typeof crmOpportunityTypeSchema>;

export const crmTimesheetModeSchema = z.enum(["TIMESHEET", "NO_TIMESHEET"]);
export type CrmTimesheetMode = z.infer<typeof crmTimesheetModeSchema>;

/** ISO-8601 datetime string (contrato §0). Kept as string; handler parses. */
const isoDateTime = z.iso.datetime({ offset: true });

/** CNPJ normalized to exactly 14 digits (contrato §0: só dígitos, 14 posições). */
const cnpjDocument = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .pipe(
    z
      .string()
      .length(14, "Documento (CNPJ) deve ter 14 dígitos após normalização."),
  );

export const crmCorrelationSchema = z.object({
  crmProposalReferenceId: z.string().min(1),
  crmProposalId: z.number().int().optional(),
  commercialContractRef: z.string().min(1),
});
export type CrmCorrelation = z.infer<typeof crmCorrelationSchema>;

export const crmBillingSchema = z.object({
  // The CRM sends ONLY the billing model. The de/para to Project.billingTypeId
  // lives in JumpFlow (D10) and is NOT part of the wire payload.
  crmBillingModel: z.string().min(1),
});
export type CrmBilling = z.infer<typeof crmBillingSchema>;

export const crmProjectSchema = z.object({
  title: z.string().min(1),
  opportunityType: crmOpportunityTypeSchema,
  timesheetMode: crmTimesheetModeSchema,
  contractStart: isoDateTime.optional(),
  contractEnd: isoDateTime.optional(),
  budgetHoursTotal: z.number().nonnegative().optional(),
  totalContractValue: z.number().nonnegative().optional(),
  currency: z.string().default("BRL"),
  billing: crmBillingSchema,
});
export type CrmProject = z.infer<typeof crmProjectSchema>;

export const crmClientAreaSchema = z.object({
  crmAreaId: z.number().int().optional(),
  name: z.string().min(1),
});
export type CrmClientArea = z.infer<typeof crmClientAreaSchema>;

export const crmClientSchema = z.object({
  crmClientId: z.number().int().optional(),
  document: cnpjDocument,
  name: z.string().min(1),
  size: z.string().optional(),
  clientArea: crmClientAreaSchema.optional(),
});
export type CrmClient = z.infer<typeof crmClientSchema>;

export const crmAccountExecutiveSchema = z.object({
  crmUserId: z.number().int().optional(),
  email: z.email(),
  name: z.string().optional(),
});
export type CrmAccountExecutive = z.infer<typeof crmAccountExecutiveSchema>;

export const crmPlannedProfileSchema = z.object({
  crmLineId: z.number().int().optional(),
  // Origin label only (no JobRole catalog in JumpFlow, D6) — optional.
  jobRoleSlug: z.string().optional(),
  // Target: ProjectPlannedProfile.roleName (free text).
  jobRoleName: z.string().optional(),
  seniority: z.string().min(1),
  quantity: z.number().int().nonnegative(),
  budgetHours: z.number().nonnegative(),
  saleUnitValue: z.number().nonnegative(),
  saleLineValue: z.number().nonnegative(),
});
export type CrmPlannedProfile = z.infer<typeof crmPlannedProfileSchema>;

export const crmProjectPayloadSchema = z.object({
  schemaVersion: z.literal(CRM_CONTRACT_SCHEMA_VERSION),
  eventType: crmEventTypeSchema,
  idempotencyKey: z.string().min(1),
  occurredAt: isoDateTime,
  revision: z.number().int().min(1),
  correlation: crmCorrelationSchema,
  project: crmProjectSchema,
  client: crmClientSchema,
  accountExecutive: crmAccountExecutiveSchema,
  // May legitimately arrive empty (cancelled / NO_TIMESHEET).
  plannedProfiles: z.array(crmPlannedProfileSchema).default([]),
});

export type CrmProjectPayload = z.infer<typeof crmProjectPayloadSchema>;
