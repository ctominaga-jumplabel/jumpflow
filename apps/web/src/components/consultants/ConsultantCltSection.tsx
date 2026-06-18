"use client";

import { useState } from "react";
import { Briefcase, CalendarClock, Clock, Plus, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  addHourBankEntry,
  deleteHourBankEntry,
  deleteVacation,
  saveCltInfo,
  saveVacation,
} from "@/app/app/consultores/actions";
import type {
  CltInfoInput,
  HourBankEntryKind,
} from "@/lib/consultants/schemas";
import {
  cltContractKindLabels,
  hourBankEntryKindLabels,
} from "@/lib/consultants/labels";
import type { ConsultantProfile } from "@/lib/db/consultants";
import { SelectField, TextField, consultantFieldClass } from "./fields";

export interface ConsultantCltSectionProps {
  consultantId: string;
  cltInfo: ConsultantProfile["cltInfo"];
  vacations: ConsultantProfile["vacations"];
  hourBank: ConsultantProfile["hourBank"];
  canManagePeople: boolean;
  onMessage: (message: string | null) => void;
  onReload: () => void;
}

/**
 * Trilha CLT (Story 3): contratacao + dados trabalhistas (1:1), ferias (1:N) e
 * banco de horas (ledger; saldo = soma das horas). Renderizada apenas quando o
 * tipo de contratacao e CLT ou CLT_FLEX.
 */
export function ConsultantCltSection({
  consultantId,
  cltInfo,
  vacations,
  hourBank,
  canManagePeople,
  onMessage,
  onReload,
}: ConsultantCltSectionProps) {
  return (
    <div className="space-y-4">
      <CltInfoBlock
        consultantId={consultantId}
        cltInfo={cltInfo}
        disabled={!canManagePeople}
        onMessage={onMessage}
        onReload={onReload}
      />
      <VacationBlock
        consultantId={consultantId}
        vacations={vacations}
        disabled={!canManagePeople}
        onMessage={onMessage}
        onReload={onReload}
      />
      <HourBankBlock
        consultantId={consultantId}
        hourBank={hourBank}
        disabled={!canManagePeople}
        onMessage={onMessage}
        onReload={onReload}
      />
    </div>
  );
}

function CltInfoBlock({
  consultantId,
  cltInfo,
  disabled,
  onMessage,
  onReload,
}: {
  consultantId: string;
  cltInfo: ConsultantProfile["cltInfo"];
  disabled: boolean;
  onMessage: (message: string | null) => void;
  onReload: () => void;
}) {
  const [form, setForm] = useState<CltInfoInput>(() => ({
    consultantId,
    registrationNumber: cltInfo.registrationNumber ?? undefined,
    pisPasep: cltInfo.pisPasep ?? undefined,
    ctpsNumber: cltInfo.ctpsNumber ?? undefined,
    ctpsSeries: cltInfo.ctpsSeries ?? undefined,
    admissionDate: cltInfo.admissionDate ?? undefined,
    dismissalDate: cltInfo.dismissalDate ?? undefined,
    contractKind:
      (cltInfo.contractKind as CltInfoInput["contractKind"]) ?? undefined,
    workSchedule: cltInfo.workSchedule ?? undefined,
    workShift: cltInfo.workShift ?? undefined,
    union: cltInfo.union ?? undefined,
    registeredRole: cltInfo.registeredRole ?? undefined,
  }));

  function patch(values: Partial<CltInfoInput>) {
    setForm((prev) => ({ ...prev, ...values }));
  }

  async function save() {
    const result = await saveCltInfo(form);
    onMessage(result.ok ? "Dados CLT salvos." : result.message);
    if (result.ok) onReload();
  }

  return (
    <section className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-strong">
        <Briefcase aria-hidden="true" className="size-4" />
        Contratacao CLT e dados trabalhistas
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextField
          label="Matricula"
          value={form.registrationNumber}
          onChange={(value) => patch({ registrationNumber: value })}
        />
        <TextField
          label="PIS/PASEP"
          value={form.pisPasep}
          onChange={(value) => patch({ pisPasep: value })}
        />
        <TextField
          label="Numero CTPS"
          value={form.ctpsNumber}
          onChange={(value) => patch({ ctpsNumber: value })}
        />
        <TextField
          label="Serie CTPS"
          value={form.ctpsSeries}
          onChange={(value) => patch({ ctpsSeries: value })}
        />
        <TextField
          label="Data de admissao"
          type="date"
          value={form.admissionDate}
          onChange={(value) => patch({ admissionDate: value })}
        />
        <TextField
          label="Data de demissao"
          type="date"
          value={form.dismissalDate}
          onChange={(value) => patch({ dismissalDate: value })}
        />
        <SelectField
          label="Tipo de contrato"
          value={form.contractKind ?? ""}
          options={cltContractKindLabels}
          onChange={(value) =>
            patch({
              contractKind: (value ||
                undefined) as CltInfoInput["contractKind"],
            })
          }
        />
        <TextField
          label="Cargo registrado"
          value={form.registeredRole}
          onChange={(value) => patch({ registeredRole: value })}
        />
        <TextField
          label="Jornada de trabalho"
          value={form.workSchedule}
          onChange={(value) => patch({ workSchedule: value })}
        />
        <TextField
          label="Escala"
          value={form.workShift}
          onChange={(value) => patch({ workShift: value })}
        />
        <TextField
          label="Sindicato"
          value={form.union}
          onChange={(value) => patch({ union: value })}
        />
      </div>
      <ActionButton size="sm" icon={Briefcase} disabled={disabled} onClick={save}>
        Salvar dados CLT
      </ActionButton>
    </section>
  );
}

