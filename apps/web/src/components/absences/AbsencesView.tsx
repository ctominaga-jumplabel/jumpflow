"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, Plane, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ActionButton } from "@/components/ui/ActionButton";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import {
  requestTimeOff,
  decideTimeOff,
  cancelTimeOff,
} from "@/app/app/ausencias/actions";
import type {
  PendingTimeOffItem,
  TimeOffListItem,
} from "@/lib/db/time-off-view";
import {
  timeOffKindLabel,
  type TimeOffKind,
  type TimeOffStatus,
} from "@/lib/timesheet/time-off";
import { cn } from "@/lib/utils";
import { focusRingInput } from "@/lib/styles";

const KIND_OPTIONS: { value: TimeOffKind; label: string; hint: string }[] = [
  { value: "VACATION", label: "Férias", hint: "Debita o saldo de férias." },
  { value: "LEAVE", label: "Licença", hint: "Licença remunerada (ex.: luto, paternidade)." },
  { value: "OTHER", label: "Outra ausência", hint: "Ausência não remunerada por padrão." },
];

const STATUS_LABEL: Record<TimeOffStatus, string> = {
  PLANNED: "Planejada",
  REQUESTED: "Aguardando decisão",
  CONFIRMED: "Confirmada",
  REJECTED: "Reprovada",
  CANCELLED: "Cancelada",
};

