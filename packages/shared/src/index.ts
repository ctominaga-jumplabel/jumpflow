export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "JumpFlow";

export const roleNames = [
  "ADMIN",
  "CONSULTANT",
  "PROJECT_MANAGER",
  "AREA_MANAGER",
  "FINANCE",
  "PEOPLE",
  "SALES",
] as const;

export type RoleName = (typeof roleNames)[number];

export const seniorities = [
  "INTERN",
  "JUNIOR",
  "MID_LEVEL",
  "SENIOR",
  "SPECIALIST",
  "PRINCIPAL",
] as const;

export type Seniority = (typeof seniorities)[number];

export const projectStatuses = ["PROPOSAL", "ACTIVE", "PAUSED", "CLOSED"] as const;

export type ProjectStatus = (typeof projectStatuses)[number];

export const timeEntryStatuses = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "CLOSED",
] as const;

export type TimeEntryStatus = (typeof timeEntryStatuses)[number];

