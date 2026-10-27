"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BellRing, MailX, RotateCcw, Save, Send } from "lucide-react";
import {
  previewEmailTemplate,
  restoreEmailTemplateDefault,
  saveEmailTemplate,
  sendEmailTemplateTest,
  type EmailTemplateDraft,
} from "@/app/app/admin/templates-email/actions";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Tipos (serializáveis, montados no server component)
// ---------------------------------------------------------------------------
export interface EmailTemplateVariableView {
  key: string;
  label: string;
  block: boolean;
  example: string;
}

interface EventBase {
  event: string;
  label: string;
  group: string;
  description: string;
  audience: string;
  rulesSummary: string;
}

export type EmailTemplateEventView =
  | (EventBase & {
      sendsEmail: true;
      brand: "product" | "company";
      defaultSubject: string;
      defaultBody: string;
      variables: EmailTemplateVariableView[];
      custom: {
        subject: string;
        body: string;
        active: boolean;
        updatedAt: string;
        updatedByName: string | null;
      } | null;
    })
  | (EventBase & { sendsEmail: false; reason: string });

type Status = { label: string; tone: StatusTone };

function statusOf(ev: EmailTemplateEventView): Status {
  if (!ev.sendsEmail) return { label: "Sem e-mail", tone: "neutral" };
  if (!ev.custom) return { label: "Padrão", tone: "neutral" };
  if (!ev.custom.active) return { label: "Inativo", tone: "warning" };
  return { label: "Personalizado", tone: "info" };
}

const inputCls =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const btnPrimary =
  "inline-flex items-center gap-1.5 rounded-md border-2 border-ink bg-brand-fill px-3 py-1.5 text-sm font-bold text-white shadow-[3px_3px_0_0_var(--color-ink)] disabled:opacity-60";
