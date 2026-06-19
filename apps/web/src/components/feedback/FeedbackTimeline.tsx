"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Pencil } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { FeedbackTone } from "@/components/ui/Feedback";
import {
  feedbackSourceLabels,
  feedbackTypeLabels,
  feedbackTypeTone,
  feedbackVisibilityLabels,
  type FeedbackItem,
  type FeedbackVisibility,
} from "@/lib/feedback/types";
import {
  setFeedbackVisibility,
  updateFeedback,
} from "@/app/app/feedback/actions";
import { TextArea } from "./fields";

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

interface EditDraft {
  id: string;
  body: string;
  visibility: FeedbackVisibility;
  reason: string;
}

export interface FeedbackTimelineProps {
  items: FeedbackItem[];
  notify: (tone: FeedbackTone, text: string) => void;
}

/** Cronological timeline (newest first) with inline manage controls (US15.02/03). */
export function FeedbackTimeline({ items, notify }: FeedbackTimelineProps) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<EditDraft | null>(null);

  function toggleVisibility(item: FeedbackItem) {
    const next: FeedbackVisibility =
      item.visibility === "PRIVATE" ? "SHARED" : "PRIVATE";
    startTransition(async () => {
      const result = await setFeedbackVisibility({ id: item.id, visibility: next });
      if (result.ok) {
        notify(
          "success",
          next === "SHARED"
            ? "Feedback compartilhado com o consultor."
            : "Feedback marcado como privado.",
        );
      } else {
        notify("warning", result.message);
      }
    });
  }

  function submitEdit() {
    if (!draft) return;
    startTransition(async () => {
      const result = await updateFeedback({
        id: draft.id,
        body: draft.body,
        visibility: draft.visibility,
        reason: draft.reason || undefined,
      });
      if (result.ok) {
        setDraft(null);
        notify("success", "Feedback atualizado.");
      } else {
        notify("warning", result.message);
      }
    });
  }

  return (
    <>
      <ol className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={feedbackTypeTone[item.type]}>
                {feedbackTypeLabels[item.type]}
              </StatusBadge>
              <StatusBadge tone="neutral">
                {feedbackSourceLabels[item.source]}
              </StatusBadge>
              <StatusBadge tone={item.visibility === "SHARED" ? "info" : "neutral"}>
                {feedbackVisibilityLabels[item.visibility]}
              </StatusBadge>
              <span className="ml-auto text-xs text-soft tabular-nums">
                {formatDate(item.createdAt)}
              </span>
            </div>

            <p className="mt-2 text-sm leading-6 text-strong">{item.body}</p>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-soft">
              <span>
                Sobre <strong className="text-medium">{item.subjectConsultantName}</strong>
              </span>
              <span>·</span>
              <span>Por {item.authorName ?? "Autor removido"}</span>
              {item.relatedProjectName ? (
                <>
                  <span>·</span>
                  <span>Projeto: {item.relatedProjectName}</span>
                </>
              ) : null}
              {item.relatedClientName ? (
                <>
                  <span>·</span>
                  <span>Cliente: {item.relatedClientName}</span>
                </>
              ) : null}
            </div>

            {item.canManage ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ActionButton
                  variant="secondary"
                  size="sm"
                  icon={item.visibility === "PRIVATE" ? Eye : EyeOff}
                  onClick={() => toggleVisibility(item)}
                  disabled={pending}
                >
                  {item.visibility === "PRIVATE"
                    ? "Compartilhar"
                    : "Tornar privado"}
                </ActionButton>
                <ActionButton
                  variant="secondary"
                  size="sm"
                  icon={Pencil}
                  onClick={() =>
                    setDraft({
                      id: item.id,
                      body: item.body,
                      visibility: item.visibility,
                      reason: "",
                    })
                  }
                  disabled={pending}
                >
                  Editar
                </ActionButton>
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title="Editar feedback"
        description="Corrija o conteúdo e/ou ajuste a visibilidade. A alteração é auditada."
        footer={
          <>
            <ActionButton
              variant="secondary"
              onClick={() => setDraft(null)}
              disabled={pending}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              onClick={submitEdit}
              disabled={pending || !draft || draft.body.trim().length < 3}
            >
              Salvar
            </ActionButton>
          </>
        }
      >
        {draft ? (
          <div className="space-y-4">
            <TextArea
              label="Feedback"
              value={draft.body}
              onChange={(body) =>
                setDraft((d) => (d ? { ...d, body } : d))
              }
              required
            />
            <label className="space-y-1 text-sm font-medium text-medium">
              Visibilidade
              <select
                value={draft.visibility}
                onChange={(event) =>
                  setDraft((d) =>
                    d
                      ? {
                          ...d,
                          visibility: event.target.value as FeedbackVisibility,
                        }
                      : d,
                  )
                }
                className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
              >
                <option value="PRIVATE">{feedbackVisibilityLabels.PRIVATE}</option>
                <option value="SHARED">{feedbackVisibilityLabels.SHARED}</option>
              </select>
              <span className="text-xs font-normal text-soft">
                Compartilhado fica visível ao consultor; privado fica restrito a
                autor, PEOPLE e gestor responsável.
              </span>
            </label>
            <TextArea
              label="Motivo da alteração (opcional)"
              value={draft.reason}
              rows={2}
              placeholder="Registrado na auditoria."
              onChange={(reason) =>
                setDraft((d) => (d ? { ...d, reason } : d))
              }
            />
          </div>
        ) : null}
      </Modal>
    </>
  );
}
