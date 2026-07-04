import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import { getConsultantForUser } from "@/lib/db/timesheet";
import { buildConsultantCurriculum } from "@/lib/consultants/curriculum";
import { renderCurriculumHtml } from "@/lib/consultants/curriculum-html";

/**
 * Versao imprimivel do PROPRIO curriculo (EP-M06 / US-M06.03), servida em
 * /app/skills para que o perfil CONSULTANT consiga imprimir (a rota de RH vive
 * sob /app/consultores, que o consultor nao acessa).
 *
 * SEGURANCA: route handlers NAO passam pelo gate do layout do app, entao o
 * guard e feito aqui — requireUser + resolucao do consultor DO PROPRIO usuario
 * (Consultant.userId == currentUser.id). Nao existe parametro de id: e sempre o
 * dono. Sem snapshots (RH-only). Sem dados financeiros (o agregador ja garante).
 */
export async function GET() {
  const user = await requireUser();
  if (!isDatabaseConfigured()) {
    return new NextResponse("Banco de dados nao configurado.", { status: 503 });
  }

  const consultant = await getConsultantForUser(user);
  if (!consultant) {
    return new NextResponse("Voce nao possui um cadastro de consultor.", {
      status: 404,
    });
  }

  const curriculum = await buildConsultantCurriculum(consultant.id);
  if (!curriculum) {
    return new NextResponse("Curriculo nao encontrado.", { status: 404 });
  }

  return new NextResponse(renderCurriculumHtml(curriculum), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
