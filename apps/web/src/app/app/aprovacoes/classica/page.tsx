import type { Metadata } from "next";
import { AprovacoesScreen } from "../screen";

export const metadata: Metadata = { title: "Aprovações · clássica" };

interface AprovacoesClassicaPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Aprovações — tratamento clássico (Playful Ops), agora fora da rota principal.
 *
 * A direção "Nova" (Operational Minimal) passou a ser o DEFAULT em
 * `/app/aprovacoes`; a clássica continua servida aqui enquanto a comparação
 * lado a lado existir. Mesmo componente, mesmos dados, mesmas server actions.
 */
export default async function AprovacoesClassicaPage({
  searchParams,
}: AprovacoesClassicaPageProps) {
  return <AprovacoesScreen searchParams={searchParams} presentation="brutal" />;
}
