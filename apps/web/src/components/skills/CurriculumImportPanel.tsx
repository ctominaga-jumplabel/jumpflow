"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Sparkles, Upload } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  skillLevelLabels,
  skillLevelOrder,
  type SkillLevel,
} from "@/lib/competencies/types";
import {
  applyCurriculumImport,
  extractCurriculumFromPdf,
} from "@/app/app/skills/actions";

const MAX_BYTES = 6 * 1024 * 1024;

function fieldClass() {
  return cn(
    "h-9 w-full rounded-md border border-border bg-surface px-2 text-sm text-strong",
    focusRingInput,
  );
}

interface BioDraft {
  include: boolean;
  headline: string;
  summary: string;
}
interface ExpDraft {
  include: boolean;
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
  location: string;
}
interface SkillDraft {
  include: boolean;
  name: string;
  category: string;
  level: SkillLevel;
  evidence: string;
  catalogSkillId: string | null;
}

/** Lê o arquivo como base64 puro (sem o prefixo data:). */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Upload de currículo (.pdf) → leitura assistida por IA → PROPOSTA editável.
 * Nada é gravado até o consultor confirmar em "Aplicar selecionados". Skills de
 * catálogo entram como "Aguardando validação"; skills fora do catálogo viram
 * sugestões pendentes de curadoria. Nunca cria skill validada automaticamente.
 *
 * Quando a leitura por IA está indisponível (flag desligada ou sem provider), o
 * painel some — o consultor preenche o currículo manualmente nas outras seções.
 */
