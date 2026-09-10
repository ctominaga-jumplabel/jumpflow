/**
 * BFF: lista de experiências publicadas no Jump Value.
 *
 * Existe para o navegador não falar com o Jump Value direto (CORS + sessão) e
 * para o token de leitura ficar no servidor. Só GET, só dado público de tema.
 */

import { NextResponse } from "next/server";
import { listPublished, registrySource } from "@/lib/experience/registry";

export async function GET() {
  const data = await listPublished();
  if (!data) {
    return NextResponse.json(
      { experiencias: [], erro: registrySource().detail },
      { status: 503 },
    );
  }
  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
