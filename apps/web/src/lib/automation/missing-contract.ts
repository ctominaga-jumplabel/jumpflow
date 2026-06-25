/**
 * Missing commercial contract sweep (ADR 0002 Fase 1 / tema 6.2).
 *
 * Finds ACTIVE projects without a commercialContractRef and emits
 * COMMERCIAL_CONTRACT_MISSING to the configured recipients (Comercial). One
 * digest listing all missing projects. Recurring: dedupeKey = run date.
 */
import { prisma } from "@jumpflow/database";
import { buildContratosAusentesEmail } from "@/lib/automation/email/templates";
import { isDatabaseConfigured } from "@/lib/db/config";
import { emitNotification } from "./notifications/emit";

export interface RunMissingContractResult {
  projects: number;
  sent: number;
  skipped: number;
  failed: number;
}

export async function runMissingContractSweep(input: {
  now: Date;
  appUrl?: string;
}): Promise<RunMissingContractResult> {
  const empty = { projects: 0, sent: 0, skipped: 0, failed: 0 };
  if (!isDatabaseConfigured()) return empty;

  const rows = await prisma.project.findMany({
    where: { status: "ACTIVE", commercialContractRef: null },
    orderBy: { name: "asc" },
    select: { name: true, client: { select: { name: true } } },
  });
  if (rows.length === 0) return empty;

  const projects = rows.map((r) => ({
    projectName: r.name,
    clientName: r.client?.name ?? "—",
  }));
  const dedupeKey = input.now.toISOString().slice(0, 10);

  const result = await emitNotification({
    event: "COMMERCIAL_CONTRACT_MISSING",
    scope: { type: "GLOBAL" },
    context: {},
    dedupeKey,
    buildFragment: (recipient) => {
      const built = buildContratosAusentesEmail({
        recipientName: recipient.name ?? "equipe",
        projects,
        appUrl: input.appUrl,
      });
      return {
        recipient,
        title: built.subject,
        prebuilt: built,
        teamsText: `${projects.length} projeto(s) sem contrato comercial.`,
      };
    },
  });

  return { projects: projects.length, ...result };
}
