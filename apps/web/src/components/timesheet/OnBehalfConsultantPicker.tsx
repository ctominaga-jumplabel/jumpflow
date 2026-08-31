"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";

export interface OnBehalfConsultantPickerProps {
  /** Consultores selecionáveis (ativos com alocação ativa). */
  consultants: { id: string; name: string }[];
  /** Consultor-alvo atualmente selecionado (query param), se houver. */
  selectedId?: string;
  /** Rótulo da opção "sem alvo" (ex.: "Meus lançamentos" ou "Selecionar…"). */
  selfLabel: string;
  /** Nome do query param que carrega o alvo. */
  paramName?: string;
  /** Texto curto de contexto exibido ao lado do seletor. */
  hint?: string;
}

/**
 * Seletor "Lançar em nome de": um Gestor de Área/Admin escolhe um consultor e a
 * tela passa a operar a grade/lista DELE (a página lê o query param no servidor,
 * carrega os dados do alvo e coloca o editor em modo on-behalf). Selecionar a
 * opção "sem alvo" limpa o param e volta ao editor do próprio usuário.
 *
 * Navega trocando só o query param (preserva os demais); a mudança de semana,
 * filtros etc. continuam funcionando por cima da seleção.
 */
export function OnBehalfConsultantPicker({
  consultants,
  selectedId,
  selfLabel,
  paramName = "consultor",
  hint,
}: OnBehalfConsultantPickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function selectConsultant(id: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (id) params.set(paramName, id);
    else params.delete(paramName);
    // Trocar de consultor reinicia a paginação/edição contextual da tela.
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  return (
    <SectionPanel
      title="Lançar em nome de"
      description={
        hint ??
        "Como Gestor de Área/Admin, você pode lançar horas e despesas por um consultor alocado. Ele precisa estar no projeto para o lançamento ser aceito."
      }
    >
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <label htmlFor="on-behalf-consultant" className="sr-only">
          Consultor
        </label>
        <select
          id="on-behalf-consultant"
          value={selectedId ?? ""}
          disabled={isPending}
          onChange={(event) => selectConsultant(event.target.value)}
          className={cn(
            "min-w-64 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-ink",
            focusRingInput,
            isPending && "opacity-60",
          )}
        >
          <option value="">{selfLabel}</option>
          {consultants.map((consultant) => (
            <option key={consultant.id} value={consultant.id}>
              {consultant.name}
            </option>
          ))}
        </select>
        {selectedId ? (
          <span className="text-xs font-semibold text-medium">
            Lançando pelo consultor selecionado — a auditoria registra você como
            autor.
          </span>
        ) : null}
      </div>
    </SectionPanel>
  );
}
