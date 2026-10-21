import { requireRole } from "@/lib/auth/guards";
import { RECEIVABLES_ROLES } from "@/lib/auth/route-permissions";
import { SUBSCREEN_CODES } from "@/lib/auth/permission-codes";
import { can } from "@/lib/auth/permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { xlsxResponse } from "@/lib/export/xlsx";
import { apuracaoFilterSchema } from "@/lib/financial/receivables-journey-core";
import {
  noDatabaseResponse,
  invalidInputResponse,
  rangeSlug,
} from "../../../relatorios/shared";

export const dynamic = "force-dynamic";

/** 403 quando a matriz nega a subtela que este export serve. */
function forbiddenResponse(): Response {
  return new Response("FORBIDDEN", {
    status: 403,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * `.xlsx` export da Tela de Apuração (Contas a Receber, Wave C / item 6). Recheca
 * RECEIVABLES_ROLES (mesmo gate da página), parseia os MESMOS filtros
 * da jornada com PERÍODO OBRIGATÓRIO (`apuracaoFilterSchema`: from/to exigidos +
 * cliente + projetos; sem período → invalidInputResponse, nunca all-time) e reusa
 * a MESMA leitura `getReceivablesApuracao` — o escopo/RBAC e o `includeFinancials`
 * são recomputados a partir do usuário real, então um hint na query nunca amplia
 * o recorte. Serializa via `buildApuracaoWorkbook`. Audita
 * `RECEIVABLES_APURACAO_EXPORTED` com o filtro usado.
 */
export async function GET(request: Request) {
  const user = await requireRole(RECEIVABLES_ROLES);
  // Subtela da matriz: sem `view` em Contas a Receber (Apuração), o export recusa (403).
  if (!(await can(SUBSCREEN_CODES.finance.receivables, "view"))) {
    return forbiddenResponse();
  }
  if (!isDatabaseConfigured()) return noDatabaseResponse();

  const searchParams = new URL(request.url).searchParams;
  const parsed = apuracaoFilterSchema.safeParse({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    clientId: searchParams.get("clientId") ?? undefined,
    projectIds: searchParams.getAll("projectIds"),
  });
  if (!parsed.success) return invalidInputResponse();
  const filter = parsed.data;

  const { getReceivablesApuracao, buildApuracaoWorkbook } = await import(
    "@/lib/financial/receivables-journey"
  );
  const apuracao = await getReceivablesApuracao(user, filter);
  const buffer = await buildApuracaoWorkbook(apuracao);

  const slug = rangeSlug(filter.from, filter.to);

  const { resolveDbUser } = await import("@/lib/db/users");
  const { recordAuditEvent } = await import("@/lib/db/audit");
  const dbUser = await resolveDbUser(user);
  await recordAuditEvent({
    actorUserId: dbUser?.id ?? null,
    entityType: "RevenueClosing",
    entityId: slug,
    action: "RECEIVABLES_APURACAO_EXPORTED",
    after: {
      filter,
      includeFinancials: apuracao.includeFinancials,
      projectCount: apuracao.projects.length,
    },
  });

  return xlsxResponse(buffer, `apuracao_${slug}.xlsx`);
}
