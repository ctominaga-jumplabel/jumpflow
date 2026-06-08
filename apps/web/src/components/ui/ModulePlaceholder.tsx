import type { LucideIcon } from "lucide-react";
import { Rocket } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { EmptyState } from "./EmptyState";
import { StatusBadge } from "./StatusBadge";

export interface ModulePlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  /** Operational next steps for this module. */
  steps: string[];
}

/**
 * Premium placeholder for MVP modules that are not implemented yet.
 * Keeps every module visually consistent with the design system.
 */
export function ModulePlaceholder({
  title,
  description,
  icon,
  steps,
}: ModulePlaceholderProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Módulo"
        title={title}
        description={description}
        actions={<StatusBadge tone="info">Em breve</StatusBadge>}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <EmptyState
          icon={icon}
          title="Módulo em construção"
          description="Esta área faz parte do MVP e ainda não tem dados nem ações disponíveis. A estrutura visual já segue o design system do JumpFlow."
        />

        <section className="rounded-[var(--radius-card)] border border-border bg-surface">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <Rocket aria-hidden="true" className="size-4 text-brand" />
            <h2 className="text-sm font-semibold text-strong">
              Próximos passos
            </h2>
          </div>
          <ol className="space-y-3 px-5 py-4">
            {steps.map((step, index) => (
              <li key={step} className="flex items-start gap-3 text-sm">
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-brand-soft text-xs font-semibold text-brand-dark">
                  {index + 1}
                </span>
                <span className="leading-6 text-medium">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
