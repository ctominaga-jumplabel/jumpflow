import type { Metadata } from "next";
import { AprovacoesScreen } from "./screen";

export const metadata: Metadata = { title: "Aprovações" };

interface AprovacoesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Aprovações — rota principal, servindo a direção "Nova" (Operational Minimal),
 * que passou a ser o DEFAULT. A tela vive em `./screen`, compartilhada com
 * `/app/aprovacoes/classica` e com o alias `/app/aprovacoes/nova`, para que a
 * validação lado a lado compare visual e não comportamento.
 */
export default async function AprovacoesPage({
  searchParams,
}: AprovacoesPageProps) {
  return <AprovacoesScreen searchParams={searchParams} presentation="quiet" />;
}
