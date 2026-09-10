"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { opsLabel, opsNum } from "@/lib/styles";
import type { ApprovalItem } from "@/lib/mock-data/approvals";

/**
 * Estado de um dia no mapa. A ordem importa: quando um consultor tem mais de um
 * item no mesmo dia, o estado de MAIOR precedência vence, porque o mapa existe
 * para achar o que precisa de ação — um dia com uma pendência entre cinco
 * aprovações continua sendo um dia pendente.
 */
type DayState = "pending" | "rejected" | "approved" | "auto" | "empty";

const PRECEDENCE: DayState[] = [
  "pending",
  "rejected",
  "auto",
  "approved",
  "empty",
];

/*
 * Preenchimento das células. Usa os tokens de BLOCO (acentos vivos), não os
 * tons semânticos de texto: `--warning` (#92400e) e `--success` (#166534) são
 * escurecidos para ler como texto sobre os fundos `-soft`, e viram um marrom
 * e um verde sujos quando aplicados como área. A regra é a mesma do design
 * system — acento preenche, tom semântico escreve.
 */
const stateStyles: Record<DayState, string> = {
  pending: "bg-ops-accent",
  rejected: "bg-danger",
  approved: "bg-flow",
  auto: "bg-brand",
  empty: "bg-surface-muted",
};

const stateLabels: Record<DayState, string> = {
  pending: "Pendente",
  rejected: "Reprovado",
  approved: "Aprovado",
  auto: "Auto-aprovado",
  empty: "Sem item",
};

export interface MonthHeatmapProps {
  items: ApprovalItem[];
  /** Mês exibido, formato `yyyy-mm`. */
  month: string;
  /** Chamado ao clicar num consultor (filtra a fila abaixo). */
  onSelectConsultant?: (consultantName: string) => void;
  /** Consultor atualmente filtrado, para destacar a linha. */
  selectedConsultant?: string;
  className?: string;
}

function stateOf(item: ApprovalItem): DayState {
  if (item.status === "PENDING") return "pending";
  if (item.status === "REJECTED") return "rejected";
  if (item.status === "AUTO_APPROVED") return "auto";
  return "approved";
}

/**
 * `submittedAt` é um ISO datetime em UTC. O mapa é por DIA de calendário local
 * (o gestor pensa em "dia 9"), então convertemos uma vez aqui em vez de fatiar
 * a string — `"2026-09-09T23:30:00Z"` é dia 10 em UTC-3 e fatiar erraria a
 * coluna.
 */
function dayOfMonth(iso: string): number | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getDate();
}

function monthKeyOf(iso: string): string | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Mapa do mês: uma linha por consultor, uma coluna por dia, cor por estado.
 *
 * Responde "quem está pendente e desde quando" antes de qualquer scroll — a
 * pergunta que hoje só se responde percorrendo a fila item a item. Não
 * substitui a fila: é o índice dela, e clicar numa linha filtra a lista abaixo.
 *
 * O estado NUNCA depende só da cor: cada célula carrega `title` com consultor,
 * dia e estado por extenso, e a legenda nomeia cada cor (WCAG 1.4.1).
 */
