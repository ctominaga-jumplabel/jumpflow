"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Save, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ActionButton } from "@/components/ui/ActionButton";
import { cn } from "@/lib/utils";
import { focusRingInput } from "@/lib/styles";
import {
  activityLabels,
  activityOrder,
  type ActivityType,
  type WeekDay,
} from "@/lib/timesheet/types";
import { timeEntryEffectiveHours } from "@/lib/timesheet/effective-hours";
import { formatHours } from "@/lib/format";
import { isTranscriptionEnabled } from "@/lib/transcription/flags";
import {
  ClockFields,
  clockHours,
  emptyClock,
  type ClockFieldsValue,
} from "./ClockFields";
import { ActivityVoiceButton } from "./ActivityVoiceButton";

/**
 * Fator de remuneração sugerido para Sobreaviso (ON_CALL). O consultor é pago
 * pelo equivalente `horas x fator`; o sobreaviso normalmente vale uma fração da
 * hora cheia. Editável no formulário.
 */
const DEFAULT_ON_CALL_MULTIPLIER = 0.33;

export interface TimeEntryFormValue {
  mode: "daily" | "weekly";
  projectId: string;
  /**
   * Activity code. Typed as `string` so it can carry a legacy value when
   * pre-filling the edit form from an existing row; the new-entry select only
   * offers canonical `ActivityType` options, and the server validates on write.
   */
  activity: string;
  /** ISO date (yyyy-mm-dd) of the day being logged. */
  date: string;
  /** Relógio de ponto: Início / Pausa / Retorno / Saída. */
  clock: ClockFieldsValue;
  weekdays: number[];
  description: string;
  billable: boolean;
  /**
   * Fator de remuneração (melhoria #2). 1.00 para atividades normais; um fator
   * fracionário para ON_CALL. O equivalente remunerado é `horas x fator`.
   */
  multiplier: number;
}

export interface TimeEntryFormProject {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
}

export interface TimeEntryFormProps {
  open: boolean;
  onClose: () => void;
  projects: TimeEntryFormProject[];
  days: WeekDay[];
  /** Pre-filled values when editing an existing entry. */
  initial?: TimeEntryFormValue | null;
  onSubmit: (value: TimeEntryFormValue) => void;
  /**
   * Delete the entry behind the currently selected day (db mode only). The
   * view resolves which persisted entry the value points at.
   */
  onDelete?: (value: TimeEntryFormValue) => void;
  /** Disable actions while a server action is in flight. */
  busy?: boolean;
}

const inputClass = (invalid: boolean) =>
  cn(
    "w-full rounded-md border bg-surface px-3 py-2 text-sm text-strong placeholder:text-soft",
    focusRingInput,
    invalid ? "border-danger" : "border-border",
  );

const labelClass = "mb-1 block text-xs font-semibold text-medium";

const emptyValue = (days: WeekDay[]): TimeEntryFormValue => ({
  mode: "daily",
  projectId: "",
  activity: "WORKDAY",
  date: days[0]?.date ?? "",
  clock: { ...emptyClock },
  weekdays: [1, 2, 3, 4, 5],
  description: "",
  billable: true,
  multiplier: 1,
});

const weekdayOptions = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 7, label: "Dom" },
];

/**
 * New/edit time-entry form (modal). One entry = a project+activity for a given
 * date, logged via the relógio de ponto (Início/Pausa/Retorno/Saída). Hours are
 * derived from the clock; description is mandatory. Client-side validation is a
 * pre-check only — the server action is the authority.
 */
