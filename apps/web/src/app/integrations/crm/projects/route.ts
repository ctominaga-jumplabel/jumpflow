import { NextResponse } from "next/server";
import { authorizeCrmM2M } from "@/lib/integrations/crm/m2m-auth";
import {
  CRM_CONTRACT_SCHEMA_VERSION,
  crmProjectPayloadSchema,
} from "@/lib/integrations/crm/contract";
import { ingestCrmProject } from "@/lib/integrations/crm/ingest";

/**
 * CRM-Jumplabel → JumpFlow project ingestion (contrato v1 §2).
 *
 * Endpoint: `POST /integrations/crm/projects` — deliberately OUTSIDE `/app/*`
 * (not covered by `proxy.ts`) and OUTSIDE `/api` (literal path from the
 * contract). The M2M guard is the only gate here.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // 1) M2M authorization (OAuth client-credentials / Entra resource server).
  const auth = await authorizeCrmM2M(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // 2) Parse the JSON body (malformed body ⇒ 400).
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // 3) Validate against the frozen v1 contract.
  const parsed = crmProjectPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const payload = parsed.data;

  // 4) Hand off to the ingestion seam and build the standard ACK (§1.1).
  try {
    const outcome = await ingestCrmProject(payload);

    const ack = {
      schemaVersion: CRM_CONTRACT_SCHEMA_VERSION,
      received: true,
      idempotencyKey: payload.idempotencyKey,
      correlation: {
        commercialContractRef: payload.correlation.commercialContractRef,
      },
      result: outcome.result,
      targetId: outcome.targetId,
      warnings: outcome.warnings,
    };

    // DUPLICATE ⇒ 409 (contrato §1: 409 = duplicado, o CRM trata como sucesso).
    // Every other result ⇒ 200. Both carry the ACK body.
    const status = outcome.result === "DUPLICATE" ? 409 : 200;
    return NextResponse.json(ack, { status });
  } catch (error) {
    console.error("[integrations:crm:projects] ingest failed", error);
    return NextResponse.json(
      { received: false, error: "internal_error" },
      { status: 500 },
    );
  }
}
