"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { OnBehalfPickerData } from "@/lib/db/on-behalf";

export interface OnBehalfConsultantPickerProps {
  /** Consultores + projetos + grafo de alocação para a cascata client-side. */
  data: OnBehalfPickerData;
  /** Consultor-alvo atualmente selecionado (query param), se houver. */
  selectedId?: string;
  /** Rótulo da opção "sem alvo" (ex.: "Meus lançamentos" ou "Selecionar…"). */
  selfLabel: string;
  /** Nome do query param que carrega o alvo. */
  paramName?: string;
  /** Texto curto de contexto exibido no painel. */
  hint?: string;
}

/**
 * Seletor "Lançar em nome de": um Gestor de Área/Admin escolhe um consultor e a
 * tela passa a operar a grade DELE (a página lê o query param no servidor,
 * carrega os dados do alvo e coloca o editor em modo on-behalf).
 *
 * FILTRO CONJUNTO (client-side): um campo "Projeto" afunila a lista de
 * Consultor NA SELEÇÃO — escolher um projeto deixa no seletor apenas quem tem
 * alocação ativa nele, sem recarregar a página. Só ao escolher o CONSULTOR a
 * tela navega (troca `?consultor=`) e carrega a grade dele. O projeto aqui é só
 * um auxílio para achar a pessoa; não altera os filtros do editor.
 */
export function OnBehalfConsultantPicker({
  data,
  selectedId,
  selfLabel,
  paramName = "consultor",
  hint,
}: OnBehalfConsultantPickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Projeto escolhido apenas para AFUNILAR a lista de consultores (client-side).
  const [projectFilter, setProjectFilter] = useState("");

  // Consultores por projeto (grafo), para a cascata.
  const consultantsByProject = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const a of data.allocations) {
      let set = map.get(a.projectId);
      if (!set) {
        set = new Set();
        map.set(a.projectId, set);
      }
      set.add(a.consultantId);
    }
    return map;
  }, [data.allocations]);

  // Lista de consultores exibida: afunilada pelo projeto, quando escolhido.
  const availableConsultants = useMemo(() => {
    if (!projectFilter) return data.consultants;
    const ids = consultantsByProject.get(projectFilter);
    if (!ids) return [];
    return data.consultants.filter((c) => ids.has(c.id));
  }, [data.consultants, projectFilter, consultantsByProject]);

  function selectConsultant(id: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (id) params.set(paramName, id);
    else params.delete(paramName);
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
        "Como Gestor de Área/Admin, você pode lançar horas e despesas por um consultor alocado. Filtre por projeto para achar quem está nele. A auditoria registra você como autor."
      }
    >
      <div className="flex flex-wrap items-end gap-3 px-5 py-4">
        <div className="min-w-56">
          <label
            htmlFor="on-behalf-project"
            className="mb-1 block text-xs font-semibold text-medium"
          >
            Projeto (filtra consultores)
          </label>
          <select
            id="on-behalf-project"
            value={projectFilter}
            disabled={isPending}
            onChange={(event) => setProjectFilter(event.target.value)}
            className={cn(
              "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-ink",
              focusRingInput,
              isPending && "opacity-60",
            )}
          >
            <option value="">Todos os projetos</option>
            {data.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-64">
          <label
            htmlFor="on-behalf-consultant"
            className="mb-1 block text-xs font-semibold text-medium"
          >
            Consultor
          </label>
          <select
            id="on-behalf-consultant"
            value={selectedId ?? ""}
            disabled={isPending}
            onChange={(event) => selectConsultant(event.target.value)}
            className={cn(
              "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-ink",
              focusRingInput,
              isPending && "opacity-60",
            )}
          >
            <option value="">{selfLabel}</option>
            {availableConsultants.map((consultant) => (
              <option key={consultant.id} value={consultant.id}>
                {consultant.name}
              </option>
            ))}
          </select>
        </div>

        {projectFilter ? (
          <p className="w-full text-xs font-semibold text-medium">
            Mostrando {availableConsultants.length} consultor(es) alocado(s) no
            projeto selecionado.
          </p>
        ) : null}
        {selectedId ? (
          <p className="w-full text-xs font-semibold text-medium">
            Lançando pelo consultor selecionado — a auditoria registra você como
            autor.
          </p>
        ) : null}
      </div>
    </SectionPanel>
  );
}