export function TimeEntryForm({
  open,
  onClose,
  projects,
  days,
  initial,
  onSubmit,
  onDelete,
  busy = false,
}: TimeEntryFormProps) {
  const [value, setValue] = useState<TimeEntryFormValue>(
    initial ?? emptyValue(days),
  );
  const [showErrors, setShowErrors] = useState(false);

  // Re-initialize when the modal (re)opens for a different entry (new vs edit).
  // Render-time state adjustment — the React-recommended alternative to an
  // effect for "reset state when a prop changes".
  const [session, setSession] = useState<{
    open: boolean;
    initial: TimeEntryFormValue | null | undefined;
  }>({ open, initial });
  if (session.open !== open || session.initial !== initial) {
    setSession({ open, initial });
    if (open) {
      setValue(initial ?? emptyValue(days));
      setShowErrors(false);
    }
  }

  const errors = useMemo(
    () => ({
      projectId: !value.projectId,
      weekdays: value.mode === "weekly" && value.weekdays.length === 0,
      clock: clockHours(value.clock) === null,
      description: value.description.trim().length === 0,
      // O fator só é editável (e validado) para ON_CALL; demais atividades
      // mantêm 1.00 e o servidor revalida em qualquer caso.
      multiplier: value.activity === "ON_CALL" && !(value.multiplier > 0),
    }),
    [
      value.mode,
      value.projectId,
      value.weekdays.length,
      value.clock,
      value.description,
      value.activity,
      value.multiplier,
    ],
  );
  const hasErrors =
    errors.projectId ||
    errors.clock ||
    errors.weekdays ||
    errors.description ||
    errors.multiplier;

  // Equivalente remunerado (horas × fator), via a fonte única de cálculo. Usa 0
  // quando o relógio ainda não fecha um total válido.
  const effectiveHours = timeEntryEffectiveHours(
    clockHours(value.clock) ?? 0,
    value.multiplier > 0 ? value.multiplier : 0,
  );

  // Feriado do dia selecionado (aviso não-bloqueante). Derivado de props/estado
  // — sem efeito, sem setState.
  const selectedHolidayName = days.find((d) => d.date === value.date)
    ?.holidayName;

  const isEditing = Boolean(initial);
  // Flag de cliente (NEXT_PUBLIC_TRANSCRIPTION). Quando off, o mic some e o
  // fluxo de digitar manualmente segue intacto.
  const voiceEnabled = isTranscriptionEnabled();

  /**
   * Aplica o texto transcrito à descrição: anexa ao que já existe (preservando
   * o que o consultor digitou) e separa com espaço/quebra; substitui quando o
   * campo está vazio. O consultor sempre pode editar depois.
   */
  function applyTranscription(text: string) {
    const transcript = text.trim();
    if (!transcript) return;
    setValue((v) => {
      const current = v.description.trim();
      const merged = current ? `${current} ${transcript}` : transcript;
      return { ...v, description: merged };
    });
  }

  function handleSubmit() {
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    onSubmit(value);
  }

  function toggleWeekday(day: number) {
    setValue((current) => {
      const hasDay = current.weekdays.includes(day);
      const weekdays = hasDay
        ? current.weekdays.filter((item) => item !== day)
        : [...current.weekdays, day].sort((a, b) => a - b);
      return { ...current, weekdays };
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? "Editar lançamento" : "Novo lançamento"}
      description={
        isEditing
          ? "Informe projeto, atividade, dia e horários."
          : "Informe projeto, atividade, modo e horários."
      }
      footer={
        <>
          {isEditing && onDelete ? (
            <ActionButton
              variant="danger"
              size="sm"
              icon={Trash2}
              disabled={busy}
              onClick={() => onDelete(value)}
              className="mr-auto"
            >
              Excluir
            </ActionButton>
          ) : null}
          <ActionButton
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </ActionButton>
          <ActionButton
            variant="primary"
            size="sm"
            icon={Save}
            disabled={busy}
            onClick={handleSubmit}
          >
            Salvar
          </ActionButton>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <div>
          <label htmlFor="entry-project" className={labelClass}>
            Projeto
          </label>
          <select
            id="entry-project"
            value={value.projectId}
            onChange={(e) => setValue((v) => ({ ...v, projectId: e.target.value }))}
            disabled={isEditing}
            aria-invalid={showErrors && errors.projectId}
            className={cn(
              inputClass(showErrors && errors.projectId),
              isEditing && "cursor-not-allowed opacity-70",
            )}
          >
            <option value="">Selecione um projeto</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.clientName}
              </option>
            ))}
          </select>
          {showErrors && errors.projectId ? (
            <p className="mt-1 text-xs text-danger">Selecione um projeto.</p>
          ) : null}
        </div>

        {!isEditing ? (
          <fieldset>
            <legend className={labelClass}>Modo</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["daily", "weekly"] as const).map((mode) => (
                <label
                  key={mode}
                  className={cn(
                    "flex h-9 cursor-pointer items-center justify-center rounded-md border text-xs font-semibold",
                    value.mode === mode
                      ? "border-ink bg-marker text-ink"
                      : "border-border bg-surface text-medium",
                  )}
                >
                  <input
                    type="radio"
                    name="entry-mode"
                    value={mode}
                    checked={value.mode === mode}
                    onChange={() => setValue((v) => ({ ...v, mode }))}
                    className="sr-only"
                  />
                  {mode === "daily" ? "Diário" : "Semanal"}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="entry-activity" className={labelClass}>
              Atividade
            </label>
            <select
              id="entry-activity"
              value={value.activity}
              onChange={(e) => {
                const activity = e.target.value as ActivityType;
                setValue((v) => {
                  const wasOnCall = v.activity === "ON_CALL";
                  const isOnCall = activity === "ON_CALL";
                  if (isOnCall && !wasOnCall) {
                    // Entering ON_CALL: sugerir o fator usual e marcar como não
                    // faturável por padrão (sobreaviso normalmente não é faturado).
                    return {
                      ...v,
                      activity,
                      multiplier: DEFAULT_ON_CALL_MULTIPLIER,
                      billable: false,
                    };
                  }
                  if (!isOnCall && wasOnCall) {
                    // Leaving ON_CALL: voltar aos defaults de atividade normal.
                    return { ...v, activity, multiplier: 1, billable: true };
                  }
                  return { ...v, activity };
                });
              }}
              disabled={isEditing}
              className={cn(
                inputClass(false),
                isEditing && "cursor-not-allowed opacity-70",
              )}
            >
              {activityOrder.map((activity) => (
                <option key={activity} value={activity}>
                  {activityLabels[activity]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="entry-day" className={labelClass}>
              Dia
            </label>
            <select
              id="entry-day"
              value={value.date}
              onChange={(e) =>
                setValue((v) => ({ ...v, date: e.target.value }))
              }
              className={inputClass(false)}
            >
              {days.map((day) => (
                <option key={day.date} value={day.date}>
                  {day.label} · {day.date.slice(8, 10)}/{day.date.slice(5, 7)}
                  {day.holidayName ? " · Feriado" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Aviso NÃO-BLOQUEANTE: o dia escolhido é feriado. Não impede o
            submit — apenas sinaliza. */}
        {selectedHolidayName ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning"
          >
            <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              Você está apontando em um feriado ({selectedHolidayName}). Você
              ainda pode salvar normalmente.
            </span>
          </div>
        ) : null}

        {value.mode === "weekly" && !isEditing ? (
          <fieldset>
            <legend className={labelClass}>Dias da semana</legend>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {weekdayOptions.map((day) => (
                <label
                  key={day.value}
                  className={cn(
                    "flex h-9 cursor-pointer items-center justify-center rounded-md border text-xs font-semibold",
                    value.weekdays.includes(day.value)
                      ? "border-ink bg-marker text-ink"
                      : "border-border bg-surface text-medium",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={value.weekdays.includes(day.value)}
                    onChange={() => toggleWeekday(day.value)}
                    className="sr-only"
                  />
                  {day.label}
                </label>
              ))}
            </div>
            {showErrors && errors.weekdays ? (
              <p className="mt-1 text-xs text-danger">
                Selecione ao menos um dia.
              </p>
            ) : null}
          </fieldset>
        ) : null}

        <fieldset>
          <legend className={labelClass}>Horários</legend>
          <ClockFields
            value={value.clock}
            onChange={(clock) => setValue((v) => ({ ...v, clock }))}
            showError={showErrors}
            idPrefix="entry"
          />
        </fieldset>

        {value.activity === "ON_CALL" ? (
          <div>
            <label htmlFor="entry-multiplier" className={labelClass}>
              Fator de remuneração
            </label>
            <input
              id="entry-multiplier"
              type="number"
              min="0"
              step="0.01"
              value={value.multiplier}
              onChange={(e) =>
                setValue((v) => ({
                  ...v,
                  // Mantém vazio como 0 controlado; o servidor valida > 0.
                  multiplier:
                    e.target.value === "" ? 0 : Number(e.target.value),
                }))
              }
              aria-invalid={showErrors && errors.multiplier}
              className={cn(
                inputClass(showErrors && errors.multiplier),
                "w-32",
              )}
            />
            {showErrors && errors.multiplier ? (
              <p className="mt-1 text-xs text-danger">
                O fator deve ser maior que zero.
              </p>
            ) : (
              <p className="mt-1 text-xs text-soft">
                Sobreaviso é remunerado pelo equivalente (horas × fator).
                Equivalente:{" "}
                <span className="font-semibold tabular-nums text-medium">
                  {formatHours(effectiveHours)}
                </span>
                .
              </p>
            )}
          </div>
        ) : null}

        <div>
          <label htmlFor="entry-description" className={labelClass}>
            Descrição
          </label>
          <textarea
            id="entry-description"
            value={value.description}
            onChange={(e) =>
              setValue((v) => ({ ...v, description: e.target.value }))
            }
            rows={2}
            placeholder="O que foi feito neste dia."
            aria-invalid={showErrors && errors.description}
            className={cn(inputClass(showErrors && errors.description), "resize-y")}
          />
          {showErrors && errors.description ? (
            <p className="mt-1 text-xs text-danger">Descrição é obrigatória.</p>
          ) : null}
          {voiceEnabled ? (
            <ActivityVoiceButton
              onTranscribed={applyTranscription}
              disabled={busy}
            />
          ) : null}
        </div>

        <label className="flex items-center gap-2 text-sm text-medium">
          <input
            type="checkbox"
            checked={value.billable}
            onChange={(e) =>
              setValue((v) => ({ ...v, billable: e.target.checked }))
            }
            className="size-4 rounded border-border text-brand focus:ring-brand"
          />
          Faturável
        </label>
      </form>
    </Modal>
  );
}
