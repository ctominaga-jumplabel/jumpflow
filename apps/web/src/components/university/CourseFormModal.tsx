"use client";

import { useState, useTransition } from "react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import type { FeedbackTone } from "@/components/ui/Feedback";
import { createCourse, updateCourse } from "@/app/app/universidade/actions";
import type { CourseView, TrackOption } from "@/lib/university/types";
import { SelectField, TextField } from "./fields";

export interface CourseFormModalProps {
  open: boolean;
  course: CourseView | null;
  trackOptions: TrackOption[];
  skillOptions: { id: string; name: string }[];
  onClose: () => void;
  notify: (tone: FeedbackTone, text: string) => void;
}

function parseHours(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Cria/edita um curso (curadoria), com vínculo opcional a trilha e skill. */
export function CourseFormModal({
  open,
  course,
  trackOptions,
  skillOptions,
  onClose,
  notify,
}: CourseFormModalProps) {
  const editing = course !== null;
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(course?.title ?? "");
  const [trackId, setTrackId] = useState(course?.trackId ?? "");
  const [provider, setProvider] = useState(course?.provider ?? "");
  const [hours, setHours] = useState(
    course?.hours !== null && course?.hours !== undefined
      ? String(course.hours)
      : "",
  );
  const [externalUrl, setExternalUrl] = useState(course?.externalUrl ?? "");
  const [skillId, setSkillId] = useState(course?.skillId ?? "");

  function submit() {
    startTransition(async () => {
      const payload = {
        title: title.trim(),
        trackId: trackId || null,
        provider: provider.trim() || null,
        hours: parseHours(hours),
        externalUrl: externalUrl.trim() || null,
        skillId: skillId || null,
      };
      const result = editing
        ? await updateCourse({ id: course!.id, ...payload })
        : await createCourse(payload);
      if (result.ok) {
        onClose();
        notify("success", editing ? "Curso atualizado." : "Curso criado.");
      } else {
        notify("warning", result.message);
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Editar curso" : "Novo curso"}
      className="max-w-lg"
      footer={
        <>
          <ActionButton variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </ActionButton>
          <ActionButton onClick={submit} disabled={pending || title.trim().length < 3}>
            {editing ? "Salvar" : "Criar curso"}
          </ActionButton>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="Título" value={title} onChange={setTitle} required />
        <SelectField
          label="Trilha (opcional)"
          value={trackId}
          emptyLabel="Curso avulso (sem trilha)"
          options={trackOptions.map((t) => ({ value: t.id, label: t.title }))}
          onChange={setTrackId}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Provedor (opcional)"
            value={provider}
            placeholder="Ex.: Alura, AWS"
            onChange={setProvider}
          />
          <TextField
            label="Carga horária (h, opcional)"
            type="number"
            step="any"
            value={hours}
            onChange={setHours}
          />
        </div>
        <TextField
          label="URL do conteúdo (opcional)"
          type="url"
          value={externalUrl}
          placeholder="https://"
          onChange={setExternalUrl}
        />
        <SelectField
          label="Competência (opcional)"
          value={skillId}
          emptyLabel="Sem competência vinculada"
          hint="Ao concluir o curso, registra evidência desta competência se o consultor já a possui."
          options={skillOptions.map((s) => ({ value: s.id, label: s.name }))}
          onChange={setSkillId}
        />
      </div>
    </Modal>
  );
}
