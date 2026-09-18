import type { Metadata } from "next";
import { HorasScreen } from "../screen";

export const metadata: Metadata = { title: "Horas · clássica" };

interface HorasClassicaPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Horas — tratamento clássico (Playful Ops), agora fora da rota principal.
 *
 * A direção "Nova" (Operational Minimal) passou a ser o DEFAULT em `/app/horas`;
 * a clássica continua servida aqui para a comparação lado a lado enquanto o
 * andaime de validação (`ViewSwitch`) existir. Mesmo componente, mesmos dados e
 * mesmas server actions — só `presentation` muda.
 */
export default async function HorasClassicaPage({
  searchParams,
}: HorasClassicaPageProps) {
  return <HorasScreen searchParams={searchParams} presentation="brutal" />;
}
