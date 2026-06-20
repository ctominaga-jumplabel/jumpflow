"use client";

import { useMemo, useState, useTransition } from "react";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import {
  addProfileItem,
  createProfile,
  removeProfileItem,
  setProfileStatus,
  updateProfile,
  updateProfileItem,
} from "@/app/app/competencias/actions";
import {
  competencyScopeLabels,
  skillLevelLabels,
  skillStatusLabels,
  skillTypeLabels,
  type CompetencyProfileView,
  type CompetencyScope,
  type SkillLevel,
  type SkillOption,
  type SkillStatus,
} from "@/lib/competencies/types";
import { EnumSelect, TextField } from "./fields";

interface ProfileDraft {
  id?: string;
  name: string;
  scope: CompetencyScope;
  referenceKey: string;
  status: SkillStatus;
}

const emptyProfile: ProfileDraft = {
  name: "",
  scope: "SENIORITY",
  referenceKey: "",
  status: "ACTIVE",
};

export interface CompetencyProfilesManagerProps {
  profiles: CompetencyProfileView[];
  skillOptions: SkillOption[];
  canManage: boolean;
}

/**
 * CRUD de perfis de competência (EP13) + gestão dos itens (skill + nível
 * requerido). Escrita gated no servidor por COMPETENCY_WRITE_ROLES.
 */
