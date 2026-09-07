"use client";

import { useMemo, useState, useTransition } from "react";
import { Pencil, Plus, Star, UserMinus, UserPlus, Users } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { Modal } from "@/components/ui/Modal";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { seniorityLabels } from "@/lib/consultants/labels";
import type { ConsultantSeniority } from "@/lib/consultants/schemas";
import { skillLevelLabels } from "@/lib/competencies/types";
import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { CoeCandidateOption, CoeMemberView } from "@/lib/coe/types";
import {
  addCoeMember,
  setCoeMemberActive,
  updateCoeMember,
} from "@/app/app/coe/actions";

export interface CoeNucleusPanelProps {
  members: CoeMemberView[];
  candidateOptions: CoeCandidateOption[];
  canCurate: boolean;
}

const fieldClass = cn(
  "h-10 w-full rounded-md border-2 border-ink bg-surface px-3 text-sm text-strong",
  focusRingInput,
);

function seniorityLabel(value: string): string {
  return seniorityLabels[value as ConsultantSeniority] ?? value;
}

/**
 * Curadoria do núcleo do COE: quem são os consultores estratégicos e qual é a
 * área de excelência de cada um.
 *
 * Sair do núcleo DESATIVA o registro em vez de apagá-lo — por isso os inativos
 * continuam listados, em uma seção própria, prontos para voltar. Sem permissão
 * de curadoria o painel fica em leitura: os botões não são renderizados, e a
 * server action recusa a escrita de qualquer forma.
 */
