"use client";

/**
 * Contexto da experiência visual ativa.
 *
 * Monta no layout raiz e faz três coisas: reidrata a preferência salva, aplica
 * o pack (cache primeiro, rede depois) e oferece `apply`/`reset` para o
 * switcher. NÃO envolve nem altera nenhuma regra de negócio: o provider só
 * escreve variáveis CSS no `<html>` através do engine.
 *
 * Falha é caminho normal, não exceção: pack incompatível, ilegível, API fora ou
 * cache vazio terminam no tema ORIGINAL do JumpFlow, com o motivo à mão.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { applyExperience, revertExperience } from "./engine";
import {
  fetchExperiences,
  fetchPack,
  readSelection,
  writeSelection,
} from "./client";
import type { AppliedExperience, ExperienceSummary } from "./types";

export interface ExperienceState {
  /** Experiência aplicada agora; `null` = tema original do JumpFlow. */
  applied: AppliedExperience | null;
  /** Lista publicada (carregada sob demanda pelo switcher). */
  experiences: ExperienceSummary[];
  loading: boolean;
  /** Último motivo de falha, exibido sem maquiagem. */
  problem: string | null;
  /** De onde veio o pack aplicado. */
  origin: "network" | "cache" | "stale-cache" | "none" | null;
  reducedMotion: boolean;
  apply: (id: number, version: number) => Promise<boolean>;
  reset: () => void;
  loadExperiences: () => Promise<void>;
}

const ExperienceContext = createContext<ExperienceState | null>(null);

export function useExperience(): ExperienceState {
  const context = useContext(ExperienceContext);
  if (!context) {
    throw new Error("useExperience precisa do <ExperienceProvider>");
  }
  return context;
}

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const [applied, setApplied] = useState<AppliedExperience | null>(null);
  const [experiences, setExperiences] = useState<ExperienceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [origin, setOrigin] = useState<ExperienceState["origin"]>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const hydrated = useRef(false);

  const apply = useCallback(async (id: number, version: number) => {
    setLoading(true);
    setProblem(null);
    const result = await fetchPack(id, version);
    setOrigin(result.source);
    /*
     * Falha NÃO derruba o que já está aplicado. `applyExperience` valida antes de
     * tocar no DOM, então quem estava valendo continua valendo — trocar para uma
     * experiência quebrada não deveria custar a experiência que funcionava. Sem
     * nada aplicado, o estado já é o tema original do JumpFlow.
     */
    if (!result.pack) {
      setLoading(false);
      setProblem(
        `não foi possível carregar a experiência ${id} v${version}: ${result.detail ?? "indisponível"}`,
      );
      return false;
    }
    const outcome = applyExperience(result.pack);
    setLoading(false);
    if (!outcome.ok) {
      setProblem(`${outcome.reason}: ${outcome.detail}`);
      return false;
    }
    setApplied(outcome.applied);
    writeSelection({ id, version });
    if (result.source === "stale-cache") {
      setProblem("registro indisponível — aplicada a versão em cache");
    }
    return true;
  }, []);

  const reset = useCallback(() => {
    revertExperience();
    setApplied(null);
    setProblem(null);
    setOrigin(null);
    writeSelection(null);
  }, []);

  const loadExperiences = useCallback(async () => {
    setLoading(true);
    const list = await fetchExperiences();
    setExperiences(list);
    setLoading(false);
    if (!list.length) {
      setProblem("nenhuma experiência publicada disponível");
    }
  }, []);

  /*
   * Reidratação: uma vez, no cliente. A preferência vive no navegador, então a
   * primeira pintura é o tema original e a experiência entra depois — troca sem
   * reload, mas com um flash na carga inicial (registrado como gap; a saída é
   * persistir a seleção em cookie e escrever as variáveis no servidor).
   *
   * O trabalho roda num timeout de 0 e a preferência de movimento vira uma
   * SUBSCRIÇÃO: efeito serve para sincronizar com sistema externo, não para
   * disparar `setState` em cascata no próprio corpo (regra do compilador do
   * React 19, que o lint do JumpFlow aplica).
   */
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const view = window;
    const query =
      typeof view.matchMedia === "function"
        ? view.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    const sync = () => setReducedMotion(Boolean(query?.matches));
    query?.addEventListener?.("change", sync);
    const timer = view.setTimeout(() => {
      sync();
      const selection = readSelection();
      if (selection) void apply(selection.id, selection.version);
    }, 0);
    return () => {
      view.clearTimeout(timer);
      query?.removeEventListener?.("change", sync);
    };
  }, [apply]);

  const value = useMemo<ExperienceState>(
    () => ({
      applied,
      experiences,
      loading,
      problem,
      origin,
      reducedMotion,
      apply,
      reset,
      loadExperiences,
    }),
    [
      applied,
      experiences,
      loading,
      problem,
      origin,
      reducedMotion,
      apply,
      reset,
      loadExperiences,
    ],
  );

  return (
    <ExperienceContext.Provider value={value}>
      {children}
    </ExperienceContext.Provider>
  );
}
