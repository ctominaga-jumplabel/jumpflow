"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  addRecipient,
  createRule,
  deleteRule,
  removeRecipient,
  toggleRuleActive,
} from "@/app/app/admin/notificacoes/actions";
import type {
  NotificationChannelKey,
  NotificationEventKey,
  NotificationRecipientTypeKey,
  NotificationRuleView,
  NotificationScopeKey,
} from "@/lib/db/notification-rules";

const EVENT_LABELS: Record<NotificationEventKey, string> = {
  HOURS_RELEASED: "Liberação de horas",
  CLIENT_BILLING_SUMMARY: "Apuração ao cliente",
  OVERTIME_ALERT: "Alerta de hora extra",
  PROJECT_CREATED: "Novo projeto",
  INVOICING_OVERDUE: "Faturamento pendente",
  COMMERCIAL_CONTRACT_MISSING: "Contrato ausente",
  OPERATION_CLOSED: "Fechamento operacional (DP)",
};
const EVENTS = Object.keys(EVENT_LABELS) as NotificationEventKey[];
const SCOPES: NotificationScopeKey[] = ["GLOBAL", "PROJECT"];
const CHANNELS: NotificationChannelKey[] = ["EMAIL", "TEAMS"];
const RECIPIENT_TYPES: Record<NotificationRecipientTypeKey, string> = {
  STATIC: "E-mail / URL fixo",
  ROLE: "Papel (grupo)",
  PROJECT_MANAGER: "Gestor do projeto",
  CLIENT_CONTACT: "Contato do cliente",
};
const ROLE_NAMES = [
  "ADMIN",
  "AREA_MANAGER",
  "FINANCE",
  "SALES",
  "PROJECT_MANAGER",
  "PEOPLE",
  "CONSULTANT",
];

const inputCls =
  "rounded-md border border-[#d7d8cf] bg-white px-2.5 py-1.5 text-sm text-ink";
const btnPrimary =
  "inline-flex items-center gap-1.5 rounded-md border-2 border-ink bg-[#2457ff] px-3 py-1.5 text-sm font-bold text-white shadow-[3px_3px_0_#111814] disabled:opacity-60";

