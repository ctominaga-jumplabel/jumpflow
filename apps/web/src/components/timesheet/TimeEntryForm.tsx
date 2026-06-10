"use client";

import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ActionButton } from "@/components/ui/ActionButton";
import { cn } from "@/lib/utils";
import { focusRingInput } from "@/lib/styles";
import {
  activityLabels,
  activityOrder,
  type ActivityType,
  type WeekDay,
} from "@/lib/mock-data/timesheet";

export interface TimeEntryFormValue {
  projectId: string;
  activity: ActivityType;
  dayIndex: number;
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
}

const inputClass = (invalid: boolean) =>
  cn(
    "w-full rounded-md border bg-surface px-3 py-2 text-sm text-strong placeholder:text-soft",
    focusRingInput,
    invalid ? "border-danger" : "border-border",
  );

const labelClass = "mb-1 block text-xs font-semibold text-medium";

const emptyValue = (): TimeEntryFormValue => ({
  projectId: "",
  activity: "DEVELOPMENT",
  dayIndex: 0,
  hours: 0,
  description: "",
  billable: true,
});

/**
 * New/edit time-entry form (modal). One entry = a project+activity for a given
 * weekday. Validates project and hours (> 0, ≤ 24). Saving mutates local state
 * as a DRAFT in the MVP (no persistence yet).
 */
export function TimeEntryForm({
  open,
  onClose,
  projects,
  days,
  initial,
  onSubmit,
}: TimeEntryFormProps) {
  const [value, setValue] = useState<TimeEntryFormValue>(
    initial ?? emptyValue(),
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
      const next = initial ?? emptyValue();
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
          <ActionButton variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </ActionButton>
          <ActionButton
            variant="primary"
            size="sm"
            icon={Save}
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
              value={value.dayIndex}
              onChange={(e) =>
                setValue((v) => ({ ...v, dayIndex: Number(e.target.value) }))
              }
              className={inputClass(false)}
            >
              {days.map((day, index) => (
                <option key={day.date} value={index}>
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
