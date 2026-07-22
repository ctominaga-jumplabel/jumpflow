"use client";

import { useEffect, useState } from "react";
import { FileText, Printer } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { ConsultantCurriculumView } from "@/components/consultants/ConsultantCurriculumView";
import {
  ConsultantExperienceEditor,
  type ExperienceDraft,
} from "@/components/consultants/ConsultantExperienceEditor";
import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { ConsultantCurriculum } from "@/lib/consultants/curriculum";
import type { ConsultantExperienceView } from "@/lib/consultants/experiences";
import {
  deleteMyExperience,
  loadMyCurriculum,
  loadMyExperiences,
  saveMyCurriculumBio,
  saveMyExperience,
} from "@/app/app/skills/actions";

function fieldClass() {
  return cn(
    "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong",
    focusRingInput,
  );
}

type Status =
  | { kind: "loading" }
  | { kind: "ready"; curriculum: ConsultantCurriculum }
  | { kind: "no-consultant" }
  | { kind: "error"; message: string };

/**
 * Aba "Meu Curriculo" (EP-M06 / US-M06.03) — visao do PROPRIO consultor. Le o
 * curriculo derivado do usuario logado via `loadMyCurriculum` (escopo de dono
 * no servidor) e permite editar apenas a bio curada (headline/summary) do
 * proprio cadastro. Read-only para o restante (derivado das fontes). Sem dados
 * financeiros. Sem geracao de snapshot (RH-only). Estado vazio amigavel quando
 * o usuario nao tem cadastro de consultor.
 */
export function MyCurriculumTab() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState("");
  const [experiences, setExperiences] = useState<ConsultantExperienceView[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function reloadExperiences() {
    const res = await loadMyExperiences();
    if (res.ok) setExperiences(res.data);
  }

  async function saveExperience(draft: ExperienceDraft) {
    return saveMyExperience({
      id: draft.id,
      company: draft.company,
      role: draft.role,
      startDate: draft.startDate,
      endDate: draft.endDate || undefined,
      description: draft.description || undefined,
      location: draft.location || undefined,
    });
  }

  // Busca sem tocar em setState de forma sincrona: o estado so muda APOS o
  // await (evita cascata de renders sinalizada por react-hooks/set-state-in-effect).
  async function fetchCurriculum() {
    const result = await loadMyCurriculum();
    if (result.ok) {
      setHeadline(result.data.curriculum.identity.headline ?? "");
      setSummary(result.data.curriculum.identity.summary ?? "");
      setStatus({ kind: "ready", curriculum: result.data.curriculum });
      await reloadExperiences();
    } else if (result.error === "NO_CONSULTANT") {
      setStatus({ kind: "no-consultant" });
    } else {
      setStatus({ kind: "error", message: result.message });
    }
  }

  async function reload() {
    setStatus({ kind: "loading" });
    await fetchCurriculum();
  }

  useEffect(() => {
    // Carrega uma vez ao montar a aba. A logica e inline num IIFE async para
    // que o setState ocorra APOS o await (nao sincronamente no efeito), e um
    // flag de cleanup evita setState apos desmontar ao trocar de aba.
    let active = true;
    void (async () => {
      const result = await loadMyCurriculum();
      if (!active) return;
      if (result.ok) {
        setHeadline(result.data.curriculum.identity.headline ?? "");
        setSummary(result.data.curriculum.identity.summary ?? "");
        setStatus({ kind: "ready", curriculum: result.data.curriculum });
        const expResult = await loadMyExperiences();
        if (active && expResult.ok) setExperiences(expResult.data);
      } else if (result.error === "NO_CONSULTANT") {
        setStatus({ kind: "no-consultant" });
      } else {
        setStatus({ kind: "error", message: result.message });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function saveBio() {
    setBusy(true);
    setMessage(null);
    const result = await saveMyCurriculumBio({
      headline: headline || undefined,
      summary: summary || undefined,
    });
    setBusy(false);
    if (result.ok) {
      setMessage("Bio do curriculo salva.");
      await fetchCurriculum();
    } else {
      setMessage(result.message);
    }
  }

  if (status.kind === "loading") {
    return <p className="text-sm text-medium">Carregando seu curriculo...</p>;
  }

  if (status.kind === "no-consultant") {
    return (
      <div className="rounded-md border border-border bg-surface-muted p-4">
        <p className="text-sm font-semibold text-strong">
          Voce nao possui um cadastro de consultor
        </p>
        <p className="mt-1 text-sm text-medium">
          O curriculo e montado a partir do seu cadastro de consultor. Fale com o
          time de Pessoas caso precise de um.
        </p>
      </div>
    );
  }

  if (status.kind === "error") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-danger">{status.message}</p>
        <ActionButton size="sm" variant="secondary" onClick={reload}>
          Tentar novamente
        </ActionButton>
      </div>
    );
  }

  const cv = status.curriculum;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-medium">
          Este e o seu curriculo consolidado (formacao, idiomas, competencias
          validadas, certificados e projetos). As secoes sao atualizadas
          automaticamente conforme seus dados. Voce pode editar sua bio.
        </p>
        <a
          href="/app/skills/curriculo/print"
          target="_blank"
          rel="noreferrer"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-strong hover:bg-surface-muted",
            focusRingInput,
          )}
        >
          <Printer aria-hidden className="size-4" />
          Versao imprimivel
        </a>
      </div>

      {message ? <p className="text-sm text-medium">{message}</p> : null}

      {/* Bio curada — unica parte editavel pelo proprio consultor. */}
      <div className="space-y-2 rounded-md border border-border p-3">
        <div className="text-sm font-semibold text-strong">Sua bio</div>
        <label className="block space-y-1 text-sm font-medium text-medium">
          Headline
          <input
            aria-label="Headline do curriculo"
            value={headline}
            maxLength={160}
            onChange={(event) => setHeadline(event.target.value)}
            className={fieldClass()}
            placeholder="Ex.: Engenheira de dados focada em analytics"
          />
        </label>
        <label className="block space-y-1 text-sm font-medium text-medium">
          Resumo
          <textarea
            aria-label="Resumo do curriculo"
            value={summary}
            maxLength={2000}
            rows={4}
            onChange={(event) => setSummary(event.target.value)}
            className={fieldClass()}
            placeholder="Resumo profissional (sem dados financeiros)."
          />
        </label>
        <ActionButton size="sm" onClick={saveBio} disabled={busy} icon={FileText}>
          Salvar bio
        </ActionButton>
      </div>

      {/* Experiencia profissional declarada — cadastro direto (P27). E a espinha
          do historico do curriculo; as alocacoes internas entram como complemento. */}
      <div className="space-y-2 rounded-md border border-border p-3">
        <div className="text-sm font-semibold text-strong">
          Experiencia profissional
        </div>
        <p className="text-xs text-soft">
          Cadastre suas experiencias passadas. Elas formam a espinha do seu
          curriculo; as competencias e alocacoes internas complementam.
        </p>
        <ConsultantExperienceEditor
          experiences={experiences}
          onSave={saveExperience}
          onDelete={(id) => deleteMyExperience({ id })}
          onReload={reloadExperiences}
          onMessage={setMessage}
        />
      </div>

      <ConsultantCurriculumView cv={cv} />
    </section>
  );
}
