/**
 * Decisao PURA do gate de Termos de Uso (EP-M08), isolada da I/O para ser
 * trivialmente testavel. O layout autenticado consulta os sinais reais
 * (dev mode, banco configurado, aceite da versao vigente) e delega a decisao
 * a esta funcao.
 */

export interface TermsGateSignals {
  /** Dev auth ativo (`isDevAuthEnabled()`). */
  devMode: boolean;
  /** Banco configurado (`isDatabaseConfigured()`). */
  dbConfigured: boolean;
  /** Usuario ja aceitou a versao VIGENTE dos Termos. */
  accepted: boolean;
}

/**
 * Deve bloquear o acesso e redirecionar para `/termos`?
 *
 * Fail-safe (espelha o padrao de `getCurrentMatrix`): em dev mode ou sem banco
 * NAO ha onde persistir/consultar o aceite, entao o gate e PULADO — bloquear
 * trancaria todos fora em setups de demo/offline. Com banco real, bloqueia
 * enquanto `accepted` for falso.
 */
export function shouldGateTerms(signals: TermsGateSignals): boolean {
  if (signals.devMode) return false;
  if (!signals.dbConfigured) return false;
  return !signals.accepted;
}
