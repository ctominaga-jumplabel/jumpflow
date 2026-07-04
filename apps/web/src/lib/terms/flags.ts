/**
 * Feature flag do gate de Termos de Uso (EP-M08).
 *
 * Edge-safe: le apenas `process.env` (NEXT_PUBLIC_* para ser inlined no client
 * tambem). Default OFF — enquanto off, o gate NAO bloqueia ninguem e a tela
 * `/termos` redireciona para `/app`. Espelha o padrao de `lib/feed/flags.ts`.
 *
 * POR QUE OFF POR PADRAO: o texto dos Termos ainda e um RASCUNHO com campos a
 * preencher (razao social, DPO, foro) e depende de revisao Juridico/People antes
 * de ser publicado. Ligar so apos a revisao:
 *   NEXT_PUBLIC_FEATURE_TERMS=true
 */

function isEnabled(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

/** Whether the Terms-of-use gate is enabled (atras de flag, off por padrao). */
export function isTermsGateEnabled(): boolean {
  return isEnabled(process.env.NEXT_PUBLIC_FEATURE_TERMS);
}
