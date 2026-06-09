import { prisma } from "@jumpflow/database";
import {
  DEFAULT_AUTO_APPROVAL_SETTINGS,
  parseRecipients,
  type AutoApprovalSettings,
} from "@jumpflow/shared";
import { isDatabaseConfigured } from "@/lib/db/config";

/** Effective automation configuration for a job run. */
export interface AutomationRuntimeConfig {
  autoApprovalEnabled: boolean;
  settings: AutoApprovalSettings;
  reportRecipients: string[];
}

/**
 * Load the singleton {@link AutomationConfig} (upserting the default row) and
 * merge it with code defaults and env fallbacks. Without a database, returns
 * safe defaults so callers (guarded separately) don't crash.
 *
 * Recipients precedence: the DB config list overrides the env. When the DB list
 * parses to empty (unset/blank/garbage), we fall back to AUTOMATION_REPORT_EMAIL.
 */
export async function loadAutomationConfig(): Promise<AutomationRuntimeConfig> {
  const envRecipients = parseRecipients(process.env.AUTOMATION_REPORT_EMAIL);

  if (!isDatabaseConfigured()) {
    return {
      autoApprovalEnabled: true,
      settings: DEFAULT_AUTO_APPROVAL_SETTINGS,
      reportRecipients: envRecipients,
    };
  }

  const row = await prisma.automationConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  const dbRecipients = parseRecipients(row.reportRecipientEmail);

  return {
    autoApprovalEnabled: row.autoApprovalEnabled,
    settings: {
      approvalDelayMinutes: row.approvalDelayMinutes,
      requiredDailyMinutes: row.requiredDailyMinutes,
      maxEntryHours: DEFAULT_AUTO_APPROVAL_SETTINGS.maxEntryHours,
    },
    reportRecipients: dbRecipients.length > 0 ? dbRecipients : envRecipients,
  };
}
