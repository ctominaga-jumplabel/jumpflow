"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Save, Sparkles, Trash2, X } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";
import {
  acceptSkillSuggestion,
  deleteSkillSuggestion,
  dismissSkillSuggestion,
  generateWeeklySkillSuggestions,
  updateSkillSuggestion,
} from "@/app/app/skills/actions";
import {
  skillLevelLabels,
  skillLevelOrder,
  type SkillLevel,
} from "@/lib/mock-data/skills";

export interface SkillSuggestionItem {
  id: string;
  skillId: string | null;
  suggestedName: string;
  suggestedCategory: string | null;
  suggestedLevel: SkillLevel;
  evidenceSummary: string | null;
  status: "PENDING" | "ACCEPTED" | "DISMISSED";
}

export interface SkillSuggestionPanelProps {
  weekStart: string;
  suggestions: SkillSuggestionItem[];
  databaseReady: boolean;
}

export function SkillSuggestionPanel({
  weekStart,
  suggestions,
  databaseReady,
}: SkillSuggestionPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [levels, setLevels] = useState<Record<string, SkillLevel>>(() =>
    Object.fromEntries(suggestions.map((item) => [item.id, item.suggestedLevel])),
  );
  const [drafts, setDrafts] = useState<
    Record<string, { suggestedName: string; suggestedCategory: string }>
  >(() =>
    Object.fromEntries(
      suggestions.map((item) => [
        item.id,
        {
          suggestedName: item.suggestedName,
          suggestedCategory: item.suggestedCategory ?? "",
        },
      ]),
    ),
  );
  const [message, setMessage] = useState<string | null>(null);

  function generate() {
    startTransition(async () => {
      const result = await generateWeeklySkillSuggestions({ weekStart });
      if (result.ok) {
        setMessage(
          result.data.generated > 0
            ? `${result.data.generated} sugestao(oes) gerada(s).`
            : "Nenhuma sugestao encontrada nas descricoes da semana.",
        );
        router.refresh();
      } else {
        setMessage(result.message);
      }
    });
  }

  function accept(item: SkillSuggestionItem) {
    startTransition(async () => {
      const result = await acceptSkillSuggestion({
        suggestionId: item.id,
        level: levels[item.id] ?? item.suggestedLevel,
      });
      if (result.ok) {
        setMessage("Skill enviada para validacao.");
        router.refresh();
      } else {
        setMessage(result.message);
      }
    });
  }

  function update(item: SkillSuggestionItem) {
    const draft = drafts[item.id] ?? {
      suggestedName: item.suggestedName,
      suggestedCategory: item.suggestedCategory ?? "",
    };
    startTransition(async () => {
      const result = await updateSkillSuggestion({
        suggestionId: item.id,
        suggestedName: draft.suggestedName,
        suggestedCategory: draft.suggestedCategory,
        level: levels[item.id] ?? item.suggestedLevel,
      });
      if (result.ok) {
        setMessage("Sugestao atualizada.");
        router.refresh();
      } else {
        setMessage(result.message);
      }
    });
  }

  function dismiss(item: SkillSuggestionItem) {
    startTransition(async () => {
      const result = await dismissSkillSuggestion({ suggestionId: item.id });
      if (result.ok) {
        setMessage("Sugestao descartada.");
        router.refresh();
      } else {
        setMessage(result.message);
      }
    });
  }

  function remove(item: SkillSuggestionItem) {
    startTransition(async () => {
      const result = await deleteSkillSuggestion({ suggestionId: item.id });
      if (result.ok) {
        setMessage("Sugestao apagada.");
        router.refresh();
      } else {
        setMessage(result.message);
      }
    });
  }

  return (
    <SectionPanel
      title="Sugestoes por atividades"
      description="A partir das descricoes da semana. Voce decide o que entra no perfil."
      action={
        <ActionButton
          variant="secondary"
          size="sm"
          icon={Sparkles}
          disabled={!databaseReady || isPending}
          onClick={generate}
        >
          Gerar
        </ActionButton>
      }
    >
      {!databaseReady ? (
        <p className="px-5 py-4 text-sm text-soft">
          Banco nao configurado. Sugestoes ficam disponiveis com persistencia.
        </p>
      ) : (
        <div className="space-y-3 px-5 py-4">
          {message ? (
            <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs font-medium text-medium">
              {message}
            </div>
          ) : null}

          {suggestions.length === 0 ? (
            <p className="text-sm text-soft">
              Gere sugestoes depois de preencher descricoes nos lancamentos de horas.
            </p>
          ) : (
            <ul className="space-y-3">
              {suggestions.map((item) => (
                <li
                  key={item.id}
                  className="rounded-md border border-border bg-surface-muted/40 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <input
                        aria-label={`Nome sugerido de ${item.suggestedName}`}
                        value={
                          drafts[item.id]?.suggestedName ?? item.suggestedName
                        }
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [item.id]: {
                              suggestedName: event.target.value,
                              suggestedCategory:
                                current[item.id]?.suggestedCategory ??
                                item.suggestedCategory ??
                                "",
                            },
                          }))
                        }
                        className="h-8 w-full rounded-md border border-border bg-surface px-2 text-sm font-semibold text-strong"
                      />
                      <input
                        aria-label={`Categoria sugerida de ${item.suggestedName}`}
                        value={
                          drafts[item.id]?.suggestedCategory ??
                          item.suggestedCategory ??
                          ""
                        }
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [item.id]: {
                              suggestedName:
                                current[item.id]?.suggestedName ??
                                item.suggestedName,
                              suggestedCategory: event.target.value,
                            },
                          }))
                        }
                        className="mt-1 h-8 w-full rounded-md border border-border bg-surface px-2 text-xs text-medium"
                      />
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge tone="info">Aguardando confirmacao</StatusBadge>
                      <StatusBadge tone={item.skillId ? "neutral" : "warning"}>
                        {item.skillId ? "Catalogo" : "Nova"}
                      </StatusBadge>
                    </div>
                  </div>

                  {item.evidenceSummary ? (
                    <p className="mt-2 text-xs text-medium">
                      {item.evidenceSummary}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`Nivel de ${item.suggestedName}`}
                      value={levels[item.id] ?? item.suggestedLevel}
                      onChange={(event) =>
                        setLevels((current) => ({
                          ...current,
                          [item.id]: event.target.value as SkillLevel,
                        }))
                      }
                      className={cn(
                        "h-8 rounded-md border border-border bg-surface px-2 text-xs font-medium text-strong",
                      )}
                    >
                      {skillLevelOrder.map((level) => (
                        <option key={level} value={level}>
                          {skillLevelLabels[level]}
                        </option>
                      ))}
                    </select>
                    <ActionButton
                      variant="secondary"
                      size="sm"
                      icon={Save}
                      disabled={isPending}
                      onClick={() => update(item)}
                    >
                      Salvar edicao
                    </ActionButton>
                    <ActionButton
                      variant="success"
                      size="sm"
                      icon={Check}
                      disabled={isPending || !item.skillId}
                      onClick={() => accept(item)}
                    >
                      Confirmar
                    </ActionButton>
                    <ActionButton
                      variant="danger"
                      size="sm"
                      icon={X}
                      disabled={isPending}
                      onClick={() => dismiss(item)}
                    >
                      Rejeitar
                    </ActionButton>
                    <ActionButton
                      variant="danger"
                      size="sm"
                      icon={Trash2}
                      disabled={isPending}
                      onClick={() => remove(item)}
                    >
                      Apagar
                    </ActionButton>
                  </div>
                  {!item.skillId ? (
                    <p className="mt-2 text-xs text-soft">
                      Fora do catalogo: manter pendente para curadoria de admin.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </SectionPanel>
  );
}
