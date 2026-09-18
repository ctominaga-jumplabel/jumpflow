"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Save, Users } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { cn } from "@/lib/utils";
import { focusRing, focusRingInput } from "@/lib/styles";
import {
  attachBillableJustificationFile,
  attachTimeEntryFile,
  createBatchTimeEntries,
  createTimeEntry,
  createWeeklyTimeEntries,
} from "@/app/app/horas/actions";
import type { OnBehalfPickerData } from "@/lib/db/on-behalf";
import {
  activityLabels,
  creatableActivityOrder,
  type ActivityType,
  type WeekDay,
} from "@/lib/timesheet/types";
import type { HolidayLookup } from "@/lib/timesheet/holidays";
import type { TimeOffLookup } from "@/lib/timesheet/time-off";
import { formatHours } from "@/lib/format";
import {
  ClockFields,
  clockHours,
  emptyClock,
  type ClockFieldsValue,
} from "./ClockFields";
import {
  TimeEntryForm,
  type TimeEntryAttachmentIntent,
  type TimeEntryFormProject,
  type TimeEntryFormValue,
} from "./TimeEntryForm";

/** Abas da tela: lançamento individual (semana visível) × lançamento em lote. */
type Tab = "individual" | "lote";

export interface NewTimeEntryScreenProps {
  /** Rota do histórico ("Ver Histórico") — a grade de Horas. */
  historyHref: string;
  /**
   * Contexto pessoal do usuário logado. `null` quando o usuário não tem
   * vínculo de consultor (um gestor puro, por exemplo): a aba individual some e
   * só o lote fica disponível.
   */
  personal: {
    weekStart: string;
    weekLabel: string;
    days: WeekDay[];
    projects: TimeEntryFormProject[];
    holidays: HolidayLookup;
    timeOff: TimeOffLookup;
    attachmentsAvailable: boolean;
    transcriptionAvailable: boolean;
  } | null;
  /**
   * Dados do lote (consultores, projetos e o grafo de alocação para o filtro
   * conjunto). `null` para quem não pode lançar em lote — a autorização real é
   * do servidor (`createBatchTimeEntries` exige Gestor de Área/Admin); esconder
   * a aba é apenas cosmético.
   */
  batch: OnBehalfPickerData | null;
}

const labelClass = "mb-1 block text-xs font-semibold text-medium";

const inputClass = (invalid = false) =>
  cn(
    "w-full rounded-md border bg-surface px-3 py-2 text-sm text-strong placeholder:text-soft",
    focusRingInput,
    invalid ? "border-danger" : "border-border",
  );

/** ISO de hoje resolvido no cliente apenas como valor INICIAL dos campos De/Até. */
function todayIso(): string {
  return new Date().toLocaleDateString("en-CA");
}

/**
 * Tela cheia de "Novo Lançamento de Horas".
 *
 * Substitui o modal que vivia dentro da grade: o lançamento é a ação mais
 * repetida do consultor e agora tem rota própria, com o histórico a um clique
 * ("Ver Histórico"). O formulário é o MESMO componente da grade (`TimeEntryForm`
 * em modo `inline`), então validação, feriado, ausência, anexo e voz continuam
 * idênticos — muda só o container.
 *
 * Duas capacidades convivem:
 *  - Individual: o consultor lança no dia ou na SEMANA visível. O limite semanal
 *    é preservado — `createWeeklyTimeEntries` só aceita dias de uma semana.
 *  - Em lote (Gestor de Área/Admin): um intervalo livre De→Até para VÁRIOS
 *    consultores, com a flag "Incluir finais de semana" desligada por padrão.
 */
