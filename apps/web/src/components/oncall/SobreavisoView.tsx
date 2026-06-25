"use client";

import { useRef, useState, useTransition } from "react";
import { Check, Paperclip, Plus, Trash2, X } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { formatHours } from "@/lib/format";
import type { OnCallEntryRow, OnCallStatus } from "@/lib/db/oncall";
import {
  attachOnCallApproval,
  createOnCallEntry,
  decideOnCall,
  deleteOnCallEntry,
  getOnCallApprovalUrl,
} from "@/app/app/sobreaviso/actions";

const toneByStatus: Record<OnCallStatus, StatusTone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};
const statusLabel: Record<OnCallStatus, string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
};

const inputCls =
  "rounded-md border border-[#d7d8cf] bg-white px-2.5 py-1.5 text-sm text-ink";

export interface SobreavisoViewProps {
  entries: OnCallEntryRow[];
  projects: Array<{ id: string; name: string }>;
  today: string;
  canCreate: boolean;
  canApprove: boolean;
  storageAvailable: boolean;
}

export function SobreavisoView({
  entries,
  projects,
  today,
  canCreate,
  canApprove,
  storageAvailable,
}: SobreavisoViewProps) {
  const { feedback, notify } = useFeedback();
  const [isPending, startTransition] = useTransition();

  const [date, setDate] = useState(today);
  const [hours, setHours] = useState("");
  const [multiplier, setMultiplier] = useState("1");
  const [projectId, setProjectId] = useState("");
  const [note, setNote] = useState("");

  const fileInput = useRef<HTMLInputElement | null>(null);
  const attachTarget = useRef<string | null>(null);

  function handleCreate() {
    startTransition(async () => {
      const r = await createOnCallEntry({
        date,
        hours: Number(hours),
        multiplier: Number(multiplier),
        projectId: projectId || null,
        note: note || undefined,
      });
      if (r.ok) {
        notify("success", "Sobreaviso lançado.");
        setHours("");
        setNote("");
      } else notify("warning", r.message);
    });
  }

  function handleDecide(id: string, decision: "APPROVE" | "REJECT") {
    startTransition(async () => {
      const r = await decideOnCall({ id, decision });
      if (r.ok) notify("success", "Sobreaviso atualizado.");
      else notify("warning", r.message);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const r = await deleteOnCallEntry({ id });
      if (r.ok) notify("success", "Lançamento removido.");
      else notify("warning", r.message);
    });
  }

  function triggerAttach(id: string) {
    if (!storageAvailable) {
      notify("warning", "Storage não configurado: anexos indisponíveis.");
      return;
    }
    attachTarget.current = id;
    fileInput.current?.click();
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const id = attachTarget.current;
    e.target.value = "";
    if (!file || !id) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("file", file);
      const r = await attachOnCallApproval(fd);
      if (r.ok) notify("success", "Anexo do ok adicionado.");
      else notify("warning", r.message);
    });
  }

  function handleViewAttachment(id: string) {
    startTransition(async () => {
      const r = await getOnCallApprovalUrl({ id });
      if (r.ok) window.open(r.data.url, "_blank", "noopener");
      else notify("warning", r.message);
    });
  }

  const columns: DataTableColumn<OnCallEntryRow>[] = [
    { key: "date", header: "Data", cell: (r) => <span className="text-sm tabular-nums">{r.date}</span> },
    {
      key: "consultant",
      header: "Consultor / Projeto",
      cell: (r) => (
        <div>
          <p className="font-medium text-strong">{r.consultantName}</p>
          <p className="text-xs text-soft">{r.projectName ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "hours",
      header: "Horas",
      align: "right",
      cell: (r) => <span className="text-sm tabular-nums">{formatHours(r.hours)}</span>,
    },
    {
      key: "mult",
      header: "Fator",
      align: "right",
      cell: (r) => <span className="text-sm tabular-nums text-medium">{r.multiplier.toLocaleString("pt-BR")}</span>,
      className: "hidden sm:table-cell",
    },
    {
      key: "eff",
      header: "Equivalente",
      align: "right",
      cell: (r) => <span className="text-sm font-semibold tabular-nums">{formatHours(r.effectiveHours)}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusBadge tone={toneByStatus[r.status]}>{statusLabel[r.status]}</StatusBadge>,
    },
    {
      key: "ok",
      header: "Ok responsável",
      cell: (r) =>
        r.attachment ? (
          <button
            className="text-sm text-accent underline"
            disabled={isPending}
            onClick={() => handleViewAttachment(r.id)}
          >
            Ver anexo
          </button>
        ) : (
          <span className="text-xs text-soft">Sem anexo</span>
        ),
      className: "hidden md:table-cell",
    },
    {
      key: "actions",
      header: "Ações",
      cell: (r) => (
        <div className="flex flex-wrap gap-1.5">
          {r.status === "PENDING" ? (
            <>
              <ActionButton
                size="sm"
                variant="secondary"
                icon={Paperclip}
                disabled={isPending}
                onClick={() => triggerAttach(r.id)}
              >
                Anexar ok
              </ActionButton>
              {canApprove ? (
                <>
                  <ActionButton
                    size="sm"
                    variant="success"
                    icon={Check}
                    disabled={isPending}
                    onClick={() => handleDecide(r.id, "APPROVE")}
                  >
                    Aprovar
                  </ActionButton>
                  <ActionButton
                    size="sm"
                    variant="danger"
                    icon={X}
                    disabled={isPending}
                    onClick={() => handleDecide(r.id, "REJECT")}
                  >
                    Rejeitar
                  </ActionButton>
                </>
              ) : null}
              <ActionButton
                size="sm"
                variant="secondary"
                icon={Trash2}
                disabled={isPending}
                onClick={() => handleDelete(r.id)}
              >
                Remover
              </ActionButton>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <FeedbackBanner message={feedback} />

      {canCreate ? (
        <SectionPanel title="Novo sobreaviso" description="Registre as horas de prontidão e o fator de remuneração.">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-soft">
              Data
              <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-soft">
              Horas
              <input
                type="number"
                min="0"
                step="0.5"
                className={`${inputCls} w-24`}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-soft">
              Fator
              <input
                type="number"
                min="0"
                step="0.01"
                className={`${inputCls} w-24`}
                value={multiplier}
                onChange={(e) => setMultiplier(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-soft">
              Projeto (opcional)
              <select className={inputCls} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs text-soft">
              Observação
              <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <ActionButton variant="primary" size="sm" icon={Plus} disabled={isPending} onClick={handleCreate}>
              Lançar
            </ActionButton>
          </div>
        </SectionPanel>
      ) : null}

      <SectionPanel
        title="Sobreavisos"
        description={canApprove ? "Todos os lançamentos para aprovação." : "Seus lançamentos de sobreaviso."}
      >
        <DataTable columns={columns} rows={entries} rowKey={(r) => r.id} caption="Sobreavisos" />
      </SectionPanel>

      <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" hidden onChange={onFilePicked} />
    </div>
  );
}