export function CoeNucleusPanel({
  members,
  candidateOptions,
  canCurate,
}: CoeNucleusPanelProps) {
  const [isPending, startTransition] = useTransition();
  const { feedback, notify } = useFeedback();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<CoeMemberView | null>(null);

  const [newConsultantId, setNewConsultantId] = useState("");
  const [newFocusArea, setNewFocusArea] = useState("");
  const [newNote, setNewNote] = useState("");
  const [editFocusArea, setEditFocusArea] = useState("");
  const [editNote, setEditNote] = useState("");

  const term = search.trim().toLocaleLowerCase("pt-BR");
  const matches = useMemo(() => {
    if (!term) return members;
    return members.filter(
      (m) =>
        m.consultantName.toLocaleLowerCase("pt-BR").includes(term) ||
        m.focusArea.toLocaleLowerCase("pt-BR").includes(term) ||
        m.skills.some((s) =>
          s.skillName.toLocaleLowerCase("pt-BR").includes(term),
        ),
    );
  }, [members, term]);

  const active = matches.filter((m) => m.active);
  const inactive = matches.filter((m) => !m.active);

  function resetAddForm() {
    setNewConsultantId("");
    setNewFocusArea("");
    setNewNote("");
  }

  function submitAdd() {
    startTransition(async () => {
      const res = await addCoeMember({
        consultantId: newConsultantId,
        focusArea: newFocusArea,
        note: newNote.trim() ? newNote : null,
      });
      if (res.ok) {
        notify("success", "Consultor incluído no núcleo do COE.");
        setAddOpen(false);
        resetAddForm();
      } else {
        notify("warning", res.message);
      }
    });
  }

  function submitEdit() {
    if (!editing) return;
    startTransition(async () => {
      const res = await updateCoeMember({
        id: editing.id,
        focusArea: editFocusArea,
        note: editNote.trim() ? editNote : null,
      });
      if (res.ok) {
        notify("success", "Curadoria atualizada.");
        setEditing(null);
      } else {
        notify("warning", res.message);
      }
    });
  }

  function toggleActive(member: CoeMemberView) {
    startTransition(async () => {
      const res = await setCoeMemberActive({
        id: member.id,
        active: !member.active,
      });
      if (res.ok) {
        notify(
          "success",
          member.active
            ? `${member.consultantName} saiu do núcleo (histórico preservado).`
            : `${member.consultantName} voltou ao núcleo.`,
        );
      } else {
        notify("warning", res.message);
      }
    });
  }

  function openEdit(member: CoeMemberView) {
    setEditing(member);
    setEditFocusArea(member.focusArea);
    setEditNote(member.note ?? "");
  }

  return (
    <div className="space-y-4">
      <FeedbackBanner message={feedback} />

      <SectionPanel
        title="Núcleo do COE"
        description="Consultores estratégicos disponíveis para compor times e paralelizar frentes. A área de excelência é curada — não é derivada automaticamente das skills."
        action={
          canCurate ? (
            <ActionButton
              icon={UserPlus}
              size="sm"
              onClick={() => setAddOpen(true)}
              disabled={candidateOptions.length === 0}
            >
              Incluir consultor
            </ActionButton>
          ) : undefined
        }
      >
        <div className="border-b border-border px-5 py-3">
          <DataToolbar
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Buscar por nome, área de excelência ou skill…",
              label: "Buscar no núcleo",
            }}
          />
        </div>

        {active.length === 0 ? (
          <div className="px-5 py-6">
            <EmptyState
              icon={Star}
              title={
                members.length === 0
                  ? "O núcleo do COE ainda está vazio"
                  : "Nenhum membro ativo corresponde à busca"
              }
              description={
                members.length === 0
                  ? "Inclua os consultores estratégicos que servirão de base para compor times e paralelizar frentes de projeto."
                  : "Ajuste o termo buscado para encontrar quem procura."
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {active.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-start justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-strong">
                      {member.consultantName}
                    </span>
                    <StatusBadge tone="info">{member.focusArea}</StatusBadge>
                    {member.status === "ON_LEAVE" ? (
                      <StatusBadge tone="warning">Afastado</StatusBadge>
                    ) : null}
                    {/* Um consultor desligado NÃO pode ficar no núcleo sem
                        sinal: ele não entra na composição (a engine descarta
                        INACTIVE), então a curadoria precisa ser revista. */}
                    {member.status === "INACTIVE" ? (
                      <StatusBadge tone="danger">
                        Desligado — revise a curadoria
                      </StatusBadge>
                    ) : null}
                  </div>
                  <p className="text-xs text-soft">
                    {member.jobTitle ?? seniorityLabel(member.seniority)}
                    {member.area ? ` · ${member.area}` : ""}
                    {` · ${seniorityLabel(member.seniority)}`}
                  </p>
                  {member.skills.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {member.skills.slice(0, 8).map((s) => (
                        <span
                          key={s.skillId}
                          className="inline-flex items-center rounded-md border border-border bg-surface-muted px-2 py-0.5 text-xs text-medium"
                        >
                          {s.skillName} · {skillLevelLabels[s.level]}
                        </span>
                      ))}
                      {member.skills.length > 8 ? (
                        <span className="text-xs text-soft">
                          +{member.skills.length - 8}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-soft">
                      Sem skills validadas — o fit técnico deste consultor
                      ficará zerado na composição.
                    </p>
                  )}
                  {member.note ? (
                    <p className="text-xs text-medium">{member.note}</p>
                  ) : null}
                </div>

                {canCurate ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <ActionButton
                      variant="secondary"
                      size="sm"
                      icon={Pencil}
                      onClick={() => openEdit(member)}
                      disabled={isPending}
                    >
                      Editar
                    </ActionButton>
                    <ActionButton
                      variant="danger"
                      size="sm"
                      icon={UserMinus}
                      onClick={() => toggleActive(member)}
                      disabled={isPending}
                    >
                      Sair do núcleo
                    </ActionButton>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionPanel>

      {inactive.length > 0 ? (
        <SectionPanel
          title="Fora do núcleo"
          description="Curadoria preservada: quem saiu continua registrado e pode voltar sem perder o histórico."
        >
          <ul className="divide-y divide-border">
            {inactive.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium text-medium">
                    {member.consultantName}
                  </span>
                  <span className="ml-2 text-xs text-soft">
                    {member.focusArea} · {seniorityLabel(member.seniority)}
                  </span>
                </div>
                {canCurate ? (
                  <ActionButton
                    variant="secondary"
                    size="sm"
                    icon={Plus}
                    onClick={() => toggleActive(member)}
                    disabled={isPending}
                  >
                    Voltar ao núcleo
                  </ActionButton>
                ) : null}
              </li>
            ))}
          </ul>
        </SectionPanel>
      ) : null}

      {/* Incluir consultor */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Incluir consultor no núcleo"
        description="Só consultores ativos aparecem aqui. Quem já esteve no núcleo é reativado com a nova área de excelência."
        footer={
          <div className="flex justify-end gap-2">
            <ActionButton
              variant="secondary"
              onClick={() => setAddOpen(false)}
              disabled={isPending}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              icon={UserPlus}
              onClick={submitAdd}
              disabled={
                isPending ||
                newConsultantId.length === 0 ||
                newFocusArea.trim().length < 2
              }
            >
              {isPending ? "Salvando…" : "Incluir"}
            </ActionButton>
          </div>
        }
      >
        <div className="space-y-4">
          {candidateOptions.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nenhum consultor elegível"
              description="Todos os consultores ativos já fazem parte do núcleo."
            />
          ) : (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-soft">
                  Consultor
                </span>
                <select
                  value={newConsultantId}
                  onChange={(e) => setNewConsultantId(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">— Selecione —</option>
                  {candidateOptions.map((c) => (
                    <option key={c.consultantId} value={c.consultantId}>
                      {c.consultantName} · {seniorityLabel(c.seniority)}
                      {c.previouslyMember ? " (já esteve no núcleo)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-soft">
                  Área de excelência
                </span>
                <input
                  value={newFocusArea}
                  onChange={(e) => setNewFocusArea(e.target.value)}
                  placeholder="Ex.: Dados & Analytics"
                  maxLength={80}
                  className={fieldClass}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-soft">
                  Observação (opcional)
                </span>
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className={cn(
                    "w-full rounded-md border-2 border-ink bg-surface px-3 py-2 text-sm text-strong",
                    focusRingInput,
                  )}
                />
              </label>
            </>
          )}
        </div>
      </Modal>

      {/* Editar curadoria */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={`Curadoria de ${editing?.consultantName ?? ""}`}
        description="Ajuste a área de excelência e a observação da curadoria."
        footer={
          <div className="flex justify-end gap-2">
            <ActionButton
              variant="secondary"
              onClick={() => setEditing(null)}
              disabled={isPending}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              icon={Pencil}
              onClick={submitEdit}
              disabled={isPending || editFocusArea.trim().length < 2}
            >
              {isPending ? "Salvando…" : "Salvar"}
            </ActionButton>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-soft">
              Área de excelência
            </span>
            <input
              value={editFocusArea}
              onChange={(e) => setEditFocusArea(e.target.value)}
              maxLength={80}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-soft">
              Observação (opcional)
            </span>
            <textarea
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              rows={3}
              maxLength={500}
              className={cn(
                "w-full rounded-md border-2 border-ink bg-surface px-3 py-2 text-sm text-strong",
                focusRingInput,
              )}
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}
