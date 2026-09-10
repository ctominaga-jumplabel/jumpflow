import type { Metadata } from "next";
import { HorasScreen } from "../screen";

export const metadata: Metadata = { title: "Horas · nova" };

interface HorasNovaPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Horas — tratamento Operational Minimal, em validação.
 *
 * Mesma tela de `/app/horas` (mesmo componente, mesmos dados, mesmas server
 * actions), servida com `presentation="quiet"`. O gate vem do código HORAS do
 * item de menu, que `findActiveNav` resolve por prefixo — a rota nova não
 * afrouxa nada, e o `requireUser` + as travas de alocação seguem no lugar.
 */
export default async function HorasNovaPage({
  searchParams,
}: HorasNovaPageProps) {
  return <HorasScreen searchParams={searchParams} presentation="quiet" />;
}
