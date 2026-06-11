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

export interface TimeEntryFormValue {
  projectId: string;
  /**
   * Activity code. Typed as `string` so it can carry a legacy value when
   * pre-filling the edit form from an existing row; the new-entry select only
   * offers canonical `ActivityType` options, and the server validates on write.
   */
  activity: string;
  /** ISO date (yyyy-mm-dd) of the day being logged. */
  date: string;
  hours: number;
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
  projectId: "",
  activity: "WORKDAY",
  date: days[0]?.date ?? "",
  hours: 0,
  description: "",
  billable: true,
});

/**
 * New/edit time-entry form (modal). One entry = a project+activity for a given
 * date. Client-side validation (project required, hours > 0 and ≤ 24) is a
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
  const [hoursText, setHoursText] = useState(
    initial && initial.hours > 0 ? String(initial.hours) : "",
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
      const next = initial ?? emptyValue(days);
      setValue(next);
      setHoursText(next.hours > 0 ? String(next.hours) : "");
      setShowErrors(false);
    }
  }

  const hoursValue = Number(hoursText.replace(",", "."));
  const errors = useMemo(
    () => ({
      projectId: !value.projectId,
      hours:
        !hoursText ||
        Number.isNaN(hoursValue) ||
        hoursValue <= 0 ||
        hoursValue > 24,
    }),
    [value.projectId, hoursText, hoursValue],
  );
  const hasErrors = errors.projectId || errors.hours;

  const isEditing = Boolean(initial);

  function handleSubmit() {
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    onSubmit({ ...value, hours: hoursValue });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? "Editar lançamento" : "Novo lançamento"}
      description="Informe projeto, atividade, dia e horas."
      footer={
        <>
          {isEditing && onDelete ? (
            <ActionButton
              variant="danger"
              size="sm"
              icon={Trash2}
              disabled={busy}
              onClick={() => onDelete({ ...value, hours: hoursValue })}
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

        <div>
          <label htmlFor="entry-hours" className={labelClass}>
            Horas
          </label>
          <input
            id="entry-hours"
            type="text"
            inputMode="decimal"
            value={hoursText}
            onChange={(e) => setHoursText(e.target.value)}
            placeholder="0"
            aria-invalid={showErrors && errors.hours}
            className={inputClass(showErrors && errors.hours)}
          />
          {showErrors && errors.hours ? (
            <p className="mt-1 text-xs text-danger">
              Informe horas entre 0 e 24.
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="entry-description" className={labelClass}>
            Descrição{" "}
            <span className="font-normal text-soft">(opcional)</span>
          </label>
          <textarea
            id="entry-description"
            value={value.description}
            onChange={(e) =>
              setValue((v) => ({ ...v, description: e.target.value }))
            }
            rows={2}
            placeholder="O que foi feito neste dia."
            className={cn(inputClass(false), "resize-y")}
          />
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