const STATUS_TONE: Record<TimeOffStatus, StatusTone> = {
  PLANNED: "neutral",
  REQUESTED: "info",
  CONFIRMED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

const inputCls = cn(
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong placeholder:text-soft",
  focusRingInput,
);

const labelCls = "mb-1 block text-xs font-semibold text-medium";

function formatIso(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Cancelamento é ofertado enquanto a ausência ainda está viva. */
function canCancel(status: TimeOffStatus): boolean {
  return status === "REQUESTED" || status === "CONFIRMED" || status === "PLANNED";
}

export interface AbsencesViewProps {
  /** Seção do consultor: quando presente, o usuário está vinculado a um consultor. */
  own?: {
    items: TimeOffListItem[];
    vacationBalanceDays: number | null;
  };
  /** Seção de decisão (ADMIN/PEOPLE): fila de pedidos REQUESTED de todos. */
  pending?: PendingTimeOffItem[];
  /** True quando o usuário pode decidir (ADMIN/PEOPLE). */
  canDecide: boolean;
}

/**
 * Tela de Ausências (Onda D/ausência-UI). Consultor solicita/cancela as próprias
 * ausências; ADMIN/PEOPLE decidem (aprovar/reprovar com justificativa). Toda a
 * autorização é enforced no servidor (actions) — aqui é discoverability + UX.
 */
export function AbsencesView({ own, pending, canDecide }: AbsencesViewProps) {
  const router = useRouter();
  const { feedback, notify } = useFeedback();
  const [pendingTx, startTx] = useTransition();

  return (
    <div className="space-y-6">
      <FeedbackBanner message={feedback} />
      {own ? (
        <ConsultantSection
          items={own.items}
          vacationBalanceDays={own.vacationBalanceDays}
          busy={pendingTx}
          startTx={startTx}
          notify={notify}
          refresh={() => router.refresh()}
        />
      ) : null}
      {canDecide ? (
        <DecisionSection
          pending={pending ?? []}
          busy={pendingTx}
          startTx={startTx}
          notify={notify}
          refresh={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}

type Notify = (tone: "success" | "info" | "warning", text: string) => void;
type StartTx = (cb: () => void) => void;

// ---------------------------------------------------------------------------
// Consultor: solicitar + listar as próprias + cancelar.
// ---------------------------------------------------------------------------
function ConsultantSection({
  items,
  vacationBalanceDays,
  busy,
  startTx,
  notify,
  refresh,
}: {
  items: TimeOffListItem[];
  vacationBalanceDays: number | null;
  busy: boolean;
  startTx: StartTx;
  notify: Notify;
  refresh: () => void;
}) {
  const [requesting, setRequesting] = useState(false);
  const [toCancel, setToCancel] = useState<TimeOffListItem | null>(null);

  function confirmCancel() {
    if (!toCancel) return;
    const id = toCancel.id;
    startTx(async () => {
      const r = await cancelTimeOff({ id });
      if (r.ok) {
        setToCancel(null);
        notify("success", "Ausência cancelada.");
        refresh();
      } else {
        setToCancel(null);
        notify("warning", r.message);
      }
    });
  }

  return (
    <SectionPanel
      title="Minhas ausências"
      description="Solicite férias, licenças e outras ausências. O pedido vai para aprovação."
      action={
        <ActionButton
          size="sm"
          icon={CalendarPlus}
          disabled={busy}
          onClick={() => setRequesting(true)}
        >
          Solicitar ausência
        </ActionButton>
      }
    >
      <div className="space-y-4 px-5 py-4">
        {vacationBalanceDays !== null ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface-muted/50 px-3 py-2 text-sm text-medium">
            <Plane aria-hidden="true" className="size-4 shrink-0 text-brand" />
            <span>
              Saldo de férias:{" "}
              <strong className="text-strong">{vacationBalanceDays}</strong> dia(s).
            </span>
          </div>
        ) : null}

        {items.length === 0 ? (
          <EmptyState
            icon={Plane}
            title="Nenhuma ausência registrada"
            description="Use “Solicitar ausência” para pedir férias, licença ou outra ausência."
          />
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-strong">
                      {timeOffKindLabel(item.kind)}
                    </span>
                    <StatusBadge tone={STATUS_TONE[item.status]}>
                      {STATUS_LABEL[item.status]}
                    </StatusBadge>
                    {!item.paid ? (
                      <span className="text-xs text-soft">(não remunerada)</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-soft">
                    {formatIso(item.startDate)} a {formatIso(item.endDate)}
                    {item.workingDays !== null
                      ? ` · ${item.workingDays} dia(s) úteis`
                      : ""}
                  </p>
                  {item.decisionComment ? (
                    <p className="mt-0.5 text-xs text-medium">
                      Decisão: {item.decisionComment}
                    </p>
                  ) : null}
                </div>
                {canCancel(item.status) ? (
                  <ActionButton
                    variant="secondary"
                    size="sm"
                    icon={X}
                    disabled={busy}
                    onClick={() => setToCancel(item)}
                  >
                    Cancelar
                  </ActionButton>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {requesting ? (
        <RequestModal
          busy={busy}
          startTx={startTx}
          notify={notify}
          onClose={() => setRequesting(false)}
          onSaved={() => {
            setRequesting(false);
            refresh();
          }}
        />
      ) : null}

      <Modal
        open={toCancel !== null}
        onClose={() => setToCancel(null)}
        title="Cancelar ausência?"
        description="Se a ausência já estiver confirmada, os lançamentos gerados serão revertidos e o saldo de férias estornado."
        footer={
          <>
            <ActionButton
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => setToCancel(null)}
            >
              Voltar
            </ActionButton>
            <ActionButton
              variant="danger"
              size="sm"
              icon={X}
              disabled={busy}
              onClick={confirmCancel}
            >
              Cancelar ausência
            </ActionButton>
          </>
        }
      >
        {toCancel ? (
          <p className="text-sm text-medium">
            Cancelar{" "}
            <strong className="text-strong">
              {timeOffKindLabel(toCancel.kind)}
            </strong>{" "}
            de {formatIso(toCancel.startDate)} a {formatIso(toCancel.endDate)}?
          </p>
        ) : null}
      </Modal>
    </SectionPanel>
  );
}

function RequestModal({
  busy,
  startTx,
  notify,
  onClose,
  onSaved,
}: {
  busy: boolean;
  startTx: StartTx;
  notify: Notify;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<TimeOffKind>("VACATION");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    if (!startDate || !endDate) {
      setError("Informe as datas de início e fim.");
      return;
    }
    if (startDate > endDate) {
      setError("A data de início deve ser anterior ou igual à data de fim.");
      return;
    }
    startTx(async () => {
      const r = await requestTimeOff({
        kind,
        startDate,
        endDate,
        note: note.trim() || undefined,
      });
      if (r.ok) {
        notify(
          "success",
          `Ausência solicitada (${r.data.workingDays} dia(s) úteis). Aguarde a aprovação.`,
        );
        onSaved();
      } else {
        setError(r.message);
      }
    });
  }

  const hint = KIND_OPTIONS.find((k) => k.value === kind)?.hint;

  return (
    <Modal
      open
      onClose={onClose}
      title="Solicitar ausência"
      description="O pedido vai para aprovação de Pessoas. Fins de semana e feriados não contam como dias úteis."
      footer={
        <>
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
            icon={CalendarPlus}
            disabled={busy}
            onClick={handleSubmit}
          >
            Solicitar
          </ActionButton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="timeoff-kind" className={labelCls}>
            Tipo
          </label>
          <select
            id="timeoff-kind"
            className={inputCls}
            value={kind}
            onChange={(e) => setKind(e.target.value as TimeOffKind)}
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          {hint ? <p className="mt-1 text-xs text-soft">{hint}</p> : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            Início
            <input
              type="date"
              className={cn(inputCls, "mt-1")}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className={labelCls}>
            Fim
            <input
              type="date"
              className={cn(inputCls, "mt-1")}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
        </div>

        <div>
          <label htmlFor="timeoff-note" className={labelCls}>
            Observação{" "}
            <span className="font-normal text-soft">(opcional)</span>
          </label>
          <textarea
            id="timeoff-note"
            className={cn(inputCls, "resize-y")}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Contexto do pedido (opcional)."
          />
        </div>

        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Decisão (ADMIN/PEOPLE): fila REQUESTED + painel de aprovar/reprovar.
// ---------------------------------------------------------------------------
function DecisionSection({
  pending,
  busy,
  startTx,
  notify,
  refresh,
}: {
  pending: PendingTimeOffItem[];
  busy: boolean;
  startTx: StartTx;
  notify: Notify;
  refresh: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    pending[0]?.id ?? null,
  );

  // Ajuste render-time: se a seleção sumiu da fila (decidida/atualizada),
  // recai no primeiro item (alternativa recomendada ao efeito).
  const [prevIds, setPrevIds] = useState<string>(pending.map((p) => p.id).join(","));
  const currentIds = pending.map((p) => p.id).join(",");
  if (currentIds !== prevIds) {
    setPrevIds(currentIds);
    if (!pending.some((p) => p.id === selectedId)) {
      setSelectedId(pending[0]?.id ?? null);
    }
  }

  const selected = pending.find((p) => p.id === selectedId) ?? null;

  return (
    <SectionPanel
      title="Ausências para decisão"
      description="Pedidos aguardando aprovação. Reprovar exige justificativa."
      action={
        <StatusBadge tone={pending.length > 0 ? "info" : "neutral"}>
          {pending.length} pendente(s)
        </StatusBadge>
      }
    >
      {pending.length === 0 ? (
        <p className="px-5 py-8 text-sm text-soft">
          Nenhum pedido de ausência aguardando decisão.
        </p>
      ) : (
        <div className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <ul className="space-y-2">
            {pending.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  aria-current={item.id === selectedId ? "true" : undefined}
                  className={cn(
                    "flex w-full flex-col gap-0.5 rounded-md border px-3 py-2 text-left text-sm transition hover:border-ink",
                    item.id === selectedId
                      ? "border-ink bg-marker/40 text-strong"
                      : "border-border bg-surface text-medium",
                  )}
                >
                  <span className="font-medium text-strong">
                    {item.consultantName}
                  </span>
                  <span className="text-xs text-soft">
                    {timeOffKindLabel(item.kind)} · {formatIso(item.startDate)} a{" "}
                    {formatIso(item.endDate)}
                    {item.workingDays !== null
                      ? ` · ${item.workingDays} dia(s) úteis`
                      : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <TimeOffDecisionPanel
            item={selected}
            busy={busy}
            startTx={startTx}
            notify={notify}
            refresh={refresh}
          />
        </div>
      )}
    </SectionPanel>
  );
}

function TimeOffDecisionPanel({
  item,
  busy,
  startTx,
  notify,
  refresh,
}: {
  item: PendingTimeOffItem | null;
  busy: boolean;
  startTx: StartTx;
  notify: Notify;
  refresh: () => void;
}) {
  const [comment, setComment] = useState("");
  const [rejectError, setRejectError] = useState(false);

  // Reset do comentário quando a seleção muda (ajuste render-time).
  const [prevId, setPrevId] = useState<string | null>(item?.id ?? null);
  const currentId = item?.id ?? null;
  if (currentId !== prevId) {
    setPrevId(currentId);
    setComment("");
    setRejectError(false);
  }

  if (!item) {
    return (
      <div className="rounded-md border border-border bg-surface px-4 py-8 text-sm text-soft">
        Selecione um pedido para decidir.
      </div>
    );
  }

  function decide(approve: boolean) {
    if (!item) return;
    const trimmed = comment.trim();
    if (!approve && trimmed.length === 0) {
      setRejectError(true);
      return;
    }
    setRejectError(false);
    startTx(async () => {
      const r = await decideTimeOff({
        id: item.id,
        approve,
        comment: trimmed || undefined,
      });
      if (r.ok) {
        notify(
          "success",
          approve
            ? `Ausência aprovada (${r.data.generatedEntries} lançamento(s) gerado(s)).`
            : "Ausência reprovada.",
        );
        refresh();
      } else {
        notify("warning", r.message);
      }
    });
  }

  return (
    <div className="space-y-4 rounded-md border border-border bg-surface px-4 py-4">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-soft">Consultor</dt>
          <dd className="font-medium text-strong">{item.consultantName}</dd>
        </div>
        <div>
          <dt className="text-xs text-soft">Tipo</dt>
          <dd className="font-medium text-strong">
            {timeOffKindLabel(item.kind)}
            {!item.paid ? " (não remunerada)" : ""}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-soft">Período</dt>
          <dd className="font-medium text-strong">
            {formatIso(item.startDate)} a {formatIso(item.endDate)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-soft">Dias úteis</dt>
          <dd className="font-medium tabular-nums text-strong">
            {item.workingDays ?? "–"}
          </dd>
        </div>
        {item.kind === "VACATION" ? (
          <div>
            <dt className="text-xs text-soft">Saldo de férias</dt>
            <dd className="font-medium tabular-nums text-strong">
              {item.vacationBalanceDays ?? "–"} dia(s)
            </dd>
          </div>
        ) : null}
        {item.note ? (
          <div className="col-span-2">
            <dt className="text-xs text-soft">Observação</dt>
            <dd className="text-medium">{item.note}</dd>
          </div>
        ) : null}
      </dl>

      <div>
        <label
          htmlFor="timeoff-decision-comment"
          className="mb-1 block text-xs font-semibold text-medium"
        >
          Comentário{" "}
          <span className="font-normal text-soft">
            (obrigatório para reprovar)
          </span>
        </label>
        <textarea
          id="timeoff-decision-comment"
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            if (rejectError && e.target.value.trim().length > 0) {
              setRejectError(false);
            }
          }}
          rows={3}
          aria-invalid={rejectError}
          placeholder="Motivo da reprovação ou observação na aprovação."
          className={cn(inputCls, "resize-y", rejectError && "border-danger")}
        />
        {rejectError ? (
          <p className="mt-1 text-xs font-medium text-danger">
            Informe uma justificativa para reprovar.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <ActionButton
          variant="success"
          size="sm"
          icon={Check}
          disabled={busy}
          onClick={() => decide(true)}
        >
          Aprovar
        </ActionButton>
        <ActionButton
          variant="danger"
          size="sm"
          icon={X}
          disabled={busy}
          onClick={() => decide(false)}
        >
          Reprovar
        </ActionButton>
      </div>
    </div>
  );
}
