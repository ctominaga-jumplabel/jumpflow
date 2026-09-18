import type { Metadata } from "next";
import { HorasScreen } from "../screen";

export const metadata: Metadata = { title: "Horas · nova" };

interface HorasNovaPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Horas — ALIAS histórico da direção Operational Minimal.
 *
 * Essa direção virou o default e agora é servida em `/app/horas`; esta rota
 * continua resolvendo (mesmo componente, mesmos dados, mesmas server actions)
 * apenas para não quebrar links e favoritos já espalhados. O gate vem do código
 * HORAS do item de menu, que `findActiveNav` resolve por prefixo — a rota não
 * afrouxa nada, e o `requireUser` + as travas de alocação seguem no lugar.
 */
export default async function HorasNovaPage({
  searchParams,
}: HorasNovaPageProps) {
  return <HorasScreen searchParams={searchParams} presentation="quiet" />;
}
