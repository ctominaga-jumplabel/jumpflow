import { prisma } from "@jumpflow/database";
import {
  DEFAULT_AUTO_APPROVAL_SETTINGS,
  type AutoApprovalSettings,
} from "@jumpflow/shared";
import { isDatabaseConfigured } from "@/lib/db/config";

/** Effective automation configuration for a job run. */
export interface AutomationRuntimeConfig {
  autoApprovalEnabled: boolean;
  settings: AutoApprovalSettings;
  reportRecipientEmail: string | null;
}

/**
 * Load the singleton {@link AutomationConfig} (upserting the default row) and
 * merge it with code defaults and env fallbacks. Without a database, returns
 * safe defaults so callers (guarded separately) don't crash.
 */
export async function loadAutomationConfig(): Promise<AutomationRuntimeConfig> {
  const envRecipient = process.env.AUTOMATION_REPORT_EMAIL?.trim() || null;

  if (!isDatabaseConfigured()) {
    return {
      autoApprovalEnabled: true,
      settings: DEFAULT_AUTO_APPROVAL_SETTINGS,
      reportRecipientEmail: envRecipient,
    };
  }

  const row = await prisma.automationConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  return {
    autoApprovalEnabled: row.autoApprovalEnabled,
    settings: {
      approvalDelayMinutes: row.approvalDelayMinutes,
      requiredDailyMinutes: row.requiredDailyMinutes,
      maxEntryHours: DEFAULT_AUTO_APPROVAL_SETTINGS.maxEntryHours,
    },
    reportRecipientEmail: row.reportRecipientEmail ?? envRecipient,
  };
}
