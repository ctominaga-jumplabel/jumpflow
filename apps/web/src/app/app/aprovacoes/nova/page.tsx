import type { Metadata } from "next";
import { AprovacoesScreen } from "../screen";

export const metadata: Metadata = { title: "Aprovações · nova" };

interface AprovacoesNovaPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Aprovações — tratamento Operational Minimal, em validação.
 *
 * Mesma tela de `/app/aprovacoes` (mesmo componente, mesmos dados, mesmas
 * server actions), servida com `presentation="quiet"`. O gate de rota é o
 * prefixo `/app/aprovacoes` na matriz de permissões e o código APROVACOES do
 * item de menu, que `findActiveNav` resolve por prefixo — a rota nova não
 * afrouxa nada.
 */
export default async function AprovacoesNovaPage({
  searchParams,
}: AprovacoesNovaPageProps) {
  return <AprovacoesScreen searchParams={searchParams} presentation="quiet" />;
}
