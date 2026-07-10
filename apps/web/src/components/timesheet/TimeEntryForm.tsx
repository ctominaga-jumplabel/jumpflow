"use client";

import { useId, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  FileText,
  Paperclip,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ActionButton } from "@/components/ui/ActionButton";
import { cn } from "@/lib/utils";
import { focusRing, focusRingInput } from "@/lib/styles";
import {
  activityLabels,
  activityOrder,
  type ActivityType,
  type TimeEntryAttachmentMeta,
  type WeekDay,
} from "@/lib/timesheet/types";
import {
  collectProjectHolidays,
  EMPTY_HOLIDAY_LOOKUP,
  needsWorkdayHolidayConfirmation,
  resolveProjectHoliday,
  type HolidayLookup,
} from "@/lib/timesheet/holidays";
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

/**
 * Intenção de anexo emitida no submit (melhoria #2). O parent (TimesheetWeekView)
 * é quem persiste: `upload` chama a server action de anexo com o id retornado
 * pelo save; `remove` remove o anexo existente. `undefined` = não mexeu no anexo.
 */
export type TimeEntryAttachmentIntent =
  | { kind: "upload"; file: File }
  | { kind: "remove" };

/**
 * Pré-checagem client-side do anexo (o SERVIDOR é a autoridade —
 * lib/storage/file-validation.ts): mesma whitelist e teto de 10 MB de Despesas.
 */
const ATTACH_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp";
const ATTACH_ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
const ATTACH_ACCEPTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
const ATTACH_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function isAcceptedAttachment(file: File): boolean {
  if (file.type) return ATTACH_ACCEPTED_TYPES.includes(file.type);
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  return ATTACH_ACCEPTED_EXTENSIONS.includes(ext);
}

