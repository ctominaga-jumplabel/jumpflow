"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, Pencil, Search, Trash2, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  createHolidayAction,
  deleteHolidayAction,
  updateHolidayAction,
} from "@/app/app/admin/feriados/actions";
import type { HolidayScopeKey, HolidayView } from "@/lib/db/holidays";

const SCOPE_LABELS: Record<HolidayScopeKey, string> = {
  NATIONAL: "Nacional",
  STATE: "Estadual",
  CITY: "Municipal",
};
const SCOPES = Object.keys(SCOPE_LABELS) as HolidayScopeKey[];

const inputCls =
  "rounded-md border border-[#d7d8cf] bg-white px-2.5 py-1.5 text-sm text-ink";
const btnPrimary =
  "inline-flex items-center gap-1.5 rounded-md border-2 border-ink bg-[#2457ff] px-3 py-1.5 text-sm font-bold text-white shadow-[3px_3px_0_#111814] disabled:opacity-60";
const btnGhost =
  "inline-flex items-center gap-1.5 rounded-md border border-ink bg-white px-2.5 py-1.5 text-sm font-semibold text-ink disabled:opacity-60";

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
  const [pending, start] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);

  function handleYearChange(value: string) {
    router.push(value ? `/app/admin/feriados?ano=${value}` : "/app/admin/feriados");
  }

  function handleDelete(holiday: HolidayView) {
    if (
      !window.confirm(
        `Remover o feriado "${holiday.name}" (${formatDate(holiday.date)})?`,
      )
    ) {
      return;
    }
    setRowError(null);
    start(async () => {
      const r = await deleteHolidayAction({ id: holiday.id });
      if (r.ok) {
        router.refresh();
      } else {
        setRowError(r.message);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-xs text-[#6d756f]">
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
        <button
          type="button"
          className={btnPrimary}
          onClick={() => setCreating(true)}
        >
          <CalendarPlus size={16} /> Novo feriado
        </button>
      </div>

      {rowError && <p className="text-sm text-[#b91c1c]">{rowError}</p>}

      {/* List */}
      {holidays.length === 0 ? (
        <p className="text-sm text-[#6d756f]">
          Nenhum feriado cadastrado{selectedYear ? ` em ${selectedYear}` : ""}.
          Cadastre o primeiro em &ldquo;Novo feriado&rdquo;.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border-2 border-ink bg-white shadow-[4px_4px_0_#111814]">
          <table className="w-full text-left text-sm">
            <thead className="border-b-2 border-ink bg-[#f4f5f0] text-xs uppercase tracking-wide text-[#6d756f]">
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
                <tr key={h.id} className="border-b border-[#eceff3] last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium text-ink">
                    {formatDate(h.date)}
                  </td>
                  <td className="px-4 py-2.5 text-ink">{h.name}</td>
                  <td className="px-4 py-2.5 text-[#42524a]">
                    <Badge>{SCOPE_LABELS[h.scope]}</Badge>
                    {h.region && (
                      <span className="ml-1.5 text-xs text-[#6d756f]">
                        {h.region}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[#42524a]">
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
                      className="mr-2 text-ink"
                      title="Editar feriado"
                      disabled={pending}
                      onClick={() => setEditing(h)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className="text-[#b91c1c]"
                      title="Remover feriado"
                      disabled={pending}
                      onClick={() => handleDelete(h)}
                    >
                      <Trash2 size={16} />
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, search]);

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
          <button type="button" className={btnGhost} onClick={onClose} disabled={pending}>
            <X size={16} /> Cancelar
          </button>
          <button
            type="button"
            className={btnPrimary}
            onClick={handleSubmit}
            disabled={pending}
          >
            <Check size={16} /> {isEdit ? "Salvar" : "Cadastrar"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-[#6d756f]">
            Data
            <input
              type="date"
              className={inputCls}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#6d756f]">
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

        <label className="flex flex-col gap-1 text-xs text-[#6d756f]">
          Nome do feriado
          <input
            className={inputCls}
            placeholder="Ex.: Independência do Brasil"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {scope !== "NATIONAL" && (
          <label className="flex flex-col gap-1 text-xs text-[#6d756f]">
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
        <div className="flex flex-col gap-1.5 text-xs text-[#6d756f]">
          <span>
            Projetos ({selected.size === 0 ? "global" : `${selected.size} selecionado(s)`})
          </span>
          <div className="rounded-md border border-[#d7d8cf] bg-white">
            <div className="flex items-center gap-2 border-b border-[#eceff3] px-2.5 py-1.5">
              <Search size={14} className="text-[#6d756f]" />
              <input
                className="w-full bg-transparent text-sm text-ink outline-none"
                placeholder="Buscar projeto…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <ul className="max-h-44 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-[#6d756f]">
                  Nenhum projeto encontrado.
                </li>
              ) : (
                filtered.map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-ink hover:bg-[#f4f5f0]">
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
          <p className="text-[11px] text-[#6d756f]">
            Sem projetos selecionados = vale para todos os projetos (global).
          </p>
        </div>

        {error && <p className="text-sm text-[#b91c1c]">{error}</p>}
      </div>
    </Modal>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-[#eceff3] px-2 py-0.5 text-xs font-medium text-[#42524a]">
      {children}
    </span>
  );
}
