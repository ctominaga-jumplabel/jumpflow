import { requireRole } from "@/lib/auth/guards";
import { FINANCIAL_ROLES } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { xlsxResponse } from "@/lib/export/xlsx";
import { apuracaoFilterSchema } from "@/lib/financial/receivables-journey-core";
import {
  noDatabaseResponse,
  invalidInputResponse,
  rangeSlug,
} from "../../../relatorios/shared";

export const dynamic = "force-dynamic";

/**
 * `.xlsx` export da Tela de Apuração (Contas a Receber, Wave C / item 6). Recheca
 * FINANCIAL_ROLES (mesmo gate da página e da action), parseia os MESMOS filtros
 * da jornada com PERÍODO OBRIGATÓRIO (`apuracaoFilterSchema`: from/to exigidos +
 * cliente + projetos; sem período → invalidInputResponse, nunca all-time) e reusa
 * a MESMA leitura `getReceivablesApuracao` — o escopo/RBAC e o `includeFinancials`
 * são recomputados a partir do usuário real, então um hint na query nunca amplia
 * o recorte. Serializa via `buildApuracaoWorkbook`. Audita
 * `RECEIVABLES_APURACAO_EXPORTED` com o filtro usado.
 */
export async function GET(request: Request) {
  const user = await requireRole(FINANCIAL_ROLES);
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
