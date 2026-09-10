"use client";

/**
 * Experience Switcher — ferramenta de DEMONSTRAÇÃO (P6).
 *
 * Painel flutuante para trocar a experiência visual do JumpFlow em runtime e
 * voltar ao tema original. Não é feature de produto: fica atrás de
 * `NEXT_PUBLIC_EXPERIENCE_SWITCHER` e nasce desligado em produção.
 *
 * Todo texto vem do registro (nome de experiência, classificação) e é
 * renderizado como TEXTO por React — nunca `innerHTML`. As amostras de cor
 * passam pelo validador antes de virar `background`.
 */

import { useEffect, useState } from "react";
import { Layers, RotateCcw, X } from "lucide-react";
import { useExperience } from "./ExperienceProvider";
import { color as validColor } from "./validate";

export function isSwitcherEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_EXPERIENCE_SWITCHER;
  if (flag === "1" || flag === "true") return true;
  if (flag === "0" || flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export function ExperienceSwitcher() {
  const {
    applied,
    experiences,
    loading,
    problem,
    origin,
    reducedMotion,
    apply,
    reset,
    loadExperiences,
  } = useExperience();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open && !experiences.length) void loadExperiences();
  }, [open, experiences.length, loadExperiences]);

  if (!isSwitcherEnabled()) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] text-sm">
      {open ? (
        <div className="w-80 rounded-lg border-2 border-ink bg-surface p-3 shadow-[4px_4px_0_0_var(--color-ink)]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-semibold text-strong">Experience</span>
            <button
              type="button"
              aria-label="Fechar seletor de experiência"
              className="rounded-md p-1 text-medium hover:text-strong"
              onClick={() => setOpen(false)}
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>

          <p className="mb-3 text-xs text-soft">
            Troca a identidade visual em runtime. Regra de negócio, rotas e
            permissões não mudam.
          </p>

          <ul className="mb-3 space-y-1">
            <li>
              <button
                type="button"
                onClick={reset}
                aria-pressed={applied === null}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left ${
                  applied === null
                    ? "bg-brand-soft text-brand-dark"
                    : "hover:bg-surface-muted"
                }`}
              >
                <span className="font-medium">JumpFlow Original</span>
                <RotateCcw aria-hidden="true" className="size-3.5" />
              </button>
            </li>
            {experiences.map((experience) => {
              const active = applied?.experienceId === experience.id;
              const swatches = (experience.preview?.swatches ?? [])
                .map((swatch) => validColor(swatch.valor))
                .filter((tone): tone is string => tone !== null)
                .slice(0, 6);
              return (
                <li key={experience.id}>
                  <button
                    type="button"
                    onClick={() =>
                      void apply(experience.id, experience.current_version)
                    }
                    aria-pressed={active}
                    className={`w-full rounded-md px-2 py-2 text-left ${
                      active ? "bg-brand-soft text-brand-dark" : "hover:bg-surface-muted"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{experience.nome}</span>
                      <span className="shrink-0 text-xs text-soft">
                        v{experience.current_version}
                      </span>
                    </span>
                    <span className="mt-1 flex items-center gap-1">
                      {swatches.map((tone, index) => (
                        <span
                          key={`${experience.id}-${index}`}
                          className="size-3 rounded-sm border border-border"
                          style={{ background: tone }}
                        />
                      ))}
                      <span className="ml-1 truncate text-[11px] text-soft">
                        {(experience.classification ?? []).join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="space-y-1 border-t border-border pt-2 text-[11px] text-soft">
            <div>
              Ativa:{" "}
              <span className="font-medium text-medium">
                {applied ? `${applied.name} v${applied.version}` : "JumpFlow Original"}
              </span>
            </div>
            {applied ? (
              <div>
                {Object.keys(applied.variables).length} tokens ·{" "}
                {applied.rules ? "efeitos aplicados" : "sem efeitos"}
                {origin ? ` · fonte: ${origin}` : ""}
              </div>
            ) : null}
            {reducedMotion ? <div>prefers-reduced-motion: respeitado</div> : null}
            {loading ? <div>carregando…</div> : null}
            {problem ? (
              <div className="text-danger" role="status">
                {problem}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full border-2 border-ink bg-surface px-3 py-2 font-medium text-strong shadow-[3px_3px_0_0_var(--color-ink)]"
        >
          <Layers aria-hidden="true" className="size-4" />
          {applied ? applied.name : "Experience"}
        </button>
      )}
    </div>
  );
}
