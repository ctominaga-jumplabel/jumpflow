"use client";

import { useState } from "react";
import { GraduationCap, Languages, Plus, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { focusRing, focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  deleteConsultantEducation,
  deleteConsultantLanguage,
  saveConsultantEducation,
  saveConsultantLanguage,
} from "@/app/app/consultores/actions";
import {
  EDUCATION_DEGREES,
  LANGUAGE_LEVELS,
  type EducationDegree,
  type LanguageLevel,
} from "@/lib/consultants/schemas";
import {
  educationDegreeLabels,
  languageLevelLabels,
} from "@/lib/consultants/labels";
import type { ConsultantProfile } from "@/lib/db/consultants";

export interface ConsultantCompetenciasSectionProps {
  consultantId: string;
  languages: ConsultantProfile["languages"];
  educations: ConsultantProfile["educations"];
  canManagePeople: boolean;
  onMessage: (message: string | null) => void;
  onReload: () => void;
}

/**
 * Secao Competencias (Story 2): idiomas e formacao academica. CRUD por
 * adicao/remocao (espelha o padrao de contas bancarias). Edicao inline nao e
 * necessaria no MVP — remover e adicionar resolve.
 */
export function ConsultantCompetenciasSection({
  consultantId,
  languages,
  educations,
  canManagePeople,
  onMessage,
  onReload,
}: ConsultantCompetenciasSectionProps) {
  return (
    <div className="space-y-4">
      <LanguagesBlock
        consultantId={consultantId}
        languages={languages}
        disabled={!canManagePeople}
        onMessage={onMessage}
        onReload={onReload}
      />
      <EducationBlock
        consultantId={consultantId}
        educations={educations}
        disabled={!canManagePeople}
        onMessage={onMessage}
        onReload={onReload}
      />
    </div>
  );
}

function LanguagesBlock({
  consultantId,
  languages,
  disabled,
  onMessage,
  onReload,
}: {
  consultantId: string;
  languages: ConsultantProfile["languages"];
  disabled: boolean;
  onMessage: (message: string | null) => void;
  onReload: () => void;
}) {
  const [name, setName] = useState("");
  const [level, setLevel] = useState<LanguageLevel>("INTERMEDIATE");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    const result = await saveConsultantLanguage({
      id: undefined,
      consultantId,
      name,
      level,
    });
    setBusy(false);
    onMessage(result.ok ? "Idioma adicionado." : result.message);
    if (result.ok) {
      setName("");
      onReload();
    }
  }

  async function remove(id: string) {
    const result = await deleteConsultantLanguage({ id });
    onMessage(result.ok ? "Idioma removido." : result.message);
    if (result.ok) onReload();
  }

  return (
    <section className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-strong">
        <Languages aria-hidden="true" className="size-4" />
        Idiomas
      </div>
      {languages.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {languages.map((lang) => (
            <li
              key={lang.id}
              className="flex items-center gap-2 rounded-md border border-border bg-surface-muted/40 px-2.5 py-1 text-sm"
            >
              <span className="font-medium text-strong">{lang.name}</span>
              <span className="text-xs text-soft">
                {languageLevelLabels[lang.level as LanguageLevel] ?? lang.level}
              </span>
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => void remove(lang.id)}
                  aria-label={`Remover ${lang.name}`}
                  className={cn(
                    "grid size-5 place-items-center rounded text-medium hover:text-danger",
                    focusRing,
                  )}
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-soft">Nenhum idioma cadastrado.</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm font-medium text-medium">
          Idioma
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Ingles"
            className={fieldClass()}
          />
        </label>
        <label className="space-y-1 text-sm font-medium text-medium">
          Nivel
          <select
            value={level}
            onChange={(event) => setLevel(event.target.value as LanguageLevel)}
            className={fieldClass()}
          >
            {LANGUAGE_LEVELS.map((value) => (
              <option key={value} value={value}>
                {languageLevelLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <ActionButton
          size="sm"
          icon={Plus}
          disabled={disabled || busy || name.trim().length === 0}
          onClick={add}
        >
          Adicionar
        </ActionButton>
      </div>
    </section>
  );
}

function EducationBlock({
  consultantId,
  educations,
  disabled,
  onMessage,
  onReload,
}: {
  consultantId: string;
  educations: ConsultantProfile["educations"];
  disabled: boolean;
  onMessage: (message: string | null) => void;
  onReload: () => void;
}) {
  const [institution, setInstitution] = useState("");
  const [course, setCourse] = useState("");
  const [degree, setDegree] = useState<EducationDegree>("UNDERGRADUATE");
  const [startYear, setStartYear] = useState("");
  const [endYear, setEndYear] = useState("");
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    const result = await saveConsultantEducation({
      id: undefined,
      consultantId,
      institution,
      course,
      degree,
      startYear: startYear === "" ? undefined : Number(startYear),
      endYear: endYear === "" ? undefined : Number(endYear),
      completed,
    });
    setBusy(false);
    onMessage(result.ok ? "Formacao adicionada." : result.message);
    if (result.ok) {
      setInstitution("");
      setCourse("");
      setStartYear("");
      setEndYear("");
      setCompleted(false);
      onReload();
    }
  }

  async function remove(id: string) {
    const result = await deleteConsultantEducation({ id });
    onMessage(result.ok ? "Formacao removida." : result.message);
    if (result.ok) onReload();
  }

  return (
    <section className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-strong">
        <GraduationCap aria-hidden="true" className="size-4" />
        Formacao academica
      </div>
      {educations.length > 0 ? (
        <ul className="space-y-2">
          {educations.map((edu) => (
            <li
              key={edu.id}
              className="flex items-center gap-3 rounded-md border border-border bg-surface-muted/40 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-strong">
                  {edu.course}
                  <span className="ml-2 text-xs font-normal text-soft">
                    {educationDegreeLabels[edu.degree as EducationDegree] ??
                      edu.degree}
                  </span>
                </p>
                <p className="truncate text-xs text-soft">
                  {edu.institution}
                  {edu.startYear || edu.endYear
                    ? ` · ${edu.startYear ?? "?"}–${edu.completed ? edu.endYear ?? "?" : "atual"}`
                    : ""}
                  {edu.completed ? " · concluido" : ""}
                </p>
              </div>
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => void remove(edu.id)}
                  aria-label={`Remover ${edu.course}`}
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-md text-medium hover:bg-surface hover:text-danger",
                    focusRing,
                  )}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-soft">Nenhuma formacao cadastrada.</p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-medium">
          Instituicao
          <input
            value={institution}
            onChange={(event) => setInstitution(event.target.value)}
            className={fieldClass()}
          />
        </label>
        <label className="space-y-1 text-sm font-medium text-medium">
          Curso
          <input
            value={course}
            onChange={(event) => setCourse(event.target.value)}
            className={fieldClass()}
          />
        </label>
        <label className="space-y-1 text-sm font-medium text-medium">
          Grau
          <select
            value={degree}
            onChange={(event) => setDegree(event.target.value as EducationDegree)}
            className={fieldClass()}
          >
            {EDUCATION_DEGREES.map((value) => (
              <option key={value} value={value}>
                {educationDegreeLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <label className="space-y-1 text-sm font-medium text-medium">
            Ano inicio
            <input
              type="number"
              value={startYear}
              onChange={(event) => setStartYear(event.target.value)}
              className={fieldClass()}
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-medium">
            Ano fim
            <input
              type="number"
              value={endYear}
              onChange={(event) => setEndYear(event.target.value)}
              className={fieldClass()}
            />
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-medium">
          <input
            type="checkbox"
            checked={completed}
            onChange={(event) => setCompleted(event.target.checked)}
          />
          Concluido
        </label>
        <ActionButton
          size="sm"
          icon={Plus}
          disabled={
            disabled ||
            busy ||
            institution.trim().length === 0 ||
            course.trim().length === 0
          }
          onClick={add}
        >
          Adicionar formacao
        </ActionButton>
      </div>
    </section>
  );
}

function fieldClass() {
  return cn(
    "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm",
    focusRingInput,
  );
}