export function MonthHeatmap({
  items,
  month,
  onSelectConsultant,
  selectedConsultant,
  className,
}: MonthHeatmapProps) {
  const { rows, daysInMonth } = useMemo(() => {
    const [yearPart, monthPart] = month.split("-");
    const year = Number(yearPart);
    const monthIndex = Number(monthPart) - 1;
    // Dia 0 do mês seguinte = último dia deste mês. Cobre fevereiro/bissexto
    // sem tabela de tamanhos.
    const total =
      Number.isFinite(year) && Number.isFinite(monthIndex)
        ? new Date(year, monthIndex + 1, 0).getDate()
        : 31;

    const byConsultant = new Map<string, DayState[]>();
    for (const item of items) {
      if (monthKeyOf(item.submittedAt) !== month) continue;
      const day = dayOfMonth(item.submittedAt);
      if (day === null || day < 1 || day > total) continue;
      let days = byConsultant.get(item.consultantName);
      if (!days) {
        days = Array.from({ length: total }, () => "empty" as DayState);
        byConsultant.set(item.consultantName, days);
      }
      const next = stateOf(item);
      const current = days[day - 1];
      if (PRECEDENCE.indexOf(next) < PRECEDENCE.indexOf(current)) {
        days[day - 1] = next;
      }
    }

    return {
      daysInMonth: total,
      rows: [...byConsultant.entries()]
        .map(([name, days]) => ({
          name,
          days,
          pending: days.filter((d) => d === "pending").length,
        }))
        // Quem tem mais pendência sobe: a primeira linha é a que pede ação.
        .sort((a, b) => b.pending - a.pending || a.name.localeCompare(b.name)),
    };
  }, [items, month]);

  if (rows.length === 0) {
    return (
      <p className={cn("px-5 py-8 text-center text-sm text-soft", className)}>
        Nenhum item enviado neste mês.
      </p>
    );
  }

  return (
    <div className={cn("px-5 py-4", className)}>
      <div className="overflow-x-auto">
        <div className="min-w-[560px] space-y-1.5">
          <div className="flex items-center gap-2 bg-surface">
            <span className="sticky left-0 z-10 w-32 shrink-0 bg-inherit" />
            <div
              className="grid flex-1 gap-[3px]"
              style={{
                gridTemplateColumns: `repeat(${daysInMonth}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: daysInMonth }, (_, index) => (
                <span
                  key={index}
                  aria-hidden="true"
                  className={cn(
                    "text-center text-[9px] leading-none text-soft",
                    opsNum,
                  )}
                >
                  {index + 1}
                </span>
              ))}
            </div>
          </div>

          {rows.map((row) => {
            const selected = selectedConsultant === row.name;
            const cells = (
              <div
                className="grid flex-1 gap-[3px]"
                style={{
                  gridTemplateColumns: `repeat(${daysInMonth}, minmax(0, 1fr))`,
                }}
              >
                {row.days.map((state, index) => (
                  <span
                    key={index}
                    title={`${row.name} · dia ${index + 1} · ${stateLabels[state]}`}
                    className={cn(
                      "aspect-square rounded-[3px]",
                      stateStyles[state],
                    )}
                  />
                ))}
              </div>
            );

            const label = (
              <span className="sticky left-0 z-10 flex w-32 shrink-0 items-center gap-1.5 truncate bg-inherit pr-2 text-xs text-strong">
                <span className="truncate">{row.name}</span>
                {row.pending > 0 ? (
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full bg-warning"
                  />
                ) : null}
              </span>
            );

            if (!onSelectConsultant) {
              return (
                <div
                  key={row.name}
                  className="flex items-center gap-2 bg-surface"
                >
                  {label}
                  {cells}
                </div>
              );
            }

            return (
              <button
                key={row.name}
                type="button"
                onClick={() =>
                  onSelectConsultant(selected ? "" : row.name)
                }
                aria-pressed={selected}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors",
                  "outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  // Fundo explícito: o rótulo fixo herda daqui, então a cor
                  // precisa existir (transparente deixaria as células
                  // passarem por baixo do nome ao rolar).
                  selected
                    ? "bg-brand-soft"
                    : "bg-surface hover:bg-surface-muted",
                )}
              >
                {label}
                {cells}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className={opsLabel}>Legenda</span>
        {(["pending", "approved", "auto", "rejected", "empty"] as const).map(
          (state) => (
            <span
              key={state}
              className="inline-flex items-center gap-1.5 text-xs text-medium"
            >
              <span
                aria-hidden="true"
                className={cn("size-2.5 rounded-full", stateStyles[state])}
              />
              {stateLabels[state]}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