export function NotificationRulesView({
  rules,
  projects,
}: {
  rules: NotificationRuleView[];
  projects: Array<{ id: string; name: string }>;
}) {
  const [event, setEvent] = useState<NotificationEventKey>("PROJECT_CREATED");
  const [scope, setScope] = useState<NotificationScopeKey>("GLOBAL");
  const [scopeId, setScopeId] = useState("");
  const [channel, setChannel] = useState<NotificationChannelKey>("EMAIL");
  const [groupByRecipient, setGroupByRecipient] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function handleCreate() {
    setMsg(null);
    start(async () => {
      const r = await createRule({
        event,
        scope,
        scopeId: scope === "GLOBAL" ? null : scopeId || null,
        channel,
        groupByRecipient,
      });
      setMsg(
        r.ok
          ? { ok: true, text: "Regra criada." }
          : { ok: false, text: r.message },
      );
    });
  }

  const projectName = (id: string | null) =>
    projects.find((p) => p.id === id)?.name ?? id ?? "—";

  return (
    <div className="space-y-6">
      {/* Create rule */}
      <section className="rounded-md border-2 border-ink bg-white p-4 shadow-[4px_4px_0_#111814]">
        <h2 className="mb-3 text-sm font-bold text-ink">Nova regra</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-[#6d756f]">
            Evento
            <select
              className={inputCls}
              value={event}
              onChange={(e) => setEvent(e.target.value as NotificationEventKey)}
            >
              {EVENTS.map((ev) => (
                <option key={ev} value={ev}>
                  {EVENT_LABELS[ev]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#6d756f]">
            Escopo
            <select
              className={inputCls}
              value={scope}
              onChange={(e) => setScope(e.target.value as NotificationScopeKey)}
            >
              {SCOPES.map((s) => (
                <option key={s} value={s}>
                  {s === "GLOBAL" ? "Global" : "Projeto"}
                </option>
              ))}
            </select>
          </label>
          {scope === "PROJECT" && (
            <label className="flex flex-col gap-1 text-xs text-[#6d756f]">
              Projeto
              <select
                className={inputCls}
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
              >
                <option value="">Selecione…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs text-[#6d756f]">
            Canal
            <select
              className={inputCls}
              value={channel}
              onChange={(e) =>
                setChannel(e.target.value as NotificationChannelKey)
              }
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c === "EMAIL" ? "E-mail" : "Teams"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 py-1.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={groupByRecipient}
              onChange={(e) => setGroupByRecipient(e.target.checked)}
            />
            Agrupar por destinatário
          </label>
          <button className={btnPrimary} onClick={handleCreate} disabled={pending}>
            <Plus size={16} /> Criar
          </button>
          {msg && (
            <span
              className={`text-sm ${msg.ok ? "text-[#166534]" : "text-[#b91c1c]"}`}
            >
              {msg.text}
            </span>
          )}
        </div>
      </section>

      {/* Existing rules */}
      {rules.length === 0 ? (
        <p className="text-sm text-[#6d756f]">
          Nenhuma regra cadastrada. Crie a primeira acima — sem regras, nenhum
          e-mail é enviado.
        </p>
      ) : (
        <div className="space-y-4">
          {rules.map((rule) => (
            <RuleCard key={rule.id} rule={rule} projectName={projectName} />
          ))}
        </div>
      )}
    </div>
  );
}

function RuleCard({
  rule,
  projectName,
}: {
  rule: NotificationRuleView;
  projectName: (id: string | null) => string;
}) {
  const [type, setType] = useState<NotificationRecipientTypeKey>("ROLE");
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [recChannel, setRecChannel] = useState<NotificationChannelKey>(
    rule.channel,
  );
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const needsAddress = type === "STATIC" || type === "ROLE";

  function act(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErr(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setErr(r.message ?? "Falha.");
    });
  }

  return (
    <section
      className={`rounded-md border bg-white p-4 ${
        rule.active ? "border-[#d7d8cf]" : "border-dashed border-[#d7d8cf] opacity-70"
      }`}
    >
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <strong className="text-sm text-ink">{EVENT_LABELS[rule.event]}</strong>
        <Badge>{rule.scope === "GLOBAL" ? "Global" : projectName(rule.scopeId)}</Badge>
        <Badge>{rule.channel === "EMAIL" ? "E-mail" : "Teams"}</Badge>
        {rule.groupByRecipient && <Badge>Agrupado</Badge>}
        <span className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-ink">
            <input
              type="checkbox"
              checked={rule.active}
              disabled={pending}
              onChange={(e) =>
                act(() => toggleRuleActive({ id: rule.id, active: e.target.checked }))
              }
            />
            Ativa
          </label>
          <button
            className="text-[#b91c1c]"
            title="Remover regra"
            disabled={pending}
            onClick={() => act(() => deleteRule({ id: rule.id }))}
          >
            <Trash2 size={16} />
          </button>
        </span>
      </header>

      {/* Recipients */}
      <ul className="mb-3 space-y-1">
        {rule.recipients.length === 0 && (
          <li className="text-xs text-[#92400e]">
            Sem destinatários — esta regra não envia nada.
          </li>
        )}
        {rule.recipients.map((rec) => (
          <li
            key={rec.id}
            className="flex items-center gap-2 text-sm text-[#42524a]"
          >
            <Badge>{RECIPIENT_TYPES[rec.type]}</Badge>
            <span>{rec.address ?? "(dinâmico)"}</span>
            {rec.channel === "TEAMS" && <Badge>Teams</Badge>}
            <button
              className="text-[#b91c1c]"
              title="Remover destinatário"
              disabled={pending}
              onClick={() => act(() => removeRecipient({ id: rec.id }))}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>

      {/* Add recipient */}
      <div className="flex flex-wrap items-end gap-2 border-t border-[#eceff3] pt-3">
        <select
          className={inputCls}
          value={type}
          onChange={(e) =>
            setType(e.target.value as NotificationRecipientTypeKey)
          }
        >
          {(Object.keys(RECIPIENT_TYPES) as NotificationRecipientTypeKey[]).map(
            (t) => (
              <option key={t} value={t}>
                {RECIPIENT_TYPES[t]}
              </option>
            ),
          )}
        </select>
        {needsAddress &&
          (type === "ROLE" ? (
            <select
              className={inputCls}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            >
              <option value="">Papel…</option>
              {ROLE_NAMES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={inputCls}
              placeholder={recChannel === "TEAMS" ? "URL do webhook" : "e-mail@dominio"}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          ))}
        <select
          className={inputCls}
          value={recChannel}
          onChange={(e) =>
            setRecChannel(e.target.value as NotificationChannelKey)
          }
        >
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c === "EMAIL" ? "E-mail" : "Teams"}
            </option>
          ))}
        </select>
        <input
          className={inputCls}
          placeholder="Nome (opcional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="inline-flex items-center gap-1 rounded-md border border-ink bg-white px-2.5 py-1.5 text-sm font-semibold text-ink"
          disabled={pending}
          onClick={() => {
            act(async () => {
              const r = await addRecipient({
                ruleId: rule.id,
                type,
                channel: recChannel,
                address: needsAddress ? address : undefined,
                name: name || undefined,
              });
              if (r.ok) {
                setAddress("");
                setName("");
              }
              return r;
            });
          }}
        >
          <Plus size={14} /> Adicionar
        </button>
        {err && <span className="text-sm text-[#b91c1c]">{err}</span>}
      </div>
    </section>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-[#eceff3] px-2 py-0.5 text-xs font-medium text-[#42524a]">
      {children}
    </span>
  );
}
