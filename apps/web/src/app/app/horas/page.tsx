import type { Metadata } from "next";
import { HorasScreen } from "./screen";

export const metadata: Metadata = { title: "Horas" };

interface HorasPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Horas — tratamento clássico (Playful Ops). A tela vive em `./screen`,
 * compartilhada com `/app/horas/nova`, para que a validação lado a lado compare
 * visual e não comportamento.
 */
export default async function HorasPage({ searchParams }: HorasPageProps) {
  return <HorasScreen searchParams={searchParams} presentation="brutal" />;
}
