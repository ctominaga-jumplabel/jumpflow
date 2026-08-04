import { Landmark } from "lucide-react";
import type { ExpenseBankInfo } from "@/lib/expenses/types";

export interface ExpenseBankInfoInlineProps {
  /** Dados bancários resolvidos (visão financeira). */
  info?: ExpenseBankInfo;
}

/**
 * Bloco compacto com os dados bancários do consultor para o Financeiro pagar o
 * reembolso. Renderizado apenas nas visões financeiras (painel de pagamento e
 * etapa de aprovação do financeiro). Quando não há dados, sinaliza a lacuna em
 * vez de sumir — o Financeiro precisa saber que falta cadastro bancário.
 */
export function ExpenseBankInfoInline({ info }: ExpenseBankInfoInlineProps) {
  if (!info) {
    return (
      <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">
        <Landmark aria-hidden="true" size={12} /> Sem dados bancários
      </p>
    );
  }

  const accountLine = [
    info.agency ? `Ag. ${info.agency}` : null,
    info.account ? `Conta ${info.account}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mt-1 space-y-0.5 rounded-md border border-border/60 bg-surface-muted/40 px-2 py-1 text-xs text-soft">
      <p className="flex items-center gap-1 font-semibold text-medium">
        <Landmark aria-hidden="true" size={12} /> Dados bancários
      </p>
      {info.bankName ? <p className="text-medium">{info.bankName}</p> : null}
      {accountLine ? <p className="tabular-nums">{accountLine}</p> : null}
      {info.pixKey ? (
        <p>
          <span className="text-soft">PIX:</span>{" "}
          <span className="font-medium text-medium">{info.pixKey}</span>
        </p>
      ) : null}
      {info.document ? (
        <p>
          <span className="text-soft">Doc.:</span>{" "}
          <span className="tabular-nums text-medium">{info.document}</span>
        </p>
      ) : null}
    </div>
  );
}
