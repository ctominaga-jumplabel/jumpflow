import type { Metadata } from "next";
import { MailCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  EmailTemplatesView,
  type EmailTemplateEventView,
} from "@/components/admin/EmailTemplatesView";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { FLOW_PERMISSION_CODES } from "@/lib/auth/permission-codes";
import {
  TEMPLATE_GROUPS,
  isNotificationEventName,
  listTemplateDefinitions,
  type NotificationEventName,
} from "@/lib/automation/email/template-registry";
import type { TemplateVarValue } from "@/lib/automation/email/template-renderer";
import { isDatabaseConfigured } from "@/lib/db/config";

export const metadata: Metadata = { title: "Templates de E-mail" };
export const dynamic = "force-dynamic";

/**
 * Templates de e-mail por evento (`/app/admin/templates-email`, ITEM 3). Lê e
 * edita o e-mail enviado por cada regra/evento de notificação. Sem template
 * personalizado, o envio usa o e-mail padrão do sistema.
 */

/** Eventos que, sem regra, ainda vão ao destinatário natural (event-delivery). */
const NATURAL_TARGET_EVENTS = new Set<string>([
  "ACCESS_INVITE",
  "PRE_INVOICE_ISSUED",
  "NFSE_ISSUED",
  "PAYMENT_FORECAST",
  "CONSULTANT_INVOICE_REQUEST",
  "MISSING_TIMESHEET_REPORT",
]);
const FEED_EVENTS = new Set<string>(["FEED_POST_REPLIED", "FEED_CONTENT_REACTED", "FEED_MENTIONED"]);

const RECIPIENT_LABEL: Record<string, string> = {
  PROJECT_MANAGER: "Gestor do projeto",
  CLIENT_CONTACT: "Contato do cliente",
  EVENT_TARGET: "Destinatário do evento",
};

function exampleOf(value: TemplateVarValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  const firstLine = value.text.split("\n").find((l) => l.trim() !== "") ?? "";
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine;
}

interface RuleLike {
  event: string;
  scope: string;
  active: boolean;
  channel: string;
  recipients: Array<{ type: string; channel: string; address: string | null }>;
}

function rulesSummary(event: string, rules: RuleLike[]): string {
  const forEvent = rules.filter((r) => r.event === event);
  const active = forEvent.filter((r) => r.active);
  if (forEvent.length === 0) {
    if (FEED_EVENTS.has(event)) return "Sem regra ativa — e-mail desligado.";
    return NATURAL_TARGET_EVENTS.has(event)
      ? "Sem regra — vai ao destinatário natural."
      : "Sem regra — nada é enviado.";
  }
  if (active.length === 0) return "Regra inativa — e-mail desligado.";
  if (FEED_EVENTS.has(event)) return "Regra ativa — vai ao autor/mencionado.";
  const who = new Set<string>();
  for (const rule of active) {
    for (const rec of rule.recipients) {
      if (rec.channel !== "EMAIL") continue;
      who.add(rec.address ?? RECIPIENT_LABEL[rec.type] ?? rec.type);
    }
  }
  const list = Array.from(who);
  if (list.length === 0) return "Regra ativa sem destinatário de e-mail.";
  const shown = list.slice(0, 4).join(", ");
  return `${active.length > 1 ? `${active.length} regras · ` : ""}${shown}${
    list.length > 4 ? ` +${list.length - 4}` : ""
  }`;
}

export default async function TemplatesEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>;
}) {
  await requirePermission(FLOW_PERMISSION_CODES.emailTemplates, "view");
  const canEdit = await can(FLOW_PERMISSION_CODES.emailTemplates, "edit");
  const { evento } = await searchParams;

  const header = (
    <PageHeader
      eyebrow="Administração"
      title="Templates de E-mail"
      description="Leia e edite o e-mail enviado em cada evento de notificação. Sem personalização, vale o e-mail padrão do sistema."
    />
  );

  if (!isDatabaseConfigured()) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={MailCheck}
          title="Banco não configurado"
          description="Os templates personalizados são persistidos no banco. Configure a conexão para administrá-los."
        />
      </div>
    );
  }

  const [{ listEmailTemplates }, { listNotificationRules }] = await Promise.all([
    import("@/lib/db/email-templates"),
    import("@/lib/db/notification-rules"),
  ]);
  const [templates, rules] = await Promise.all([
    listEmailTemplates().catch((error) => {
      console.error("[templates-email] list failed", error);
      return [];
    }),
    listNotificationRules().catch(() => []),
  ]);
  const byEvent = new Map(templates.map((t) => [t.event, t]));

  const events: EmailTemplateEventView[] = listTemplateDefinitions().map((def) => {
    const custom = byEvent.get(def.event) ?? null;
    const base = {
      event: def.event,
      label: def.label,
      group: def.group,
      description: def.description,
      audience: def.audience,
      rulesSummary: rulesSummary(def.event, rules),
    };
    if (!def.sendsEmail) {
      return { ...base, sendsEmail: false as const, reason: def.reason };
    }
    const sample = def.sampleVars();
    return {
      ...base,
      sendsEmail: true as const,
      brand: def.brand,
      defaultSubject: def.defaultSubject,
      defaultBody: def.defaultBody,
      variables: def.variables.map((v) => ({ ...v, example: exampleOf(sample[v.key]) })),
      custom: custom
        ? {
            subject: custom.subject,
            body: custom.body,
            active: custom.active,
            updatedAt: custom.updatedAt,
            updatedByName: custom.updatedByName,
          }
        : null,
    };
  });

  const initialEvent: NotificationEventName =
    evento && isNotificationEventName(evento) ? evento : "HOURS_RELEASED";

  return (
    <div className="space-y-6">
      {header}
      <EmailTemplatesView
        events={events}
        groups={[...TEMPLATE_GROUPS]}
        initialEvent={initialEvent}
        canEdit={canEdit}
      />
    </div>
  );
}
