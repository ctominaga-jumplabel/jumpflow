"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Plus, Save, Trash2 } from "lucide-react";
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
  deleteMySkill,
  loadMySkills,
  saveMySkill,
  type CatalogSkillOption,
  type MySkillRow,
} from "@/app/app/skills/actions";

function fieldClass() {
  return cn(
    "h-9 w-full rounded-md border border-border bg-surface px-2 text-sm text-strong",
    focusRingInput,
  );
}

const validationTone: Record<
  MySkillRow["validationStatus"],
  { tone: "info" | "success" | "danger"; label: string }
> = {
  PENDING: { tone: "info", label: "Aguardando validação" },
  VALIDATED: { tone: "success", label: "Validada" },
  REJECTED: { tone: "danger", label: "Rejeitada" },
};

/**
 * Autosserviço de skills do consultor. O consultor declara/edita as PRÓPRIAS
 * skills (nível + anos de experiência). Toda skill entra/volta a "Aguardando
 * validação" (PENDING) — a validação é decisão de gestor/People, nunca
 * automática. Escopo de dono garantido no servidor (nunca envia consultantId).
 */
export function MySkillsEditor() {
  const [skills, setSkills] = useState<MySkillRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogSkillOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Draft para adicionar uma nova skill.
  const [newSkillId, setNewSkillId] = useState("");
  const [newLevel, setNewLevel] = useState<SkillLevel>("INTERMEDIATE");
  const [newYears, setNewYears] = useState("");

  // Edições in-line de nível/anos das skills já declaradas.
  const [edits, setEdits] = useState<
    Record<string, { level: SkillLevel; years: string }>
  >({});

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await loadMySkills();
      if (!active) return;
      if (result.ok) {
        setSkills(result.data.skills);
        setCatalog(result.data.catalog);
        setEdits(
          Object.fromEntries(
            result.data.skills.map((skill) => [
              skill.skillId,
              {
                level: skill.level,
                years:
                  skill.yearsExperience === null
                    ? ""
                    : String(skill.yearsExperience),
              },
            ]),
          ),
        );
      } else if (result.error !== "NO_CONSULTANT") {
        setMessage(result.message);
      }
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  async function reload() {
    const result = await loadMySkills();
    if (result.ok) {
      setSkills(result.data.skills);
      setCatalog(result.data.catalog);
      setEdits(
        Object.fromEntries(
          result.data.skills.map((skill) => [
            skill.skillId,
            {
              level: skill.level,
              years:
                skill.yearsExperience === null
                  ? ""
                  : String(skill.yearsExperience),
            },
          ]),
        ),
      );
    }
  }

  const declaredIds = new Set(skills.map((skill) => skill.skillId));
  const available = catalog.filter((option) => !declaredIds.has(option.id));

  function add() {
    if (!newSkillId) {
      setMessage("Selecione uma skill do catálogo.");
      return;
    }
    startTransition(async () => {
      const result = await saveMySkill({
        skillId: newSkillId,
        level: newLevel,
        yearsExperience: newYears || undefined,
      });
      if (result.ok) {
        setMessage("Skill adicionada. Aguardando validação.");
        setNewSkillId("");
        setNewYears("");
        setNewLevel("INTERMEDIATE");
        await reload();
      } else {
        setMessage(result.message);
      }
    });
  }

  function save(skill: MySkillRow) {
    const draft = edits[skill.skillId] ?? { level: skill.level, years: "" };
    startTransition(async () => {
      const result = await saveMySkill({
        skillId: skill.skillId,
        level: draft.level,
        yearsExperience: draft.years || undefined,
      });
      if (result.ok) {
        setMessage("Skill atualizada. Aguardando validação.");
        await reload();
      } else {
        setMessage(result.message);
      }
    });
  }

  function remove(skill: MySkillRow) {
    startTransition(async () => {
      const result = await deleteMySkill({ skillId: skill.skillId });
      if (result.ok) {
        setMessage("Skill removida do seu perfil.");
        await reload();
      } else {
        setMessage(result.message);
      }
    });
  }

  if (!loaded) {
    return <p className="text-sm text-medium">Carregando suas skills...</p>;
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="text-sm font-semibold text-strong">Minhas skills</div>
      <p className="text-xs text-soft">
        Declare suas competências e o nível. Toda skill entra como
        &quot;Aguardando validação&quot; — a validação é feita pelo time de
        gestão / Pessoas.
      </p>

      {message ? (
        <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs font-medium text-medium">
          {message}
        </div>
      ) : null}

      {skills.length === 0 ? (
        <p className="text-sm text-soft">
          Você ainda não declarou skills. Adicione a primeira abaixo.
        </p>
      ) : (
        <ul className="space-y-2">
          {skills.map((skill) => {
            const draft = edits[skill.skillId] ?? {
              level: skill.level,
              years: "",
            };
            const badge = validationTone[skill.validationStatus];
            return (
              <li
                key={skill.skillId}
                className="rounded-md border border-border bg-surface-muted/40 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-strong">
                      {skill.name}
                    </p>
                    <p className="text-xs text-soft">
                      {skill.category ?? "Sem categoria"}
                    </p>
                  </div>
                  <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="text-xs font-medium text-medium">
                    Nível
                    <select
                      aria-label={`Nível de ${skill.name}`}
                      value={draft.level}
                      onChange={(event) =>
                        setEdits((current) => ({
                          ...current,
                          [skill.skillId]: {
                            level: event.target.value as SkillLevel,
                            years: current[skill.skillId]?.years ?? "",
                          },
                        }))
                      }
                      className={cn(fieldClass(), "mt-1")}
                    >
                      {skillLevelOrder.map((level) => (
                        <option key={level} value={level}>
                          {skillLevelLabels[level]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-medium">
                    Anos de experiência
                    <input
                      aria-label={`Anos de experiência em ${skill.name}`}
                      type="number"
                      min={0}
                      max={80}
                      step={0.5}
                      value={draft.years}
                      onChange={(event) =>
                        setEdits((current) => ({
                          ...current,
                          [skill.skillId]: {
                            level: current[skill.skillId]?.level ?? skill.level,
                            years: event.target.value,
                          },
                        }))
                      }
                      className={cn(fieldClass(), "mt-1 w-28")}
                    />
                  </label>
                  <ActionButton
                    variant="secondary"
                    size="sm"
                    icon={Save}
                    disabled={pending}
                    onClick={() => save(skill)}
                  >
                    Salvar
                  </ActionButton>
                  <ActionButton
                    variant="danger"
                    size="sm"
                    icon={Trash2}
                    disabled={pending}
                    onClick={() => remove(skill)}
                  >
                    Remover
                  </ActionButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="rounded-md border border-dashed border-border p-3">
        <div className="text-xs font-semibold text-strong">
          Adicionar skill do catálogo
        </div>
        {available.length === 0 ? (
          <p className="mt-2 text-xs text-soft">
            Todas as skills ativas do catálogo já estão no seu perfil. Skills
            fora do catálogo passam por curadoria (use a leitura de currículo ou
            fale com Pessoas).
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-medium">
              Skill
              <select
                aria-label="Skill do catálogo"
                value={newSkillId}
                onChange={(event) => setNewSkillId(event.target.value)}
                className={cn(fieldClass(), "mt-1 min-w-52")}
              >
                <option value="">Selecione...</option>
                {available.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                    {option.category ? ` — ${option.category}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-medium">
              Nível
              <select
                aria-label="Nível da nova skill"
                value={newLevel}
                onChange={(event) =>
                  setNewLevel(event.target.value as SkillLevel)
                }
                className={cn(fieldClass(), "mt-1")}
              >
                {skillLevelOrder.map((level) => (
                  <option key={level} value={level}>
                    {skillLevelLabels[level]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-medium">
              Anos
              <input
                aria-label="Anos de experiência da nova skill"
                type="number"
                min={0}
                max={80}
                step={0.5}
                value={newYears}
                onChange={(event) => setNewYears(event.target.value)}
                className={cn(fieldClass(), "mt-1 w-24")}
              />
            </label>
            <ActionButton
              size="sm"
              icon={Plus}
              disabled={pending || !newSkillId}
              onClick={add}
            >
              Adicionar
            </ActionButton>
          </div>
        )}
        <p className="mt-2 flex items-center gap-1 text-xs text-soft">
          <Check aria-hidden className="size-3.5" />
          Nada é validado automaticamente.
        </p>
      </div>
    </div>
  );
}
