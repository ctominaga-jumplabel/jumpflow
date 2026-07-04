import {
  Award,
  Briefcase,
  GraduationCap,
  Languages,
  Sparkles,
  Star,
} from "lucide-react";
import type { ConsultantCurriculum } from "@/lib/consultants/curriculum";

interface SubSectionProps {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  children: React.ReactNode;
}

/** Cabecalho de subsecao do curriculo (icone + titulo). */
export function CurriculumSubSection({ icon: Icon, title, children }: SubSectionProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-medium">
        <Icon aria-hidden className="size-3.5" />
        {title}
      </div>
      {children}
    </div>
  );
}

/**
 * Apresentacao PURA e read-only do curriculo derivado (EP-M06). Nao contem
 * nenhuma acao nem I/O: recebe o agregado ja montado e desenha as secoes.
 * Reutilizada tanto pela ferramenta de RH (`ConsultantCurriculumSection`)
 * quanto pela aba "Meu Curriculo" do proprio consultor. Trata secoes vazias
 * com elegancia (omite subsecoes sem itens). ZERO campos financeiros — o
 * agregador ja garante isso por construcao.
 */
export function ConsultantCurriculumView({ cv }: { cv: ConsultantCurriculum }) {
  const hasAnyContent =
    cv.highlights.length > 0 ||
    cv.education.length > 0 ||
    cv.languages.length > 0 ||
    cv.skills.length > 0 ||
    cv.certificates.length > 0 ||
    cv.projects.length > 0 ||
    Boolean(cv.identity.headline) ||
    Boolean(cv.identity.summary);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-surface-muted p-3">
        <p className="text-base font-semibold text-strong">{cv.identity.name}</p>
        <p className="text-sm text-medium">
          {[cv.identity.jobTitle, cv.identity.seniority, cv.identity.area]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {cv.identity.headline ? (
          <p className="mt-2 text-sm font-medium text-strong">
            {cv.identity.headline}
          </p>
        ) : null}
        {cv.identity.summary ? (
          <p className="mt-1 whitespace-pre-line text-sm text-medium">
            {cv.identity.summary}
          </p>
        ) : null}
      </div>

      {cv.highlights.length > 0 ? (
        <CurriculumSubSection icon={Star} title="Destaques">
          <ul className="space-y-0.5 text-sm text-strong">
            {cv.highlights.map((item) => (
              <li key={item.label}>
                <span className="text-medium">{item.label}:</span> {item.value}
              </li>
            ))}
          </ul>
        </CurriculumSubSection>
      ) : null}

      {cv.education.length > 0 ? (
        <CurriculumSubSection icon={GraduationCap} title="Formacao">
          <ul className="space-y-0.5 text-sm text-strong">
            {cv.education.map((entry, index) => (
              <li key={`${entry.institution}-${index}`}>
                {entry.course}, {entry.degree} — {entry.institution}
                {entry.period ? ` (${entry.period})` : ""}
                {entry.completed ? "" : " — em andamento"}
              </li>
            ))}
          </ul>
        </CurriculumSubSection>
      ) : null}

      {cv.languages.length > 0 ? (
        <CurriculumSubSection icon={Languages} title="Idiomas">
          <ul className="space-y-0.5 text-sm text-strong">
            {cv.languages.map((entry) => (
              <li key={entry.name}>
                {entry.name} — {entry.level}
              </li>
            ))}
          </ul>
        </CurriculumSubSection>
      ) : null}

      {cv.skills.length > 0 ? (
        <CurriculumSubSection icon={Sparkles} title="Competencias validadas">
          <ul className="space-y-0.5 text-sm text-strong">
            {cv.skills.map((entry) => (
              <li key={entry.name}>
                {entry.name}
                {entry.category ? ` (${entry.category})` : ""} — {entry.level}
                {entry.yearsExperience != null
                  ? ` — ${entry.yearsExperience} ano(s)`
                  : ""}
              </li>
            ))}
          </ul>
        </CurriculumSubSection>
      ) : null}

      {cv.certificates.length > 0 ? (
        <CurriculumSubSection icon={Award} title="Certificados">
          <ul className="space-y-0.5 text-sm text-strong">
            {cv.certificates.map((entry, index) => (
              <li key={`${entry.name}-${index}`}>
                {entry.name} — {entry.issuer}, {entry.issuedAt}
                {entry.expiresAt ? ` (valido ate ${entry.expiresAt})` : ""}
              </li>
            ))}
          </ul>
        </CurriculumSubSection>
      ) : null}

      {cv.projects.length > 0 ? (
        <CurriculumSubSection icon={Briefcase} title="Historico de projetos">
          <ul className="space-y-0.5 text-sm text-strong">
            {cv.projects.map((entry, index) => (
              <li key={`${entry.projectName}-${index}`}>
                {entry.projectName}
                {entry.clientName ? ` — ${entry.clientName}` : ""} — {entry.role}{" "}
                ({entry.period})
              </li>
            ))}
          </ul>
        </CurriculumSubSection>
      ) : null}

      {!hasAnyContent ? (
        <p className="text-sm text-medium">
          Seu curriculo ainda nao tem formacao, idiomas, competencias validadas,
          certificados ou historico de projetos. Conforme seus dados forem
          cadastrados e validados, eles aparecem aqui automaticamente.
        </p>
      ) : null}
    </div>
  );
}
