import type { Metadata } from "next";
import { AprovacoesScreen } from "./screen";

export const metadata: Metadata = { title: "Aprovações" };

interface AprovacoesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Aprovações — tratamento clássico (Playful Ops). A tela vive em `./screen`,
 * compartilhada com `/app/aprovacoes/nova`, para que a validação lado a lado
 * compare visual e não comportamento.
 */
export default async function AprovacoesPage({
  searchParams,
}: AprovacoesPageProps) {
  return <AprovacoesScreen searchParams={searchParams} presentation="brutal" />;
}
