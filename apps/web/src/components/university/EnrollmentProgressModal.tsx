"use client";

import { useState, useTransition } from "react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import type { FeedbackTone } from "@/components/ui/Feedback";
import { updateEnrollmentProgress } from "@/app/app/universidade/actions";
import type { CatalogCourseView } from "@/lib/university/types";
import { TextField } from "./fields";

export interface EnrollmentProgressModalProps {
  open: boolean;
  course: CatalogCourseView;
  onClose: () => void;
  notify: (tone: FeedbackTone, text: string) => void;
}

function toInt(value: string): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function toNum(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Atualiza progresso/horas da PRÓPRIA matrícula (US matrícula/progresso). Estado
 * inicial derivado por key (enrollment.id no pai); sem useEffect. Ao informar
 * 100%, o servidor marca COMPLETED e (se houver skill) registra evidência.
 */
export function EnrollmentProgressModal({
  open,
  course,
  onClose,
  notify,
}: EnrollmentProgressModalProps) {
  const enrollment = course.enrollment;
  const [pending, startTransition] = useTransition();
  const [pct, setPct] = useState(String(enrollment?.progressPct ?? 0));
  const [hours, setHours] = useState(String(enrollment?.hoursCompleted ?? 0));

  if (!enrollment) return null;

  function submit() {
    startTransition(async () => {
      const result = await updateEnrollmentProgress({
        enrollmentId: enrollment!.id,
        progressPct: toInt(pct),
        hoursCompleted: toNum(hours),
      });
      if (result.ok) {
        onClose();
        notify(
          "success",
          result.data.status === "COMPLETED"
            ? "Curso concluído! Progresso registrado."
            : "Progresso atualizado.",
        );
      } else {
        notify("warning", result.message);
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Atualizar progresso"
      description={course.title}
      className="max-w-md"
      footer={
        <>
          <ActionButton variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </ActionButton>
          <ActionButton onClick={submit} disabled={pending}>
            Salvar progresso
          </ActionButton>
        </>
      }
    >
      <div className="space-y-4">
        <TextField
          label="Progresso (%)"
          type="number"
          step="1"
          value={pct}
          onChange={setPct}
        />
        <TextField
          label="Horas concluídas"
          type="number"
          step="any"
          value={hours}
          onChange={setHours}
        />
        <p className="text-xs text-soft">
          Ao informar 100%, o curso é marcado como concluído. Cursos ligados a uma
          competência registram a conclusão como evidência da sua skill.
        </p>
      </div>
    </Modal>
  );
}