const btnSecondary =
  "inline-flex items-center gap-1.5 rounded-md border border-ink bg-surface px-3 py-1.5 text-sm font-semibold text-ink disabled:opacity-60";

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------
export function EmailTemplatesView({
  events,
  groups,
  initialEvent,
  canEdit,
}: {
  events: EmailTemplateEventView[];
  groups: string[];
  initialEvent: string;
  canEdit: boolean;
}) {
  const [selected, setSelected] = useState(initialEvent);
  const [dirty, setDirty] = useState(false);
  const current = events.find((e) => e.event === selected) ?? events[0];

  const grouped = useMemo(
    () =>
      groups
        .map((g) => ({ group: g, items: events.filter((e) => e.group === g) }))
        .filter((g) => g.items.length > 0),
    [events, groups],
  );

  function select(event: string) {
    if (event === selected) return;
    if (dirty && !window.confirm("Descartar as alterações não salvas deste template?")) return;
    setDirty(false);
    setSelected(event);
    const url = new URL(window.location.href);
    url.searchParams.set("evento", event);
    window.history.replaceState(null, "", url.toString());
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <nav
        aria-label="Eventos de notificação"
        className="space-y-5 self-start rounded-[var(--radius-card)] border-2 border-ink bg-surface p-3 shadow-[4px_4px_0_0_var(--color-ink)]"
      >
        {grouped.map(({ group, items }) => (
          <div key={group}>
            <h2 className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-soft">
              {group}
            </h2>
            <ul className="space-y-0.5">
              {items.map((ev) => {
                const st = statusOf(ev);
                const active = ev.event === current.event;
                return (
                  <li key={ev.event}>
                    <button
                      type="button"
                      onClick={() => select(ev.event)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                        active
                          ? "bg-surface-muted font-semibold text-ink"
                          : "text-medium hover:bg-surface-muted",
                      )}
                    >
                      <span className="min-w-0 truncate">{ev.label}</span>
                      <StatusBadge tone={st.tone} className="shrink-0">
                        {st.label}
                      </StatusBadge>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="min-w-0">
        {current.sendsEmail ? (
          <TemplateEditor
            key={current.event}
            ev={current}
            canEdit={canEdit}
            onDirtyChange={setDirty}
          />
        ) : (
          <NoEmailPanel ev={current} />
        )}
      </div>
    </div>
  );
}

function EventHeader({ ev }: { ev: EmailTemplateEventView }) {
  const st = statusOf(ev);
  return (
    <header className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-strong">{ev.label}</h2>
        <StatusBadge tone={st.tone} strong={st.label === "Personalizado"}>
          {st.label}
        </StatusBadge>
        {ev.sendsEmail && ev.brand === "company" ? (
          <StatusBadge tone="neutral">Marca Jump (cliente)</StatusBadge>
        ) : null}
      </div>
      <p className="text-sm text-medium">{ev.description}</p>
      <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
        <dt className="text-soft">Destinatário natural</dt>
        <dd className="text-ink">{ev.audience}</dd>
        <dt className="text-soft">Regra de notificação</dt>
        <dd className="flex flex-wrap items-center gap-2 text-ink">
          <span>{ev.rulesSummary}</span>
          <Link
            href="/app/admin/notificacoes"
            className="inline-flex items-center gap-1 font-semibold text-brand-dark underline-offset-2 hover:underline"
          >
            <BellRing size={12} aria-hidden /> Regras
          </Link>
        </dd>
      </dl>
    </header>
  );
}

function NoEmailPanel({ ev }: { ev: Extract<EmailTemplateEventView, { sendsEmail: false }> }) {
  return (
    <section className="space-y-4 rounded-[var(--radius-card)] border-2 border-dashed border-ink/40 bg-surface p-5">
      <EventHeader ev={ev} />
      <div className="flex items-start gap-3 rounded-md bg-surface-muted p-4 text-sm text-medium">
        <MailX size={18} className="mt-0.5 shrink-0 text-soft" aria-hidden />
        <p>{ev.reason}</p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------
type Field = "subject" | "body";

function TemplateEditor({
  ev,
  canEdit,
  onDirtyChange,
}: {
  ev: Extract<EmailTemplateEventView, { sendsEmail: true }>;
  canEdit: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const reduce = useReducedMotion();
  const initial = {
    subject: ev.custom?.subject ?? ev.defaultSubject,
    body: ev.custom?.body ?? ev.defaultBody,
    active: ev.custom?.active ?? true,
  };
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [active, setActive] = useState(initial.active);
  const [preview, setPreview] = useState<{
    subject: string;
    html: string;
    issues: Array<{ field: Field; message: string }>;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<Field>("body");

  const dirty =
    subject !== initial.subject || body !== initial.body || active !== initial.active;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  // Pré-visualização ao vivo (debounce), renderizada no servidor com dados de
  // exemplo — o mesmo renderer do envio real.
  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const r = await previewEmailTemplate({ event: ev.event as EmailTemplateDraft["event"], subject, body });
      if (cancelled) return;
      if (r.ok) {
        setPreview(r.data);
        setPreviewError(null);
      } else {
        setPreviewError(r.message);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [ev.event, subject, body]);

  function insertVariable(key: string, block: boolean) {
    const token = `{{${key}}}`;
    const target: Field = block ? "body" : lastField.current;
    if (target === "subject") {
      const el = subjectRef.current;
      const s = el?.selectionStart ?? subject.length;
      const e = el?.selectionEnd ?? subject.length;
      const next = subject.slice(0, s) + token + subject.slice(e);
      setSubject(next);
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(s + token.length, s + token.length);
      });
      return;
    }
    const el = bodyRef.current;
    const s = el?.selectionStart ?? body.length;
    const e = el?.selectionEnd ?? body.length;
    let insert = token;
    if (block) {
      // Blocos precisam ficar sozinhos na linha.
      const before = body.slice(0, s);
      const after = body.slice(e);
      insert = `${before === "" || before.endsWith("\n") ? "" : "\n\n"}${token}${
        after.startsWith("\n") ? "" : "\n\n"
      }`;
    }
    const next = body.slice(0, s) + insert + body.slice(e);
    setBody(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(s + insert.length, s + insert.length);
    });
  }

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveEmailTemplate({ event: ev.event as EmailTemplateDraft["event"], subject, body, active });
      setMsg(
        r.ok
          ? {
              ok: true,
              text: active
                ? "Template salvo. Os próximos envios usam esta versão."
                : "Template salvo como inativo — os envios seguem com o padrão.",
            }
          : { ok: false, text: r.message },
      );
    });
  }

  function restore() {
    if (!window.confirm("Restaurar o e-mail padrão? A personalização deste evento será apagada.")) {
      return;
    }
    setMsg(null);
    start(async () => {
      const r = await restoreEmailTemplateDefault({ event: ev.event });
      if (r.ok) {
        setSubject(ev.defaultSubject);
        setBody(ev.defaultBody);
        setActive(true);
        setMsg({ ok: true, text: "Padrão restaurado." });
      } else {
        setMsg({ ok: false, text: r.message });
      }
    });
  }

  function sendTest() {
    setMsg(null);
    start(async () => {
      const r = await sendEmailTemplateTest({ event: ev.event as EmailTemplateDraft["event"], subject, body });
      setMsg(
        r.ok
          ? { ok: true, text: `Teste enviado para ${r.data.to} (${r.data.provider}).` }
          : { ok: false, text: r.message },
      );
    });
  }

  const issues = preview?.issues ?? [];
  const scalarVars = ev.variables.filter((v) => !v.block);
  const blockVars = ev.variables.filter((v) => v.block);

  return (
    <div className="space-y-5">
      <section className="space-y-5 rounded-[var(--radius-card)] border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_var(--color-ink)]">
        <EventHeader ev={ev} />
        {ev.custom ? (
          <p className="text-xs text-soft">
            Última alteração em {new Date(ev.custom.updatedAt).toLocaleString("pt-BR")}
            {ev.custom.updatedByName ? ` por ${ev.custom.updatedByName}` : ""}.
          </p>
        ) : (
          <p className="text-xs text-soft">
            Sem personalização: o envio usa o e-mail padrão do sistema (o texto abaixo é o
            ponto de partida).
          </p>
        )}
      </section>

      <div className="grid gap-5 2xl:grid-cols-2">
        {/* Editor */}
        <section className="space-y-4 rounded-[var(--radius-card)] border border-border bg-surface p-5">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-soft">Assunto</span>
            <input
              ref={subjectRef}
              className={inputCls}
              value={subject}
              readOnly={!canEdit}
              maxLength={250}
              onFocus={() => (lastField.current = "subject")}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>

          <div className="space-y-2">
            <span className="text-xs font-semibold text-soft">
              Variáveis — clique para inserir no campo em foco
            </span>
            <div className="flex flex-wrap gap-1.5">
              {scalarVars.map((v) => (
                <VariableChip key={v.key} v={v} disabled={!canEdit} onInsert={insertVariable} />
              ))}
            </div>
            {blockVars.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {blockVars.map((v) => (
                  <VariableChip key={v.key} v={v} disabled={!canEdit} onInsert={insertVariable} />
                ))}
              </div>
            ) : null}
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-soft">Corpo</span>
            <textarea
              ref={bodyRef}
              className={cn(inputCls, "min-h-[360px] font-mono text-[13px] leading-relaxed")}
              value={body}
              readOnly={!canEdit}
              spellCheck
              onFocus={() => (lastField.current = "body")}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>

          <details className="rounded-md bg-surface-muted p-3 text-xs text-medium">
            <summary className="cursor-pointer font-semibold text-ink">Formatação</summary>
            <ul className="mt-2 space-y-1">
              <li><code># Título</code> na 1ª linha — título do cartão</li>
              <li><code>## Subtítulo</code> · linha em branco separa parágrafos</li>
              <li><code>**negrito**</code> · <code>- item</code> para listas · <code>---</code> divisória</li>
              <li><code>&gt; texto</code> destaque informativo · <code>&gt;! texto</code> destaque de atenção</li>
              <li><code>[Rótulo]({"{{link}}"})</code> sozinho na linha vira botão (some se não houver link)</li>
              <li>Blocos (tabelas/resumos) precisam ficar sozinhos na linha; vazios não aparecem.</li>
            </ul>
          </details>

          <AnimatePresence initial={false}>
            {issues.length > 0 ? (
              <motion.ul
                key="issues"
                role="alert"
                initial={reduce ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-1 rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger"
              >
                {issues.map((i, idx) => (
                  <li key={idx}>
                    <strong>{i.field === "subject" ? "Assunto" : "Corpo"}:</strong> {i.message}
                  </li>
                ))}
              </motion.ul>
            ) : null}
          </AnimatePresence>

          {canEdit ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                Usar este template nos envios
              </label>
              <span className="ml-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={sendTest}
                  disabled={pending || issues.length > 0}
                  title="Envia para o seu e-mail com dados de exemplo e assunto [TESTE]"
                >
                  <Send size={14} aria-hidden /> Enviar teste para mim
                </button>
                {ev.custom ? (
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={restore}
                    disabled={pending}
                  >
                    <RotateCcw size={14} aria-hidden /> Restaurar padrão
                  </button>
                ) : null}
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={save}
                  disabled={pending || issues.length > 0 || (!dirty && Boolean(ev.custom))}
                >
                  <Save size={14} aria-hidden /> Salvar
                </button>
              </span>
            </div>
          ) : (
            <p className="text-xs text-soft">Você tem acesso somente de leitura.</p>
          )}

          <AnimatePresence initial={false}>
            {msg ? (
              <motion.p
                key={msg.text}
                role="status"
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduce ? undefined : { opacity: 0 }}
                transition={{ duration: 0.15 }}
                className={cn("text-sm", msg.ok ? "text-success" : "text-danger")}
              >
                {msg.text}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </section>

        {/* Pré-visualização */}
        <section className="space-y-3 rounded-[var(--radius-card)] border border-border bg-surface p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-strong">Pré-visualização</h3>
            <span className="text-xs text-soft">dados de exemplo</span>
          </div>
          <p className="truncate rounded-md bg-surface-muted px-3 py-2 text-sm text-ink">
            <span className="text-soft">Assunto: </span>
            {preview?.subject || "—"}
          </p>
          {previewError ? <p className="text-sm text-danger">{previewError}</p> : null}
          <iframe
            title={`Pré-visualização do e-mail: ${ev.label}`}
            sandbox=""
            srcDoc={preview?.html ?? ""}
            className="h-[720px] w-full rounded-md border border-border bg-white"
          />
        </section>
      </div>
    </div>
  );
}

function VariableChip({
  v,
  disabled,
  onInsert,
}: {
  v: EmailTemplateVariableView;
  disabled: boolean;
  onInsert: (key: string, block: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // mantém o foco/cursor no campo
      onClick={() => onInsert(v.key, v.block)}
      title={`${v.label}${v.example ? ` — ex.: ${v.example}` : ""}`}
      className={cn(
        "rounded-md border px-2 py-0.5 font-mono text-xs disabled:opacity-60",
        v.block
          ? "border-brand/30 bg-brand-soft text-brand-dark"
          : "border-ink/15 bg-surface-muted text-medium hover:border-ink/40",
      )}
    >
      {`{{${v.key}}}`}
    </button>
  );
}