export interface TimeEntryFormProps {
  open: boolean;
  onClose: () => void;
  projects: TimeEntryFormProject[];
  days: WeekDay[];
  /**
   * Project-aware holiday lookup. Habilita o aviso e a CONFIRMAÇÃO ao lançar
   * "Dia Útil" (WORKDAY) numa data que é feriado para o projeto selecionado.
   * Ausente no modo demo → nenhum aviso/confirmação.
   */
  holidays?: HolidayLookup;
  /** Pre-filled values when editing an existing entry. */
  initial?: TimeEntryFormValue | null;
  onSubmit: (
    value: TimeEntryFormValue,
    attachment?: TimeEntryAttachmentIntent,
  ) => void;
  /**
   * Delete the entry behind the currently selected day (db mode only). The
   * view resolves which persisted entry the value points at.
   */
  onDelete?: (value: TimeEntryFormValue) => void;
  /** Disable actions while a server action is in flight. */
  busy?: boolean;
  /**
   * Whether the current user may see/edit "Faturável" (melhoria Onda B). Hidden
   * for consultores puros (sem papel de gestão); default `true` mantém o
   * comportamento antigo (gestor/admin/finance/demo). Quando oculto, o valor
   * segue no submit (default `true`, ou `false` automático para ON_CALL).
   */
  canEditBillable?: boolean;
  /**
   * db mode: object storage está configurado, então o anexo opcional pode ser
   * oferecido. `false` (demo/sem storage) esconde o campo (degrade honesto).
   */
  attachmentsAvailable?: boolean;
  /** Anexo já persistido do lançamento sendo editado (nome do arquivo). */
  initialAttachment?: TimeEntryAttachmentMeta | null;
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
  holidays = EMPTY_HOLIDAY_LOOKUP,
  initial,
  onSubmit,
  onDelete,
  busy = false,
  canEditBillable = true,
  attachmentsAvailable = false,
  initialAttachment = null,
}: TimeEntryFormProps) {
  const [value, setValue] = useState<TimeEntryFormValue>(
    initial ?? emptyValue(days),
  );
  const [showErrors, setShowErrors] = useState(false);
  // Anexo opcional (melhoria #2): arquivo recém-escolhido (ainda não enviado),
  // flag de remoção do anexo persistido e erro de pré-checagem client-side.
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const attachInputId = useId();
  // Diálogo de confirmação "Dia Útil em feriado" (Onda A-ext). Aberto no submit
  // quando a regra dispara; confirmar chama onSubmit, cancelar volta ao form.
  const [confirmHoliday, setConfirmHoliday] = useState(false);

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
      setConfirmHoliday(false);
      setAttachFile(null);
      setRemoveAttachment(false);
      setAttachError(null);
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

  // Feriado do dia selecionado, PROJECT-AWARE (global OU vinculado ao projeto
  // escolhido). Derivado de props/estado — sem efeito, sem setState. Usado no
  // aviso passivo e como base do gatilho no modo diário.
  const selectedHolidayName = resolveProjectHoliday(
    holidays,
    value.projectId,
    value.date,
  );

  // Datas de feriado atingidas pelo lançamento, PROJECT-AWARE:
  // - modo diário/edição: a data única selecionada;
  // - modo semanal: TODAS as datas efetivas (dias-da-semana marcados mapeados
  //   para as datas da semana visível — índice i => weekday i+1), de modo que um
  //   feriado que caia em qualquer um dos dias gerados dispare a confirmação.
  // Derivado de props/estado; a coleta pura vive em lib/timesheet/holidays.ts.
  const weeklyEffectiveDates =
    value.mode === "weekly"
      ? days
          .filter((_, index) => value.weekdays.includes(index + 1))
          .map((day) => day.date)
      : [];
  const holidayHits =
    value.mode === "weekly"
      ? collectProjectHolidays(holidays, value.projectId, weeklyEffectiveDates)
      : selectedHolidayName
        ? [{ date: value.date, name: selectedHolidayName }]
        : [];

  // Dispara a confirmação para "Dia Útil" (WORKDAY) em feriado, tanto no modo
  // diário quanto no semanal. Não bloqueia: confirmar salva normalmente.
  const holidayConfirmRequired = needsWorkdayHolidayConfirmation(
    value.activity,
    holidayHits[0]?.name,
  );

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

  // O anexo só faz sentido num lançamento único (diário/edição): o modo semanal
  // gera vários lançamentos e o anexo é 1:1 com um TimeEntry. Também depende de
  // storage configurado (degrade honesto quando ausente).
  const attachmentFieldVisible = attachmentsAvailable && value.mode === "daily";

  /** Intenção de anexo a enviar no submit; `undefined` = não mexeu no anexo. */
  function attachmentIntent(): TimeEntryAttachmentIntent | undefined {
    if (!attachmentFieldVisible) return undefined;
    if (attachFile) return { kind: "upload", file: attachFile };
    if (removeAttachment && initialAttachment) return { kind: "remove" };
    return undefined;
  }

  function handleSubmit() {
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    // "Dia Útil" em feriado: pede confirmação antes de salvar (não bloqueia —
    // confirmar salva normalmente).
    if (holidayConfirmRequired) {
      setConfirmHoliday(true);
      return;
    }
    onSubmit(value, attachmentIntent());
  }

  /** Confirmação do "Dia Útil em feriado": salva de fato. */
  function confirmAndSubmit() {
    setConfirmHoliday(false);
    onSubmit(value, attachmentIntent());
  }

  /** Pré-checagem do arquivo escolhido (tipo/tamanho) antes de aceitar. */
  function handleAttachFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!isAcceptedAttachment(file)) {
      setAttachError("Formato não aceito. Use PDF, JPG, PNG ou WEBP.");
      return;
    }
    if (file.size > ATTACH_MAX_SIZE_BYTES) {
      setAttachError("Arquivo acima de 10 MB.");
      return;
    }
    setAttachError(null);
    setRemoveAttachment(false);
    setAttachFile(file);
  }

  /** Limpa o arquivo recém-escolhido, voltando ao anexo persistido (se houver). */
  function clearPickedAttachment() {
    setAttachFile(null);
    setAttachError(null);
    if (attachInputRef.current) attachInputRef.current.value = "";
  }

  /** Marca o anexo persistido para remoção no submit. */
  function markAttachmentForRemoval() {
    setAttachFile(null);
    setRemoveAttachment(true);
    setAttachError(null);
    if (attachInputRef.current) attachInputRef.current.value = "";
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
              {days.map((day) => {
                const dayHoliday = resolveProjectHoliday(
                  holidays,
                  value.projectId,
                  day.date,
                );
                return (
                  <option key={day.date} value={day.date}>
                    {day.label} · {day.date.slice(8, 10)}/{day.date.slice(5, 7)}
                    {dayHoliday ? " · Feriado" : ""}
                  </option>
                );
              })}
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

        {/* "Faturável" é oculto para consultores puros (Onda B): o valor segue
            no submit (default true, ou false automático para ON_CALL), mas só
            gestão/admin/finance vê e edita o controle. */}
        {canEditBillable ? (
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
        ) : null}

        {/* Anexo opcional (melhoria #2): exceção disponível em qualquer
            lançamento diário. Enviado após salvar, com o id retornado. */}
        {attachmentFieldVisible ? (
          <div>
            <span className="mb-1 block text-xs font-semibold text-medium">
              Anexo{" "}
              <span className="font-normal text-soft">
                (opcional · PDF, JPG, PNG ou WEBP, até 10 MB)
              </span>
            </span>
            {attachFile ? (
              <div className="flex items-center gap-3 rounded-md border border-border bg-surface-muted/50 px-3 py-2">
                <FileText
                  aria-hidden="true"
                  className="size-4 shrink-0 text-medium"
                />
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-strong">
                  {attachFile.name}
                </p>
                <button
                  type="button"
                  onClick={clearPickedAttachment}
                  aria-label="Remover arquivo selecionado"
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-md text-medium transition-colors hover:bg-surface hover:text-strong",
                    focusRing,
                  )}
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </div>
            ) : initialAttachment && !removeAttachment ? (
              <div className="flex items-center gap-3 rounded-md border border-border bg-surface-muted/50 px-3 py-2">
                <FileText
                  aria-hidden="true"
                  className="size-4 shrink-0 text-medium"
                />
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-strong">
                  {initialAttachment.fileName}
                </p>
                <label
                  htmlFor={attachInputId}
                  className={cn(
                    "shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs font-semibold text-brand transition-colors hover:bg-surface",
                    focusRing,
                  )}
                >
                  Substituir
                </label>
                <button
                  type="button"
                  onClick={markAttachmentForRemoval}
                  aria-label="Remover anexo"
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-md text-medium transition-colors hover:bg-surface hover:text-strong",
                    focusRing,
                  )}
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </div>
            ) : (
              <label
                htmlFor={attachInputId}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-surface px-3 py-2.5 text-sm text-medium transition-colors hover:border-brand hover:text-strong",
                  focusRing,
                )}
              >
                <Paperclip aria-hidden="true" className="size-4" />
                Anexar arquivo
              </label>
            )}
            <input
              ref={attachInputRef}
              id={attachInputId}
              type="file"
              accept={ATTACH_ACCEPT}
              className="sr-only"
              onChange={(e) => handleAttachFiles(e.target.files)}
            />
            {attachError ? (
              <p role="alert" className="mt-1 text-xs font-medium text-danger">
                {attachError}
              </p>
            ) : null}
          </div>
        ) : null}
      </form>

      {/* Confirmação "Dia Útil em feriado" (Onda A-ext). Segue o padrão de
          Modal do design system (mesmo componente usado pelos demais fluxos de
          Horas). Confirmar salva; cancelar mantém o formulário aberto. */}
      <Modal
        open={confirmHoliday}
        onClose={() => setConfirmHoliday(false)}
        title="Lançar em feriado?"
        description={
          holidayHits.length > 1
            ? "Confirme se realmente deseja apontar Dia Útil nestas datas."
            : "Confirme se realmente deseja apontar Dia Útil nesta data."
        }
        footer={
          <>
            <ActionButton
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => setConfirmHoliday(false)}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              variant="primary"
              size="sm"
              icon={Save}
              disabled={busy}
              onClick={confirmAndSubmit}
            >
              Lançar mesmo assim
            </ActionButton>
          </>
        }
      >
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
          <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            <p>
              {holidayHits.length > 1
                ? "As seguintes datas são feriado:"
                : "Esta data é feriado:"}
            </p>
            <ul className={holidayHits.length > 1 ? "list-inside list-disc" : ""}>
              {holidayHits.map((hit) => (
                <li key={hit.date}>
                  {hit.date.slice(8, 10)}/{hit.date.slice(5, 7)} ({hit.name})
                </li>
              ))}
            </ul>
            <p>Deseja lançar como Dia Útil mesmo assim?</p>
          </div>
        </div>
      </Modal>
    </Modal>
  );
}
