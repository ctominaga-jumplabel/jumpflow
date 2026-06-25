"use client";

import { useState, useTransition } from "react";
import { sendTestEmail, type SendTestResult } from "./actions";

interface PreviewItem {
  key: string;
  label: string;
  subject: string;
  html: string;
}

export function EmailPreview({
  previews,
  defaultRecipient,
  provider,
}: {
  previews: PreviewItem[];
  defaultRecipient: string;
  provider: string;
}) {
  const [activeKey, setActiveKey] = useState(previews[0]?.key ?? "");
  const [recipient, setRecipient] = useState(defaultRecipient);
  const [result, setResult] = useState<SendTestResult | null>(null);
  const [pending, startTransition] = useTransition();

  const active = previews.find((p) => p.key === activeKey) ?? previews[0];

  function handleSend() {
    setResult(null);
    startTransition(async () => {
      const r = await sendTestEmail(activeKey, recipient);
      setResult(r);
    });
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-4">
        <h1 className="text-xl font-bold text-ink">Preview de e-mails</h1>
        <p className="text-sm text-[#6d756f]">
          Provider atual:{" "}
          <code className="rounded bg-[#eceff3] px-1.5 py-0.5">{provider}</code>
          {provider === "console" && (
            <span> — envios caem no log do servidor (não chegam à caixa).</span>
          )}
        </p>
      </header>

      <div className="grid grid-cols-[220px_1fr] gap-4">
        <nav className="flex flex-col gap-1">
          {previews.map((p) => (
            <button
              key={p.key}
              onClick={() => setActiveKey(p.key)}
              className={`rounded-md px-3 py-2 text-left text-sm ${
                p.key === activeKey
                  ? "bg-[#2457ff] font-semibold text-white"
                  : "bg-white text-ink hover:bg-[#eceff3]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </nav>

        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="seu-email@dominio"
              className="min-w-[260px] rounded-md border border-[#d7d8cf] px-3 py-2 text-sm"
            />
            <button
              onClick={handleSend}
              disabled={pending}
              className="rounded-md border-2 border-ink bg-[#2457ff] px-4 py-2 text-sm font-bold text-white shadow-[3px_3px_0_#111814] disabled:opacity-60"
            >
              {pending ? "Enviando…" : "Enviar teste para mim"}
            </button>
            {result && (
              <span
                className={`text-sm font-medium ${
                  result.ok ? "text-[#166534]" : "text-[#b91c1c]"
                }`}
              >
                {result.ok
                  ? `Enviado via ${result.provider} (id: ${result.messageId || "—"})`
                  : `Falha: ${result.error}`}
              </span>
            )}
          </div>

          {active && (
            <>
              <p className="mb-2 text-sm text-[#42524a]">
                <strong>Assunto:</strong> {active.subject}
              </p>
              <iframe
                title={active.label}
                srcDoc={active.html}
                className="h-[640px] w-full rounded-md border border-[#d7d8cf] bg-white"
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
