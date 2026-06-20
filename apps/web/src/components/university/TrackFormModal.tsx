"use client";

import { useState, useTransition } from "react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import type { FeedbackTone } from "@/components/ui/Feedback";
import { createTrack, updateTrack } from "@/app/app/universidade/actions";
import type { TrackView } from "@/lib/university/types";
import { TextAreaField, TextField } from "./fields";

export interface TrackFormModalProps {
  open: boolean;
  track: TrackView | null;
  onClose: () => void;
  notify: (tone: FeedbackTone, text: string) => void;
}

/** Cria/edita uma trilha (curadoria). Estado inicial por key no pai; sem useEffect. */
export function TrackFormModal({
  open,
  track,
  onClose,
  notify,
}: TrackFormModalProps) {
  const editing = track !== null;
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(track?.title ?? "");
  const [description, setDescription] = useState(track?.description ?? "");
  const [category, setCategory] = useState(track?.category ?? "");

  function submit() {
    startTransition(async () => {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
      };
      const result = editing
        ? await updateTrack({ id: track!.id, ...payload })
        : await createTrack(payload);
      if (result.ok) {
        onClose();
        notify("success", editing ? "Trilha atualizada." : "Trilha criada.");
      } else {
        notify("warning", result.message);
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Editar trilha" : "Nova trilha"}
      className="max-w-lg"
      footer={
        <>
          <ActionButton variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </ActionButton>
          <ActionButton onClick={submit} disabled={pending || title.trim().length < 3}>
            {editing ? "Salvar" : "Criar trilha"}
          </ActionButton>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="Título" value={title} onChange={setTitle} required />
        <TextField
          label="Categoria (opcional)"
          value={category}
          placeholder="Ex.: Cloud, Liderança"
          onChange={setCategory}
        />
        <TextAreaField
          label="Descrição (opcional)"
          value={description}
          onChange={setDescription}
        />
      </div>
    </Modal>
  );
}