function VacationBlock({
  consultantId,
  vacations,
  disabled,
  onMessage,
  onReload,
}: {
  consultantId: string;
  vacations: ConsultantProfile["vacations"];
  disabled: boolean;
  onMessage: (message: string | null) => void;
  onReload: () => void;
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [entitled, setEntitled] = useState("30");
  const [taken, setTaken] = useState("0");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    const result = await saveVacation({
      id: undefined,
      consultantId,
      accrualPeriodStart: start,
      accrualPeriodEnd: end,
      entitledDays: entitled === "" ? undefined : Number(entitled),
      takenDays: taken === "" ? undefined : Number(taken),
      note: undefined,
    });
    setBusy(false);
    onMessage(result.ok ? "Periodo de ferias salvo." : result.message);
    if (result.ok) {
      setStart("");
      setEnd("");
      setEntitled("30");
      setTaken("0");
      onReload();
    }
  }

  async function remove(id: string) {
    const result = await deleteVacation({ id });
    onMessage(result.ok ? "Periodo removido." : result.message);
    if (result.ok) onReload();
  }

  return (
    <section className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-strong">
        <CalendarClock aria-hidden="true" className="size-4" />
        Ferias
      </div>
      {vacations.length > 0 ? (
        <ul className="space-y-2">
          {vacations.map((vac) => (
            <li
              key={vac.id}
              className="flex items-center gap-3 rounded-md border border-border bg-surface-muted/40 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="text-strong">
                  {vac.accrualPeriodStart} – {vac.accrualPeriodEnd}
                </p>
                <p className="text-xs text-soft">
                  Direito {vac.entitledDays}d · Gozados {vac.takenDays}d · Saldo{" "}
                  <span className="font-semibold text-strong">
                    {vac.balanceDays}d
                  </span>
                </p>
              </div>
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => void remove(vac.id)}
                  aria-label="Remover periodo de ferias"
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-md text-medium hover:bg-surface hover:text-danger",
                    focusRing,
                  )}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-soft">Nenhum periodo aquisitivo cadastrado.</p>
      )}
      <div className="grid gap-3 md:grid-cols-4">
        <label className="space-y-1 text-sm font-medium text-medium">
          Inicio do periodo
          <input
            type="date"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            className={consultantFieldClass()}
          />
        </label>
        <label className="space-y-1 text-sm font-medium text-medium">
          Fim do periodo
          <input
            type="date"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            className={consultantFieldClass()}
          />
        </label>
        <label className="space-y-1 text-sm font-medium text-medium">
          Dias de direito
          <input
            type="number"
            value={entitled}
            onChange={(event) => setEntitled(event.target.value)}
            className={consultantFieldClass()}
          />
        </label>
        <label className="space-y-1 text-sm font-medium text-medium">
          Dias gozados
          <input
            type="number"
            value={taken}
            onChange={(event) => setTaken(event.target.value)}
            className={consultantFieldClass()}
          />
        </label>
      </div>
      <ActionButton
        size="sm"
        icon={Plus}
        disabled={disabled || busy || start === "" || end === ""}
        onClick={add}
      >
        Adicionar periodo
      </ActionButton>
    </section>
  );
}