export function CurriculumImportPanel({
  enabled,
  onApplied,
}: {
  enabled: boolean;
  onApplied?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [contentBase64, setContentBase64] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reading, startReading] = useTransition();
  const [applying, startApplying] = useTransition();

  const [bio, setBio] = useState<BioDraft | null>(null);
  const [exps, setExps] = useState<ExpDraft[]>([]);
  const [skls, setSkls] = useState<SkillDraft[]>([]);
  const [hasProposal, setHasProposal] = useState(false);

  if (!enabled) return null;

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage(null);
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setMessage("Envie um arquivo .pdf.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setMessage("PDF acima do limite de 6 MB.");
      return;
    }
    try {
      const base64 = await readFileAsBase64(file);
      setFileName(file.name);
      setContentBase64(base64);
    } catch {
      setMessage("Não foi possível ler o arquivo.");
    }
  }

  function read() {
    if (!fileName || !contentBase64) {
      setMessage("Selecione um PDF primeiro.");
      return;
    }
    startReading(async () => {
      const result = await extractCurriculumFromPdf({
        fileName,
        contentBase64,
      });
      if (result.ok) {
        const p = result.data;
        setBio({
          include: Boolean(p.headline || p.summary),
          headline: p.headline ?? "",
          summary: p.summary ?? "",
        });
        setExps(
          p.experiences.map((exp) => ({
            include: Boolean(exp.startDate),
            company: exp.company,
            role: exp.role,
            startDate: exp.startDate ?? "",
            endDate: exp.endDate ?? "",
            description: exp.description ?? "",
            location: exp.location ?? "",
          })),
        );
        setSkls(
          p.skills.map((skill) => ({
            include: true,
            name: skill.name,
            category: skill.category ?? "",
            level: skill.level,
            evidence: skill.evidence ?? "",
            catalogSkillId: skill.catalogSkillId,
          })),
        );
        setHasProposal(true);
        setMessage(
          "Revise a proposta abaixo. Nada é gravado até você aplicar.",
        );
      } else {
        setMessage(result.message);
      }
    });
  }

  function apply() {
    startApplying(async () => {
      const includedExps = exps.filter(
        (exp) => exp.include && exp.startDate && exp.company && exp.role,
      );
      const includedSkills = skls.filter((skill) => skill.include && skill.name);
      const result = await applyCurriculumImport({
        headline: bio?.include ? bio.headline || undefined : undefined,
        summary: bio?.include ? bio.summary || undefined : undefined,
        experiences: includedExps.map((exp) => ({
          company: exp.company,
          role: exp.role,
          startDate: exp.startDate,
          endDate: exp.endDate || undefined,
          description: exp.description || undefined,
          location: exp.location || undefined,
        })),
        skills: includedSkills.map((skill) => ({
          name: skill.name,
          category: skill.category || undefined,
          level: skill.level,
          evidence: skill.evidence || undefined,
          catalogSkillId: skill.catalogSkillId ?? undefined,
        })),
      });
      if (result.ok) {
        const { appliedSkills, pendingCatalog, experiences, bio: bioApplied } =
          result.data;
        setMessage(
          `Aplicado: ${appliedSkills} skill(s) aguardando validação, ${pendingCatalog} para curadoria, ${experiences} experiência(s)${
            bioApplied ? ", bio atualizada" : ""
          }.`,
        );
        setHasProposal(false);
        setBio(null);
        setExps([]);
        setSkls([]);
        setFileName(null);
        setContentBase64(null);
        if (inputRef.current) inputRef.current.value = "";
        onApplied?.();
      } else {
        setMessage(result.message);
      }
    });
  }

  return (
    <div className="space-y-3 rounded-md border border-brand/40 bg-brand/5 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-strong">
        <Sparkles aria-hidden className="size-4 text-brand" />
        Importar currículo por IA
      </div>
      <p className="text-xs text-soft">
        Envie seu currículo em PDF. A IA lê o arquivo e monta uma PROPOSTA de
        bio, experiências e skills para você revisar e confirmar. Nada é gravado
        automaticamente, e nenhuma skill é validada sem revisão humana.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          aria-label="Currículo em PDF"
          onChange={onPick}
          className="text-xs text-medium file:mr-2 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-strong"
        />
        <ActionButton
          size="sm"
          icon={Upload}
          disabled={reading || !contentBase64}
          onClick={read}
        >
          {reading ? "Lendo..." : "Ler currículo por IA"}
        </ActionButton>
      </div>

      {message ? (
        <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-medium">
          {message}
        </div>
      ) : null}

      {hasProposal ? (
        <div className="space-y-4">
          {/* Bio */}
          {bio ? (
            <div className="rounded-md border border-border bg-surface p-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-strong">
                <input
                  type="checkbox"
                  checked={bio.include}
                  onChange={(event) =>
                    setBio({ ...bio, include: event.target.checked })
                  }
                />
                Bio
              </label>
              <input
                aria-label="Headline proposta"
                value={bio.headline}
                maxLength={160}
                onChange={(event) =>
                  setBio({ ...bio, headline: event.target.value })
                }
                placeholder="Headline"
                className={cn(fieldClass(), "mt-2")}
              />
              <textarea
                aria-label="Resumo proposto"
                value={bio.summary}
                maxLength={2000}
                rows={3}
                onChange={(event) =>
                  setBio({ ...bio, summary: event.target.value })
                }
                placeholder="Resumo profissional"
                className={cn(
                  "mt-2 w-full rounded-md border border-border bg-surface px-2 py-2 text-sm text-strong",
                  focusRingInput,
                )}
              />
            </div>
          ) : null}

          {/* Skills */}
          <div className="rounded-md border border-border bg-surface p-3">
            <div className="text-sm font-semibold text-strong">
              Skills propostas ({skls.length})
            </div>
            {skls.length === 0 ? (
              <p className="mt-1 text-xs text-soft">Nenhuma skill identificada.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {skls.map((skill, index) => (
                  <li
                    key={`${skill.name}-${index}`}
                    className="rounded-md border border-border bg-surface-muted/40 p-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-strong">
                        <input
                          type="checkbox"
                          checked={skill.include}
                          onChange={(event) =>
                            setSkls((current) =>
                              current.map((item, i) =>
                                i === index
                                  ? { ...item, include: event.target.checked }
                                  : item,
                              ),
                            )
                          }
                        />
                        {skill.name}
                      </label>
                      <StatusBadge
                        tone={skill.catalogSkillId ? "neutral" : "warning"}
                      >
                        {skill.catalogSkillId ? "Catálogo" : "Nova (curadoria)"}
                      </StatusBadge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select
                        aria-label={`Nível de ${skill.name}`}
                        value={skill.level}
                        onChange={(event) =>
                          setSkls((current) =>
                            current.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    level: event.target.value as SkillLevel,
                                  }
                                : item,
                            ),
                          )
                        }
                        className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-strong"
                      >
                        {skillLevelOrder.map((level) => (
                          <option key={level} value={level}>
                            {skillLevelLabels[level]}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label={`Categoria de ${skill.name}`}
                        value={skill.category}
                        placeholder="Categoria"
                        onChange={(event) =>
                          setSkls((current) =>
                            current.map((item, i) =>
                              i === index
                                ? { ...item, category: event.target.value }
                                : item,
                            ),
                          )
                        }
                        className="h-8 w-40 rounded-md border border-border bg-surface px-2 text-xs text-medium"
                      />
                    </div>
                    {skill.evidence ? (
                      <p className="mt-1 text-xs text-soft">{skill.evidence}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Experiências */}
          <div className="rounded-md border border-border bg-surface p-3">
            <div className="text-sm font-semibold text-strong">
              Experiências propostas ({exps.length})
            </div>
            {exps.length === 0 ? (
              <p className="mt-1 text-xs text-soft">
                Nenhuma experiência identificada.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {exps.map((exp, index) => (
                  <li
                    key={`${exp.company}-${index}`}
                    className="rounded-md border border-border bg-surface-muted/40 p-2"
                  >
                    <label className="flex items-center gap-2 text-sm font-medium text-strong">
                      <input
                        type="checkbox"
                        checked={exp.include}
                        disabled={!exp.startDate}
                        onChange={(event) =>
                          setExps((current) =>
                            current.map((item, i) =>
                              i === index
                                ? { ...item, include: event.target.checked }
                                : item,
                            ),
                          )
                        }
                      />
                      {exp.role} · {exp.company}
                    </label>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="text-xs text-medium">
                        Início
                        <input
                          type="date"
                          aria-label={`Início em ${exp.company}`}
                          value={exp.startDate}
                          onChange={(event) =>
                            setExps((current) =>
                              current.map((item, i) =>
                                i === index
                                  ? { ...item, startDate: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          className="ml-1 h-8 rounded-md border border-border bg-surface px-2 text-xs text-strong"
                        />
                      </label>
                      <label className="text-xs text-medium">
                        Fim
                        <input
                          type="date"
                          aria-label={`Fim em ${exp.company}`}
                          value={exp.endDate}
                          onChange={(event) =>
                            setExps((current) =>
                              current.map((item, i) =>
                                i === index
                                  ? { ...item, endDate: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          className="ml-1 h-8 rounded-md border border-border bg-surface px-2 text-xs text-strong"
                        />
                      </label>
                    </div>
                    {!exp.startDate ? (
                      <p className="mt-1 text-xs text-warning">
                        Informe a data de início para incluir esta experiência.
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ActionButton
            icon={FileText}
            disabled={applying}
            onClick={apply}
          >
            {applying ? "Aplicando..." : "Aplicar selecionados"}
          </ActionButton>
        </div>
      ) : null}
    </div>
  );
}
