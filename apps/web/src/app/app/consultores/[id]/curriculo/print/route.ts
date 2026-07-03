import { NextResponse } from "next/server";
import { prisma } from "@jumpflow/database";
import { requireRole } from "@/lib/auth/guards";
import type { RoleName } from "@/lib/auth/types";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  buildConsultantCurriculum,
  type ConsultantCurriculum,
} from "@/lib/consultants/curriculum";
import { renderCurriculumHtml } from "@/lib/consultants/curriculum-html";

const PEOPLE_ROLES: RoleName[] = ["ADMIN", "PEOPLE"];

/**
 * Versao imprimivel do curriculo (US-M06.04). Renderiza o curriculo ATUAL do
 * consultor, ou um SNAPSHOT congelado quando `?snapshot=<id>` e informado, em
 * HTML limpo para o usuario fazer "Imprimir -> Salvar como PDF" no navegador.
 * Sem lib de PDF. Gated a People. Sem dados financeiros.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireRole(PEOPLE_ROLES);
  if (!isDatabaseConfigured()) {
    return new NextResponse("Banco de dados nao configurado.", { status: 503 });
  }

  const { id } = await params;
  const snapshotId = new URL(request.url).searchParams.get("snapshot");

  let curriculum: ConsultantCurriculum | null = null;
  if (snapshotId) {
    const snapshot = await prisma.consultantCurriculumSnapshot.findFirst({
      where: { id: snapshotId, consultantId: id },
      select: { content: true },
    });
    if (snapshot) {
      curriculum = snapshot.content as unknown as ConsultantCurriculum;
    }
  } else {
    curriculum = await buildConsultantCurriculum(id);
  }

  if (!curriculum) {
    return new NextResponse("Curriculo nao encontrado.", { status: 404 });
  }

  return new NextResponse(renderCurriculumHtml(curriculum), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
