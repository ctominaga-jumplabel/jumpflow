"use client";

import { useState } from "react";
import { FileText, Printer, Sparkles } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import {
  ConsultantCurriculumView,
  CurriculumSubSection,
} from "@/components/consultants/ConsultantCurriculumView";
import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  generateCurriculumSnapshot,
  loadConsultantCurriculum,
  saveCurriculumBio,
  type CurriculumSnapshotSummary,
  type CurriculumView,
} from "@/app/app/consultores/actions";

function fieldClass() {
  return cn(
    "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong",
    focusRingInput,
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

/**
 * Secao "Curriculo" do detalhe do consultor (EP-M06). Ferramenta de RH/People:
 * mostra o curriculo DERIVADO (sempre atualizado), permite editar a bio curada
 * (gated a People), gerar snapshots versionados e abrir a versao imprimivel
 * (PDF via navegador). Sem valores financeiros. Carrega sob demanda no clique,
 * nunca em useEffect.
 */
export function ConsultantCurriculumSection({
  consultantId,
  canManagePeople,
  onMessage,
}: {
  consultantId: string;
  canManagePeople: boolean;
  onMessage: (message: string | null) => void;
}) {
  const [view, setView] = useState<CurriculumView | null>(null);
  const [loading, setLoading] = useState(false);
  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const printBase = `/app/consultores/${consultantId}/curriculo/print`;

  async function load() {
    setLoading(true);
    const result = await loadConsultantCurriculum(consultantId);
    setLoading(false);
    if (result.ok) {
      setView(result.data);
      setHeadline(result.data.curriculum.identity.headline ?? "");
      setSummary(result.data.curriculum.identity.summary ?? "");
      onMessage(null);
    } else {
      onMessage(result.message);
    }
  }

  async function saveBio() {
    setBusy(true);
    const result = await saveCurriculumBio({
      consultantId,
      headline: headline || undefined,
      summary: summary || undefined,
    });
    setBusy(false);
    onMessage(result.ok ? "Bio do curriculo salva." : result.message);
    if (result.ok) await load();
  }

  async function snapshot() {
    setBusy(true);
    const result = await generateCurriculumSnapshot({ consultantId });
    setBusy(false);
    onMessage(result.ok ? "Snapshot gerado." : result.message);
    if (result.ok) await load();
  }

  if (!canManagePeople) return null;

  if (!view) {
    return (
      <section className="space-y-3 rounded-md border border-border p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-strong">
          <FileText aria-hidden className="size-4" />
          Curriculo
        </div>
        <p className="text-sm text-medium">
          Curriculo consolidado do consultor (formacao, idiomas, competencias,
          certificados e projetos), com bio curada e versao imprimivel.
        </p>
        <ActionButton size="sm" onClick={load} disabled={loading} icon={FileText}>
          {loading ? "Carregando..." : "Abrir curriculo"}
        </ActionButton>
      </section>
    );
  }

  const cv = view.curriculum;

  return (
    <section className="space-y-4 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-strong">
          <FileText aria-hidden className="size-4" />
          Curriculo
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={printBase}
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
          <ActionButton
            size="sm"
            variant="secondary"
            onClick={snapshot}
            disabled={busy}
            icon={Sparkles}
          >
            Gerar snapshot
          </ActionButton>
        </div>
      </div>

      {/* Bio curada — unica parte editavel (nao-derivada). */}
      <div className="space-y-2 rounded-md border border-border p-3">
        <div className="text-sm font-semibold text-strong">Bio curada</div>
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

      <ConsultantCurriculumView cv={cv} />

      <SnapshotHistory snapshots={view.snapshots} printBase={printBase} />
    </section>
  );
}

function SnapshotHistory({
  snapshots,
  printBase,
}: {
  snapshots: CurriculumSnapshotSummary[];
  printBase: string;
}) {
  if (snapshots.length === 0) {
    return (
      <p className="text-xs text-medium">
        Nenhum snapshot gerado ainda. Use &quot;Gerar snapshot&quot; para congelar
        a versao atual.
      </p>
    );
  }
  return (
    <CurriculumSubSection icon={FileText} title="Historico de snapshots">
      <ul className="divide-y divide-border text-sm">
        {snapshots.map((snap) => (
          <li key={snap.id} className="flex items-center justify-between gap-2 py-1.5">
            <span className="text-strong">
              {formatDateTime(snap.createdAt)}
              {snap.generatedByName ? (
                <span className="text-medium"> — {snap.generatedByName}</span>
              ) : null}
            </span>
            <a
              href={`${printBase}?snapshot=${snap.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
            >
              <Printer aria-hidden className="size-3.5" />
              Abrir
            </a>
          </li>
        ))}
      </ul>
    </CurriculumSubSection>
  );
}
