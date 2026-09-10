import { cn } from "@/lib/utils";
import { opsLabel, opsNum } from "@/lib/styles";

export type StatTone = "neutral" | "success" | "warning" | "danger" | "brand";

const toneStyles: Record<StatTone, string> = {
  neutral: "text-strong",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  brand: "text-brand-dark",
};

export interface StatTileProps {
  label: string;
  value: string;
  /** Linha de contexto abaixo do valor (unidade, regra, comparação). */
  hint?: string;
  tone?: StatTone;
  /** Alinhamento do bloco. `end` para a faixa de KPIs à direita do cabeçalho. */
  align?: "start" | "end";
  className?: string;
}

/**
 * KPI da direção Operational Minimal: rótulo, número, contexto — sem caixa.
 *
 * Contraparte calma do `MetricCard`. A diferença não é de estilo, é de papel:
 * o `MetricCard` é um objeto (borda, sombra, chip de ícone) e por isso compete
 * com o conteúdo principal; aqui o número É o objeto, e a hierarquia vem do
 * tamanho e da cor semântica. Use quando o KPI acompanha uma tela de trabalho;
 * mantenha o `MetricCard` quando os números SÃO a tela (dashboards).
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  align = "end",
  className,
}: StatTileProps) {
  return (
    <div
      className={cn(
        "grid gap-0.5",
        align === "end" ? "text-right" : "text-left",
        className,
      )}
    >
      <span className={opsLabel}>{label}</span>
      <span
        className={cn(
          "text-2xl font-semibold leading-tight tracking-tight",
          opsNum,
          toneStyles[tone],
        )}
      >
        {value}
      </span>
      {hint ? <span className="text-xs text-soft">{hint}</span> : null}
    </div>
  );
}
