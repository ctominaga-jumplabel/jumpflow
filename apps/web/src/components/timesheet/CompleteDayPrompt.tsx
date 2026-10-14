"use client";

import { Modal } from "@/components/ui/Modal";
import { ActionButton } from "@/components/ui/ActionButton";
import { parseClockMinutes } from "@/lib/timesheet/time-clock";
import type { ClockFieldsValue } from "./ClockFields";

export interface CompleteDayPromptProps {
  /** Total de horas lançadas no dia; `null` mantém o diálogo fechado. */
  hours: number | null;
  /** "Sim": abre um novo lançamento para compor o restante do dia. */
  onCompose: () => void;
  onDismiss: () => void;
}

/**
 * Relógio sugerido para compor o restante do dia: começa onde o lançamento
 * anterior terminou e dura o que falta para a meta (limitado a 23:59), sem
 * pausa. O consultor ajusta livremente.
 */
export function remainderClock(
  previousEndTime: string,
  remainingHours: number,
): ClockFieldsValue {
  const DAY_END = 23 * 60 + 59;
  // Sempre um intervalo válido (início < fim), mesmo se o anterior terminou
  // perto da meia-noite.
  const start = Math.min(parseClockMinutes(previousEndTime) ?? 9 * 60, DAY_END - 1);
  const end = Math.max(
    start + 1,
    Math.min(start + Math.round(remainingHours * 60), DAY_END),
  );
  const hhmm = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return {
    startTime: hhmm(start),
    endTime: hhmm(end),
    breakStart: "",
    breakEnd: "",
    hasBreak: false,
  };
}

/** "6" / "6,5" — o texto do alerta já diz "horas". */
function hoursNumber(hours: number): string {
  return (Math.round(hours * 100) / 100).toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
  });
}

/**
 * Alerta para consultores de PROJETO ÚNICO (flag `allowMultipleProjects`
 * desligada): ao salvar um dia abaixo da meta diária, pergunta se ele quer
 * compor o restante com outro lançamento (outro horário ou outra atividade).
 * Não bloqueia nada — o lançamento já foi salvo.
 */
export function CompleteDayPrompt({
  hours,
  onCompose,
  onDismiss,
}: CompleteDayPromptProps) {
  return (
    <Modal
      open={hours !== null}
      onClose={onDismiss}
      title="Completar o dia?"
      description={`Você lançou ${hoursNumber(hours ?? 0)} horas, deseja compor o restante das horas com outro lançamento?`}
      footer={
        <>
          <ActionButton variant="secondary" size="sm" onClick={onDismiss}>
            Não
          </ActionButton>
          <ActionButton variant="primary" size="sm" onClick={onCompose}>
            Sim, novo lançamento
          </ActionButton>
        </>
      }
    >
      <p className="text-sm text-medium">
        O lançamento já foi salvo e enviado para aprovação.
      </p>
    </Modal>
  );
}