export function NewTimeEntryScreen({
  historyHref,
  personal,
  batch,
}: NewTimeEntryScreenProps) {
  const router = useRouter();
  const { feedback, notify } = useFeedback();
  const [isPending, startTransition] = useTransition();
  const canBatch = batch !== null;
  const [tab, setTab] = useState<Tab>(personal ? "individual" : "lote");

  // ——— Lançamento individual (semana visível) ———————————————————————————

  /**
   * Anexo opcional do lançamento: aplicado APÓS o save, com o id devolvido pela
   * action (é uma exceção opcional — o lançamento já é válido sem ele). Devolve
   * a mensagem de erro para um aviso NÃO bloqueante, nunca desfaz o save.
   */
  async function applyAttachmentIntent(
    entryId: string,
    attachment: TimeEntryAttachmentIntent | undefined,
  ): Promise<string | null> {
    // Só o upload é oferecido aqui: a tela cria lançamentos novos, então nunca
    // existe um anexo persistido para remover.
    if (!attachment || attachment.kind !== "upload") return null;
    const fd = new FormData();
    fd.set("id", entryId);
    fd.set("file", attachment.file);
    const result = await attachTimeEntryFile(fd);
    return result.ok ? null : result.message;
  }

  /** Anexo (opcional) que comprova a justificativa de NÃO faturável (P9). */
  async function applyJustificationFile(
    entryId: string,
    file: File | undefined,
  ): Promise<string | null> {
    if (!file) return null;
    const fd = new FormData();
    fd.set("id", entryId);
    fd.set("file", file);
    const result = await attachBillableJustificationFile(fd);
    return result.ok ? null : result.message;
  }

  function handleSubmitEntry(
    value: TimeEntryFormValue,
    attachment?: TimeEntryAttachmentIntent,
    billableJustificationFile?: File,
  ) {
    if (!personal) return;
    const clockPayload = {
      startTime: value.clock.startTime,
      endTime: value.clock.endTime,
      breakStart: value.clock.hasBreak ? value.clock.breakStart : null,
      breakEnd: value.clock.hasBreak ? value.clock.breakEnd : null,
    };
    startTransition(async () => {
      if (value.mode === "weekly") {
        const result = await createWeeklyTimeEntries({
          projectId: value.projectId,
          activityType: value.activity as ActivityType,
          weekStart: personal.weekStart,
          ...clockPayload,
          weekdays: value.weekdays,
          description: value.description,
          billable: value.billable,
          nonBillableReason: value.nonBillableReason || undefined,
          multiplier: value.multiplier,
        });
        if (!result.ok) {
          notify("warning", result.message);
          return;
        }
        const { created, skippedExisting, skippedOutOfAllocation } = result.data;
        const parts = [`${created} lançamento(s) criado(s)`];
        if (skippedExisting > 0) parts.push(`${skippedExisting} já existia(m)`);
        if (skippedOutOfAllocation > 0) {
          parts.push(`${skippedOutOfAllocation} fora da vigência`);
        }
        notify(
          created > 0 ? "success" : "info",
          `Lançamento semanal: ${parts.join(" · ")}.`,
        );
        return;
      }
      const result = await createTimeEntry({
        projectId: value.projectId,
        activityType: value.activity as ActivityType,
        date: value.date,
        ...clockPayload,
        description: value.description,
        billable: value.billable,
        nonBillableReason: value.nonBillableReason || undefined,
        multiplier: value.multiplier,
      });
      if (!result.ok) {
        notify("warning", result.message);
        return;
      }
      const attachmentError = await applyAttachmentIntent(
        result.data.id,
        attachment,
      );
      const justificationError = await applyJustificationFile(
        result.data.id,
        billableJustificationFile,
      );
      if (attachmentError || justificationError) {
        notify(
          "warning",
          `Lançamento salvo, mas o anexo falhou: ${attachmentError ?? justificationError}`,
        );
        return;
      }
      notify("success", "Lançamento enviado para aprovação.");
    });
  }

  // ——— Lançamento em lote (gestores) ————————————————————————————————————

  const [batchProjectId, setBatchProjectId] = useState("");
  const [batchConsultantIds, setBatchConsultantIds] = useState<string[]>([]);
  const [batchStart, setBatchStart] = useState(todayIso);
  const [batchEnd, setBatchEnd] = useState(todayIso);
  const [includeWeekends, setIncludeWeekends] = useState(false);
  const [batchActivity, setBatchActivity] = useState<ActivityType>("WORKDAY");
  const [batchClock, setBatchClock] = useState<ClockFieldsValue>({
    ...emptyClock,
  });
  const [batchDescription, setBatchDescription] = useState("");
  const [batchErrors, setBatchErrors] = useState(false);
  const [consultantQuery, setConsultantQuery] = useState("");

  // Grafo de alocação, nas DUAS direções: o filtro é conjunto — escolher um
  // projeto afunila os consultores, e escolher consultores afunila os projetos.
  const consultantsByProject = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const a of batch?.allocations ?? []) {
      let set = map.get(a.projectId);
      if (!set) {
        set = new Set();
        map.set(a.projectId, set);
      }
      set.add(a.consultantId);
    }
    return map;
  }, [batch?.allocations]);

  const projectsByConsultant = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const a of batch?.allocations ?? []) {
      let set = map.get(a.consultantId);
      if (!set) {
        set = new Set();
        map.set(a.consultantId, set);
      }
      set.add(a.projectId);
    }
    return map;
  }, [batch?.allocations]);

  // Projetos ofertados: só os que têm alocação ativa para TODOS os consultores
  // já escolhidos (senão a seleção prometeria um lote que o servidor recusaria).
  const availableProjects = useMemo(() => {
    const all = batch?.projects ?? [];
    if (batchConsultantIds.length === 0) return all;
    return all.filter((project) =>
      batchConsultantIds.every((id) =>
        projectsByConsultant.get(id)?.has(project.id),
      ),
    );
  }, [batch?.projects, batchConsultantIds, projectsByConsultant]);

  // Consultores ofertados: afunilados pelo projeto escolhido e pela busca.
  const availableConsultants = useMemo(() => {
    const all = batch?.consultants ?? [];
    const scoped = batchProjectId
      ? all.filter((c) => consultantsByProject.get(batchProjectId)?.has(c.id))
      : all;
    const query = consultantQuery.trim().toLowerCase();
    if (!query) return scoped;
    return scoped.filter((c) => c.name.toLowerCase().includes(query));
  }, [batch?.consultants, batchProjectId, consultantsByProject, consultantQuery]);

  function toggleConsultant(id: string) {
    setBatchConsultantIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  /** Marca/desmarca todos os consultores VISÍVEIS (respeita o filtro ativo). */
  function toggleAllVisible() {
    const visibleIds = availableConsultants.map((c) => c.id);
    const allSelected =
      visibleIds.length > 0 &&
      visibleIds.every((id) => batchConsultantIds.includes(id));
    setBatchConsultantIds((current) =>
      allSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])],
    );
  }

  /** Escolher um projeto derruba os consultores que não estão nele. */
  function selectBatchProject(id: string) {
    setBatchProjectId(id);
    if (!id) return;
    const allowed = consultantsByProject.get(id);
    setBatchConsultantIds((current) =>
      current.filter((consultantId) => allowed?.has(consultantId)),
    );
  }

  const batchHours = clockHours(batchClock);
  // Prévia do lote: quantos dias o intervalo gera com a flag atual. Espelha a
  // regra do servidor (dias úteis, ou todos os dias com finais de semana).
  const batchDayCount = useMemo(() => {
    const start = Date.parse(`${batchStart}T00:00:00Z`);
    const end = Date.parse(`${batchEnd}T00:00:00Z`);
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
    let count = 0;
    for (let ms = start; ms <= end; ms += 86_400_000) {
      const weekday = new Date(ms).getUTCDay();
      if (!includeWeekends && (weekday === 0 || weekday === 6)) continue;
      count += 1;
    }
    return count;
  }, [batchStart, batchEnd, includeWeekends]);

  const batchInvalid = {
    project: !batchProjectId,
    consultants: batchConsultantIds.length === 0,
    range: batchDayCount === 0,
    clock: batchHours === null,
    description: batchDescription.trim().length === 0,
  };
  const batchHasErrors = Object.values(batchInvalid).some(Boolean);

  function submitBatch() {
    if (batchHasErrors) {
      setBatchErrors(true);
      return;
    }
    setBatchErrors(false);
    startTransition(async () => {
      const result = await createBatchTimeEntries({
        projectId: batchProjectId,
        consultantIds: batchConsultantIds,
        activityType: batchActivity,
        startDate: batchStart,
        endDate: batchEnd,
        includeWeekends,
        startTime: batchClock.startTime,
        endTime: batchClock.endTime,
        breakStart: batchClock.hasBreak ? batchClock.breakStart : null,
        breakEnd: batchClock.hasBreak ? batchClock.breakEnd : null,
        description: batchDescription,
        billable: true,
        multiplier: 1,
      });
      if (!result.ok) {
        notify("warning", result.message);
        return;
      }
      const data = result.data;
      const parts = [`${data.created} lançamento(s) criado(s)`];
      if (data.skippedExisting > 0) {
        parts.push(`${data.skippedExisting} já existia(m)`);
      }
      if (data.skippedOutOfAllocation > 0) {
        parts.push(`${data.skippedOutOfAllocation} fora da vigência`);
      }
      if (data.skippedTimeOff > 0) {
        parts.push(`${data.skippedTimeOff} com ausência confirmada`);
      }
      if (data.skippedClosedPeriod > 0) {
        parts.push(`${data.skippedClosedPeriod} em semana fechada`);
      }
      if (data.skippedBillingLocked > 0) {
        parts.push(`${data.skippedBillingLocked} em competência faturada`);
      }
      if (data.failedConsultants.length > 0) {
        parts.push(`falha em: ${data.failedConsultants.join(", ")}`);
      }
      notify(
        data.created > 0 ? "success" : "info",
        `Lançamento em lote: ${parts.join(" · ")}.`,
      );
      if (data.created > 0) setBatchDescription("");
    });
  }

  // ——— Render ————————————————————————————————————————————————————————————

  const showTabs = Boolean(personal) && canBatch;

  return (
    <div className="space-y-6">
      {showTabs ? (
        <div
          role="tablist"
          aria-label="Tipo de lançamento"
          className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface-muted p-0.5"
        >
          {(
            [
              { id: "individual" as const, label: "Individual" },
              { id: "lote" as const, label: "Em lote" },
            ]
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={tab === option.id}
              onClick={() => setTab(option.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                focusRing,
                tab === option.id
                  ? "bg-surface text-strong shadow-sm"
                  : "text-soft hover:text-medium",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      <FeedbackBanner message={feedback} />

      {tab === "individual" && personal ? (
        <>
          <p className="text-xs font-medium text-soft">
            Semana de referência: {personal.weekLabel}. Para lançar em outra
            semana, use a grade em{" "}
            <a className={cn("font-semibold underline", focusRing)} href={historyHref}>
              Ver Histórico
            </a>
            .
          </p>
          <TimeEntryForm
            open
            inline
            onClose={() => router.push(historyHref)}
            projects={personal.projects}
            days={personal.days}
            holidays={personal.holidays}
            timeOff={personal.timeOff}
            onSubmit={handleSubmitEntry}
            busy={isPending}
            attachmentsAvailable={personal.attachmentsAvailable}
            transcriptionAvailable={personal.transcriptionAvailable}
          />
        </>
      ) : null}

      {tab === "lote" && batch ? (
        <SectionPanel
          variant="quiet"
          title="Lançamento em lote"
          description="Um intervalo de datas, vários consultores. Projeto e consultores são filtros conjuntos: escolher um lado afunila o outro. Dias já lançados, fora da vigência de alocação, com ausência confirmada, em semana fechada ou em competência faturada são pulados e reportados."
        >
          <div className="space-y-5 px-5 py-4">
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Projeto */}
              <div>
                <label htmlFor="batch-project" className={labelClass}>
                  Projeto
                </label>
                <select
                  id="batch-project"
                  value={batchProjectId}
                  disabled={isPending}
                  onChange={(event) => selectBatchProject(event.target.value)}
                  className={inputClass(batchErrors && batchInvalid.project)}
                >
                  <option value="">Selecione um projeto</option>
                  {availableProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                {batchConsultantIds.length > 0 ? (
                  <p className="mt-1 text-xs text-soft">
                    Mostrando {availableProjects.length} projeto(s) com alocação
                    ativa para todos os consultores selecionados.
                  </p>
                ) : null}
              </div>

              {/* Atividade */}
              <div>
                <label htmlFor="batch-activity" className={labelClass}>
                  Atividade
                </label>
                <select
                  id="batch-activity"
                  value={batchActivity}
                  disabled={isPending}
                  onChange={(event) =>
                    setBatchActivity(event.target.value as ActivityType)
                  }
                  className={inputClass()}
                >
                  {creatableActivityOrder.map((activity) => (
                    <option key={activity} value={activity}>
                      {activityLabels[activity]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Consultores (multi-seleção) */}
            <fieldset>
              <legend className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-medium">
                <Users aria-hidden="true" className="size-3.5" />
                Consultores ({batchConsultantIds.length} selecionado
                {batchConsultantIds.length === 1 ? "" : "s"})
              </legend>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  value={consultantQuery}
                  onChange={(event) => setConsultantQuery(event.target.value)}
                  placeholder="Buscar consultor…"
                  aria-label="Buscar consultor"
                  className={cn(inputClass(), "max-w-64")}
                />
                <ActionButton
                  variant="secondary"
                  size="sm"
                  tactile={false}
                  disabled={isPending || availableConsultants.length === 0}
                  onClick={toggleAllVisible}
                >
                  Selecionar visíveis
                </ActionButton>
                {batchConsultantIds.length > 0 ? (
                  <ActionButton
                    variant="secondary"
                    size="sm"
                    tactile={false}
                    disabled={isPending}
                    onClick={() => setBatchConsultantIds([])}
                  >
                    Limpar seleção
                  </ActionButton>
                ) : null}
              </div>
              <div
                className={cn(
                  "max-h-64 overflow-y-auto rounded-md border p-2",
                  batchErrors && batchInvalid.consultants
                    ? "border-danger"
                    : "border-border",
                )}
              >
                {availableConsultants.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-soft">
                    Nenhum consultor corresponde ao projeto/busca selecionados.
                  </p>
                ) : (
                  <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                    {availableConsultants.map((consultant) => (
                      <li key={consultant.id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-strong hover:bg-surface-muted">
                          <input
                            type="checkbox"
                            checked={batchConsultantIds.includes(consultant.id)}
                            disabled={isPending}
                            onChange={() => toggleConsultant(consultant.id)}
                            className="size-4 rounded border-border"
                          />
                          <span className="truncate">{consultant.name}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </fieldset>

            {/* Período De → Até + finais de semana */}
            <fieldset>
              <legend className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-medium">
                <CalendarRange aria-hidden="true" className="size-3.5" />
                Período
              </legend>
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label htmlFor="batch-start" className={labelClass}>
                    De
                  </label>
                  <input
                    id="batch-start"
                    type="date"
                    value={batchStart}
                    disabled={isPending}
                    onChange={(event) => setBatchStart(event.target.value)}
                    className={cn(
                      inputClass(batchErrors && batchInvalid.range),
                      "w-44",
                    )}
                  />
                </div>
                <div>
                  <label htmlFor="batch-end" className={labelClass}>
                    Até
                  </label>
                  <input
                    id="batch-end"
                    type="date"
                    value={batchEnd}
                    disabled={isPending}
                    onChange={(event) => setBatchEnd(event.target.value)}
                    className={cn(
                      inputClass(batchErrors && batchInvalid.range),
                      "w-44",
                    )}
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm font-medium text-strong">
                  <input
                    type="checkbox"
                    checked={includeWeekends}
                    disabled={isPending}
                    onChange={(event) =>
                      setIncludeWeekends(event.target.checked)
                    }
                    className="size-4 rounded border-border"
                  />
                  Incluir finais de semana
                </label>
              </div>
              {batchErrors && batchInvalid.range ? (
                <p className="mt-1 text-xs font-semibold text-danger">
                  Informe um intervalo válido com ao menos um dia.
                </p>
              ) : null}
            </fieldset>

            {/* Relógio de ponto */}
            <fieldset>
              <legend className={labelClass}>Horários</legend>
              <ClockFields
                value={batchClock}
                onChange={setBatchClock}
                idPrefix="batch"
              />
            </fieldset>

            {/* Descrição */}
            <div>
              <label htmlFor="batch-description" className={labelClass}>
                Descrição
              </label>
              <textarea
                id="batch-description"
                rows={3}
                value={batchDescription}
                disabled={isPending}
                onChange={(event) => setBatchDescription(event.target.value)}
                placeholder="Descrição aplicada a todos os lançamentos do lote."
                className={cn(
                  inputClass(batchErrors && batchInvalid.description),
                  "resize-y",
                )}
              />
            </div>

            <p className="text-xs text-soft">
              Prévia: {batchConsultantIds.length} consultor(es) ×{" "}
              {batchDayCount} dia(s)
              {includeWeekends ? " (incluindo finais de semana)" : " úteis"} ={" "}
              <strong className="text-medium">
                até {batchConsultantIds.length * batchDayCount} lançamento(s)
              </strong>
              {batchHours !== null ? ` de ${formatHours(batchHours)} cada` : ""}.
              Os lançamentos entram direto na fila de aprovação.
            </p>

            <div className="flex flex-wrap justify-end gap-2">
              <ActionButton
                variant="secondary"
                size="sm"
                tactile={false}
                disabled={isPending}
                onClick={() => router.push(historyHref)}
              >
                Cancelar
              </ActionButton>
              <ActionButton
                variant="primary"
                size="sm"
                tactile={false}
                icon={Save}
                disabled={isPending}
                onClick={submitBatch}
              >
                Lançar em lote
              </ActionButton>
            </div>
          </div>
        </SectionPanel>
      ) : null}
    </div>
  );
}
