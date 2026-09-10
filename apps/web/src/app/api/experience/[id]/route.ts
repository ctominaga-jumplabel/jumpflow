/**
 * BFF: Experience Pack de uma versão explícita.
 *
 * `version` é obrigatória por decisão de contrato: consumidor de produção fixa
 * versão, e subir de versão é uma decisão, não um efeito de republish alheio.
 */

import { NextResponse } from "next/server";
import { getPack, registrySource } from "@/lib/experience/registry";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const experienceId = Number.parseInt(id, 10);
  const version = Number.parseInt(url.searchParams.get("version") ?? "", 10);
  if (!Number.isInteger(experienceId) || experienceId <= 0) {
    return NextResponse.json({ erro: "id inválido" }, { status: 400 });
  }
  if (!Number.isInteger(version) || version <= 0) {
    return NextResponse.json(
      { erro: "informe ?version=<n> (versão explícita)" },
      { status: 400 },
    );
  }
  const data = await getPack(experienceId, version);
  if (!data) {
    return NextResponse.json(
      { erro: `experiência ${experienceId} v${version} não disponível (${registrySource().detail})` },
      { status: 404 },
    );
  }
  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
