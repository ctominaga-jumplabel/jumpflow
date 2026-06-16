"use client";

import { useMemo, useState } from "react";
import { Save, Trash2 } from "lucide-react";
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
import {
  ClockFields,
  clockHours,
  emptyClock,
  type ClockFieldsValue,
} from "./ClockFields";

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
}

export interface TimeEntryFormProject {
  id: string;
  name: string;
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
    }),
    [value.mode, value.projectId, value.weekdays.length, value.clock, value.description],
  );
  const hasErrors =
    errors.projectId || errors.clock || errors.weekdays || errors.description;

  const isEditing = Boolean(initial);

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
              onChange={(e) =>
                setValue((v) => ({
                  ...v,
                  activity: e.target.value as ActivityType,
                }))
              }
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
                </option>
              ))}
            </select>
          </div>
        </div>

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
