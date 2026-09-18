import type { Metadata } from "next";
import { AprovacoesScreen } from "../screen";

export const metadata: Metadata = { title: "Aprovações · nova" };

interface AprovacoesNovaPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Aprovações — ALIAS histórico da direção Operational Minimal.
 *
 * Essa direção virou o default e agora é servida em `/app/aprovacoes`; esta
 * rota continua resolvendo apenas para não quebrar links e favoritos.
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