function HourBankBlock({
  consultantId,
  hourBank,
  disabled,
  onMessage,
  onReload,
}: {
  consultantId: string;
  hourBank: ConsultantProfile["hourBank"];
  disabled: boolean;
  onMessage: (message: string | null) => void;
  onReload: () => void;
}) {
  const [occurredAt, setOccurredAt] = useState("");
  const [kind, setKind] = useState<HourBankEntryKind>("OVERTIME");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    const result = await addHourBankEntry({
      id: undefined,
      consultantId,
      occurredAt,
      kind,
      hours: hours === "" ? 0 : Number(hours),
      note: note.trim() === "" ? undefined : note.trim(),
    });
    setBusy(false);
    onMessage(result.ok ? "Lancamento registrado." : result.message);
    if (result.ok) {
      setOccurredAt("");
      setHours("");
      setNote("");
      onReload();
    }
  }

  async function remove(id: string) {
    const result = await deleteHourBankEntry({ id });
    onMessage(result.ok ? "Lancamento removido." : result.message);
    if (result.ok) onReload();
  }

  const balanceTone =
    hourBank.balance > 0
      ? "text-success"
      : hourBank.balance < 0
        ? "text-danger"
        : "text-strong";

  return (
    <section className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-strong">
          <Clock aria-hidden="true" className="size-4" />
          Banco de horas
        </div>
        <p className="text-sm font-semibold">
          Saldo:{" "}
          <span className={balanceTone}>
            {hourBank.balance.toFixed(2).replace(".", ",")} h
          </span>
        </p>
      </div>
      {hourBank.entries.length > 0 ? (
        <ul className="space-y-2">
          {hourBank.entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-3 rounded-md border border-border bg-surface-muted/40 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="text-strong">
                  {hourBankEntryKindLabels[entry.kind as HourBankEntryKind] ??
                    entry.kind}{" "}
                  <span
                    className={cn(
                      "font-semibold",
                      entry.hours >= 0 ? "text-success" : "text-danger",
                    )}
                  >
                    {entry.hours >= 0 ? "+" : ""}
                    {entry.hours.toFixed(2).replace(".", ",")} h
                  </span>
                </p>
                <p className="text-xs text-soft">
                  {entry.occurredAt}
                  {entry.note ? ` · ${entry.note}` : ""}
                </p>
              </div>
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => void remove(entry.id)}
                  aria-label="Remover lancamento"
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-md text-medium hover:bg-surface hover:text-danger",
                    focusRing,
                  )}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-soft">Nenhum lancamento no banco de horas.</p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm font-medium text-medium">
          Data
          <input
            type="date"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
            className={consultantFieldClass()}
          />
        </label>
        <SelectField
          label="Tipo"
          value={kind}
          options={hourBankEntryKindLabels}
          includeEmpty={false}
          onChange={(value) => setKind(value as HourBankEntryKind)}
        />
        <label className="space-y-1 text-sm font-medium text-medium">
          Horas
          <input
            type="number"
            step="0.25"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            className={consultantFieldClass()}
          />
        </label>
      </div>
      <label className="space-y-1 text-sm font-medium text-medium">
        Observacao
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Opcional (ex.: motivo do ajuste)"
          className={consultantFieldClass()}
        />
      </label>
      <p className="text-[11px] text-soft">
        Hora extra credita e compensacao debita automaticamente. Em ajuste, use
        valor negativo para reduzir o saldo.
      </p>
      <ActionButton
        size="sm"
        icon={Plus}
        disabled={disabled || busy || occurredAt === "" || hours === ""}
        onClick={add}
      >
        Lancar no banco de horas
      </ActionButton>
    </section>
  );
}
