import { Info, TriangleAlert } from "lucide-react";
import { formatHours } from "@/lib/format";

export interface BillingSignalsProps {
  /**
   * Σ horas FATURÁVEIS sem valor de venda resolvido (risco de subfaturamento).
   * Só é > 0 quando o leitor tem financials (senão o núcleo não sinaliza).
   */
  unratedBillableHours: number;
  /** true quando algum projeto do recorte tem cobrança NÃO-horária. */
  hasNonHourlyBilling: boolean;
  className?: string;
}

/**
 * Sinais DISCRETOS (não bloqueantes) da jornada Contas a Receber (review MÉDIO #3
 * + QA), reaproveitados pela visão principal e pela Apuração:
 *
 *  - Subfaturamento: horas faturáveis contadas mas sem taxa de venda resolvida —
 *    entram nas horas mas não no valor a faturar.
 *  - Cobrança não-horária: o valor exibido (horas × venda) é apenas indicativo e
 *    pode divergir do `RevenueClosing.totalAmount` real do fechamento.
 *
 * Componente PURO (sem hooks/imports server-only): seguro tanto em Server
 * Components (FinancialOverview) quanto em Client Components (ApuracaoView).
 */
export function BillingSignals({
  unratedBillableHours,
  hasNonHourlyBilling,
  className,
}: BillingSignalsProps) {
  if (unratedBillableHours <= 0 && !hasNonHourlyBilling) return null;
  return (
    <div className={className ? `space-y-2 ${className}` : "space-y-2"}>
      {unratedBillableHours > 0 ? (
        <p className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          {formatHours(unratedBillableHours)} faturáveis sem valor de venda
          (risco de subfaturamento). Defina a taxa de venda para faturar essas
          horas.
        </p>
      ) : null}
      {hasNonHourlyBilling ? (
        <p className="flex items-center gap-2 rounded-md border border-brand/30 bg-brand-soft px-3 py-2 text-sm font-medium text-brand-dark">
          <Info aria-hidden="true" className="size-4 shrink-0" />
          Cobrança não-horária neste recorte: o valor final pode diferir do
          fechamento (horas × venda é apenas indicativo).
        </p>
      ) : null}
    </div>
  );
}
