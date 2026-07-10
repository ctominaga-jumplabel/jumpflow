"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Pencil, Search, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ActionButton } from "@/components/ui/ActionButton";
import {
  createHolidayAction,
  deleteHolidayAction,
  updateHolidayAction,
} from "@/app/app/admin/feriados/actions";
import type { HolidayScopeKey, HolidayView } from "@/lib/db/holidays";
import { cn } from "@/lib/utils";
import { focusRingInput } from "@/lib/styles";

const SCOPE_LABELS: Record<HolidayScopeKey, string> = {
  NATIONAL: "Nacional",
  STATE: "Estadual",
  CITY: "Municipal",
};
const SCOPES = Object.keys(SCOPE_LABELS) as HolidayScopeKey[];

const inputCls = cn(
  "rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-strong",
  focusRingInput,
);

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

interface ProjectOption {
  id: string;
  name: string;
}

export function HolidaysView({
  holidays,
  years,
  selectedYear,
  projects,
}: {
  holidays: HolidayView[];
  years: number[];
  selectedYear?: number;
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<HolidayView | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<HolidayView | null>(null);
  const [pending, start] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);

  function handleYearChange(value: string) {
    router.push(
      value ? `/app/admin/feriados?ano=${value}` : "/app/admin/feriados",
    );
  }

  function confirmDelete() {
    if (!toDelete) return;
    const id = toDelete.id;
    setRowError(null);
    start(async () => {
      const r = await deleteHolidayAction({ id });
      if (r.ok) {
        setToDelete(null);
        router.refresh();
      } else {
        setRowError(r.message);
        setToDelete(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-xs text-soft">
          Ano
          <select
            className={inputCls}
            value={selectedYear ?? ""}
            onChange={(e) => handleYearChange(e.target.value)}
          >
            <option value="">Todos os anos</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <ActionButton
          size="sm"
          icon={CalendarPlus}
          onClick={() => setCreating(true)}
        >
          Novo feriado
        </ActionButton>
      </div>

      {rowError && <p className="text-sm text-danger">{rowError}</p>}

      {/* List */}
      {holidays.length === 0 ? (
        <p className="text-sm text-medium">
          Nenhum feriado cadastrado{selectedYear ? ` em ${selectedYear}` : ""}.
          Cadastre o primeiro em &ldquo;Novo feriado&rdquo;.
        </p>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-card)] border-2 border-ink bg-surface shadow-[4px_4px_0_0_var(--color-ink)]">
          <table className="w-full text-left text-sm">
            <thead className="border-b-2 border-ink bg-surface-muted text-xs uppercase tracking-wide text-soft">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Data</th>
                <th className="px-4 py-2.5 font-semibold">Feriado</th>
                <th className="px-4 py-2.5 font-semibold">Abrangência</th>
                <th className="px-4 py-2.5 font-semibold">Aplicabilidade</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {holidays.map((h) => (
                <tr key={h.id} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium text-strong">
                    {formatDate(h.date)}
                  </td>
                  <td className="px-4 py-2.5 text-strong">{h.name}</td>
                  <td className="px-4 py-2.5 text-medium">
                    <Badge>{SCOPE_LABELS[h.scope]}</Badge>
                    {h.region && (
                      <span className="ml-1.5 text-xs text-soft">
                        {h.region}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-medium">
                    {h.projects.length === 0 ? (
                      <Badge>Global (todos os projetos)</Badge>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {h.projects.map((p) => (
                          <Badge key={p.id}>{p.name}</Badge>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <button
                      type="button"
                      className="mr-3 text-medium transition-colors hover:text-strong disabled:opacity-50"
                      title="Editar feriado"
                      aria-label={`Editar ${h.name}`}
                      disabled={pending}
                      onClick={() => setEditing(h)}
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="text-danger transition-colors hover:opacity-80 disabled:opacity-50"
                      title="Remover feriado"
                      aria-label={`Remover ${h.name}`}
                      disabled={pending}
                      onClick={() => setToDelete(h)}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <HolidayFormModal
          key={editing?.id ?? "new"}
          holiday={editing}
          projects={projects}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      {/* Delete confirmation — design-system Modal (mesmo padrão do TimeEntryForm). */}
      <Modal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title="Remover feriado?"
        description="Os vínculos com projetos serão removidos junto. Esta ação não pode ser desfeita."
        footer={
          <>
            <ActionButton
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => setToDelete(null)}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              variant="danger"
              size="sm"
              icon={Trash2}
              disabled={pending}
              onClick={confirmDelete}
            >
              Remover
            </ActionButton>
          </>
        }
      >
        {toDelete && (
          <p className="text-sm text-medium">
            Remover{" "}
            <strong className="text-strong">{toDelete.name}</strong> (
            {formatDate(toDelete.date)})?
          </p>
        )}
      </Modal>
    </div>
  );
}

function HolidayFormModal({
  holiday,
  projects,
  onClose,
  onSaved,
}: {
  holiday: HolidayView | null;
  projects: ProjectOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = holiday !== null;
  const [date, setDate] = useState(holiday?.date ?? "");
  const [name, setName] = useState(holiday?.name ?? "");
  const [scope, setScope] = useState<HolidayScopeKey>(
    holiday?.scope ?? "NATIONAL",
  );
  const [region, setRegion] = useState(holiday?.region ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(holiday?.projects.map((p) => p.id) ?? []),
  );
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // N5: the active-projects list may not include a project already linked to
  // this holiday (e.g. it was closed). Merge the linked projects in so they can
  // be unchecked. Dedup by id, sorted by name.
  const options = useMemo<ProjectOption[]>(() => {
    const byId = new Map<string, ProjectOption>();
    for (const p of projects) byId.set(p.id, p);
    for (const p of holiday?.projects ?? []) if (!byId.has(p.id)) byId.set(p.id, p);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [projects, holiday]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((p) => p.name.toLowerCase().includes(q));
  }, [options, search]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit() {
    setError(null);
    const projectIds = [...selected];
    start(async () => {
      const payload = {
        date,
        name,
        scope,
        region: scope === "NATIONAL" ? null : region,
        projectIds,
      };
      const r = isEdit
        ? await updateHolidayAction({ ...payload, id: holiday!.id })
        : await createHolidayAction(payload);
      if (r.ok) onSaved();
      else setError(r.message);
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Editar feriado" : "Novo feriado"}
      description="Sem projetos selecionados, o feriado vale para todos (global)."
      footer={
        <>
          <ActionButton
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={onClose}
          >
            Cancelar
          </ActionButton>
          <ActionButton
            variant="primary"
            size="sm"
            disabled={pending}
            onClick={handleSubmit}
          >
            {isEdit ? "Salvar" : "Cadastrar"}
          </ActionButton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-soft">
            Data
            <input
              type="date"
              className={inputCls}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-soft">
            Abrangência
            <select
              className={inputCls}
              value={scope}
              onChange={(e) => setScope(e.target.value as HolidayScopeKey)}
            >
              {SCOPES.map((s) => (
                <option key={s} value={s}>
                  {SCOPE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs text-soft">
          Nome do feriado
          <input
            className={inputCls}
            placeholder="Ex.: Independência do Brasil"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {scope !== "NATIONAL" && (
          <label className="flex flex-col gap-1 text-xs text-soft">
            {scope === "STATE" ? "UF (estado)" : "Município"}
            <input
              className={inputCls}
              placeholder={scope === "STATE" ? "Ex.: SP" : "Ex.: São Paulo"}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            />
          </label>
        )}

        {/* Projects multi-select with search */}
        <div className="flex flex-col gap-1.5 text-xs text-soft">
          <span>
            Projetos (
            {selected.size === 0
              ? "global"
              : `${selected.size} selecionado(s)`}
            )
          </span>
          <div className="rounded-md border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
              <Search aria-hidden="true" className="size-3.5 text-soft" />
              <input
                className="w-full bg-transparent text-sm text-strong outline-none"
                placeholder="Buscar projeto…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <ul className="max-h-44 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-soft">
                  Nenhum projeto encontrado.
                </li>
              ) : (
                filtered.map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-strong hover:bg-surface-muted">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggle(p.id)}
                      />
                      {p.name}
                    </label>
                  </li>
                ))
              )}
            </ul>
          </div>
          <p className="text-[11px] text-soft">
            Sem projetos selecionados = vale para todos os projetos (global).
          </p>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-surface-muted px-2 py-0.5 text-xs font-medium text-medium">
      {children}
    </span>
  );
}