export function CompetencyProfilesManager({
  profiles,
  skillOptions,
  canManage,
}: CompetencyProfilesManagerProps) {
  const { feedback, notify } = useFeedback();
  const [pending, startTransition] = useTransition();
  const [profileOpen, setProfileOpen] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(emptyProfile);

  // Item form (inline por perfil).
  const [itemFor, setItemFor] = useState<string | null>(null);
  const [itemSkillId, setItemSkillId] = useState<string>("");
  const [itemLevel, setItemLevel] = useState<SkillLevel>("INTERMEDIATE");

  const sortedProfiles = useMemo(
    () =>
      [...profiles].sort(
        (a, b) =>
          (a.status === b.status ? 0 : a.status === "ACTIVE" ? -1 : 1) ||
          a.name.localeCompare(b.name, "pt-BR"),
      ),
    [profiles],
  );

  function openCreate() {
    setDraft(emptyProfile);
    setProfileOpen(true);
  }

  function openEdit(profile: CompetencyProfileView) {
    setDraft({
      id: profile.id,
      name: profile.name,
      scope: profile.scope,
      referenceKey: profile.referenceKey,
      status: profile.status,
    });
    setProfileOpen(true);
  }

  function submitProfile() {
    const isEdit = Boolean(draft.id);
    startTransition(async () => {
      const result = isEdit
        ? await updateProfile({
            id: draft.id!,
            name: draft.name,
            scope: draft.scope,
            referenceKey: draft.referenceKey,
            status: draft.status,
          })
        : await createProfile({
            name: draft.name,
            scope: draft.scope,
            referenceKey: draft.referenceKey,
          });
      if (result.ok) {
        setProfileOpen(false);
        notify("success", isEdit ? "Perfil atualizado." : "Perfil criado.");
      } else {
        notify("warning", result.message);
      }
    });
  }

  function toggleProfileStatus(profile: CompetencyProfileView) {
    const next: SkillStatus =
      profile.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    startTransition(async () => {
      const result = await setProfileStatus({ id: profile.id, status: next });
      if (result.ok) {
        notify(
          "success",
          next === "ACTIVE" ? "Perfil reativado." : "Perfil inativado.",
        );
      } else {
        notify("warning", result.message);
      }
    });
  }

  function openItemForm(profileId: string) {
    setItemFor(profileId);
    setItemSkillId(skillOptions[0]?.id ?? "");
    setItemLevel("INTERMEDIATE");
  }

  function submitItem(profileId: string) {
    if (!itemSkillId) {
      notify("warning", "Selecione uma skill ativa.");
      return;
    }
    startTransition(async () => {
      const result = await addProfileItem({
        profileId,
        skillId: itemSkillId,
        requiredLevel: itemLevel,
      });
      if (result.ok) {
        setItemFor(null);
        notify("success", "Skill adicionada ao perfil.");
      } else {
        notify("warning", result.message);
      }
    });
  }

  function changeItemLevel(itemId: string, requiredLevel: SkillLevel) {
    startTransition(async () => {
      const result = await updateProfileItem({ id: itemId, requiredLevel });
      if (!result.ok) notify("warning", result.message);
    });
  }

  function deleteItem(itemId: string) {
    startTransition(async () => {
      const result = await removeProfileItem({ id: itemId });
      if (result.ok) notify("success", "Skill removida do perfil.");
      else notify("warning", result.message);
    });
  }

  const referenceHint =
    draft.scope === "SENIORITY"
      ? "Use a senioridade (ex.: SENIOR, JUNIOR) — casa com a senioridade do consultor."
      : draft.scope === "ROLE"
        ? "Use o cargo (ex.: TECH_LEAD) — casa com o cargo do consultor."
        : "Use a área (ex.: DATA) — casa com a área do consultor.";

  return (
    <div className="space-y-4">
      <FeedbackBanner message={feedback} />

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-soft">
          Precedência ao resolver o perfil do consultor: Cargo &gt; Senioridade
          &gt; Área.
        </p>
        {canManage ? (
          <ActionButton icon={Plus} onClick={openCreate} disabled={pending}>
            Novo perfil
          </ActionButton>
        ) : null}
      </div>

      {sortedProfiles.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Nenhum perfil de competência"
          description="Crie perfis por senioridade, cargo ou área para definir o nível requerido de cada skill."
        />
      ) : (
        <div className="space-y-4">
          {sortedProfiles.map((profile) => (
            <SectionPanel
              key={profile.id}
              title={profile.name}
              description={`${competencyScopeLabels[profile.scope]} · ${profile.referenceKey} · ${profile.items.length} skills`}
              action={
                <div className="flex items-center gap-2">
                  <StatusBadge
                    tone={profile.status === "ACTIVE" ? "success" : "neutral"}
                  >
                    {skillStatusLabels[profile.status]}
                  </StatusBadge>
                  {canManage ? (
                    <>
                      <ActionButton
                        variant="secondary"
                        size="sm"
                        icon={Pencil}
                        onClick={() => openEdit(profile)}
                        disabled={pending}
                      >
                        Editar
                      </ActionButton>
                      <ActionButton
                        variant={
                          profile.status === "ACTIVE" ? "danger" : "success"
                        }
                        size="sm"
                        onClick={() => toggleProfileStatus(profile)}
                        disabled={pending}
                      >
                        {profile.status === "ACTIVE" ? "Inativar" : "Reativar"}
                      </ActionButton>
                    </>
                  ) : null}
                </div>
              }
            >
              <div className="px-5 py-4">
                {profile.items.length === 0 ? (
                  <p className="text-sm text-soft">
                    Nenhuma skill neste perfil ainda.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {profile.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-strong">
                            {item.skillName}
                          </p>
                          <p className="text-xs text-soft">
                            {skillTypeLabels[item.skillType]}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {canManage ? (
                            <select
                              value={item.requiredLevel}
                              disabled={pending}
                              onChange={(event) =>
                                changeItemLevel(
                                  item.id,
                                  event.target.value as SkillLevel,
                                )
                              }
                              aria-label={`Nível requerido de ${item.skillName}`}
                              className="h-8 rounded-md border border-border bg-surface px-2 text-xs"
                            >
                              {(
                                Object.entries(skillLevelLabels) as [
                                  SkillLevel,
                                  string,
                                ][]
                              ).map(([key, label]) => (
                                <option key={key} value={key}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <StatusBadge tone="info">
                              {skillLevelLabels[item.requiredLevel]}
                            </StatusBadge>
                          )}
                          {canManage ? (
                            <ActionButton
                              variant="danger"
                              size="sm"
                              icon={Trash2}
                              onClick={() => deleteItem(item.id)}
                              disabled={pending}
                              aria-label={`Remover ${item.skillName}`}
                            >
                              Remover
                            </ActionButton>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {canManage ? (
                  itemFor === profile.id ? (
                    <div className="mt-4 flex flex-wrap items-end gap-3 rounded-md border border-border bg-surface-muted/40 p-3">
                      <label className="space-y-1 text-xs font-medium text-medium">
                        Skill
                        <select
                          value={itemSkillId}
                          onChange={(event) => setItemSkillId(event.target.value)}
                          className="h-9 w-56 rounded-md border border-border bg-surface px-2 text-sm"
                        >
                          {skillOptions.length === 0 ? (
                            <option value="">Nenhuma skill ativa</option>
                          ) : (
                            skillOptions.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name} ({skillTypeLabels[s.type]})
                              </option>
                            ))
                          )}
                        </select>
                      </label>
                      <label className="space-y-1 text-xs font-medium text-medium">
                        Nível requerido
                        <select
                          value={itemLevel}
                          onChange={(event) =>
                            setItemLevel(event.target.value as SkillLevel)
                          }
                          className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                        >
                          {(
                            Object.entries(skillLevelLabels) as [
                              SkillLevel,
                              string,
                            ][]
                          ).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <ActionButton
                        size="sm"
                        onClick={() => submitItem(profile.id)}
                        disabled={pending}
                      >
                        Adicionar
                      </ActionButton>
                      <ActionButton
                        variant="secondary"
                        size="sm"
                        onClick={() => setItemFor(null)}
                        disabled={pending}
                      >
                        Cancelar
                      </ActionButton>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <ActionButton
                        variant="secondary"
                        size="sm"
                        icon={Plus}
                        onClick={() => openItemForm(profile.id)}
                        disabled={pending}
                      >
                        Adicionar skill
                      </ActionButton>
                    </div>
                  )
                ) : null}
              </div>
            </SectionPanel>
          ))}
        </div>
      )}

      <Modal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title={draft.id ? "Editar perfil" : "Novo perfil de competência"}
        description="Perfis padronizam o nível requerido por senioridade, cargo ou área."
        footer={
          <>
            <ActionButton
              variant="secondary"
              onClick={() => setProfileOpen(false)}
              disabled={pending}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              onClick={submitProfile}
              disabled={
                pending ||
                draft.name.trim().length < 2 ||
                draft.referenceKey.trim().length < 1
              }
            >
              {draft.id ? "Salvar" : "Criar"}
            </ActionButton>
          </>
        }
      >
        <div className="space-y-4">
          <TextField
            label="Nome"
            value={draft.name}
            placeholder="Ex.: Dev Sênior, Tech Lead"
            required
            onChange={(name) => setDraft((d) => ({ ...d, name }))}
          />
          <EnumSelect
            label="Escopo"
            value={draft.scope}
            options={competencyScopeLabels}
            onChange={(scope) => setDraft((d) => ({ ...d, scope }))}
          />
          <TextField
            label="Referência"
            value={draft.referenceKey}
            placeholder="Ex.: SENIOR"
            required
            onChange={(referenceKey) =>
              setDraft((d) => ({ ...d, referenceKey }))
            }
          />
          <p className="text-xs text-soft">{referenceHint}</p>
          {draft.id ? (
            <EnumSelect
              label="Situação"
              value={draft.status}
              options={skillStatusLabels}
              hint="Perfil inativo não é usado em novos cálculos de gap, mas preserva o histórico."
              onChange={(status) => setDraft((d) => ({ ...d, status }))}
            />
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
