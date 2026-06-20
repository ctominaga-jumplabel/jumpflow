"use client";

import { useState, useTransition } from "react";
import {
  BookOpen,
  ExternalLink,
  GraduationCap,
  Plus,
  XCircle,
} from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import type { FeedbackTone } from "@/components/ui/Feedback";
import {
  cancelEnrollment,
  enrollInCourse,
} from "@/app/app/universidade/actions";
import {
  enrollmentStatusLabels,
  type CatalogCourseView,
  type CatalogTrackView,
  type EnrollmentStatus,
} from "@/lib/university/types";
import { ProgressBar } from "./fields";
import { EnrollmentProgressModal } from "./EnrollmentProgressModal";

const enrollmentTone: Record<EnrollmentStatus, StatusTone> = {
  ENROLLED: "neutral",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  CANCELLED: "neutral",
};

export interface CatalogPanelProps {
  tracks: CatalogTrackView[];
  standalone: CatalogTrackView | null;
  notify: (tone: FeedbackTone, text: string) => void;
}

export function CatalogPanel({ tracks, standalone, notify }: CatalogPanelProps) {
  const [pending, startTransition] = useTransition();
  const [progressFor, setProgressFor] = useState<CatalogCourseView | null>(null);

  const allTracks = standalone ? [...tracks, standalone] : tracks;

  function enroll(courseId: string) {
    startTransition(async () => {
      const result = await enrollInCourse({ courseId });
      if (result.ok) notify("success", "Matrícula realizada.");
      else notify("warning", result.message);
    });
  }

  function cancel(enrollmentId: string) {
    startTransition(async () => {
      const result = await cancelEnrollment({ enrollmentId });
      if (result.ok) notify("success", "Matrícula cancelada.");
      else notify("warning", result.message);
    });
  }

  if (allTracks.length === 0) {
    return (
      <SectionPanel
        title="Catálogo"
        description="Trilhas e cursos disponíveis para matrícula."
      >
        <div className="px-5 py-10">
          <EmptyState
            icon={BookOpen}
            title="Nenhum curso publicado ainda"
            description="Quando a curadoria publicar trilhas e cursos, eles aparecem aqui para matrícula."
          />
        </div>
      </SectionPanel>
    );
  }

  return (
    <div className="space-y-5">
      {allTracks.map((track) => (
        <SectionPanel
          key={track.id}
          title={track.title}
          description={track.description ?? undefined}
          action={
            <StatusBadge tone="neutral">
              {track.completedCourses}/{track.totalCourses} concluídos
            </StatusBadge>
          }
        >
          <div className="space-y-4 px-5 py-4">
            <ProgressBar percent={track.progressPct} label="Progresso na trilha" />
            <ul className="space-y-2">
              {track.courses.map((course) => {
                const e = course.enrollment;
                const isActive =
                  e !== null &&
                  e.status !== "CANCELLED" &&
                  e.status !== "COMPLETED";
                return (
                  <li
                    key={course.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-muted px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-strong">
                          {course.title}
                        </span>
                        {e ? (
                          <StatusBadge tone={enrollmentTone[e.status]}>
                            {enrollmentStatusLabels[e.status]}
                          </StatusBadge>
                        ) : null}
                        {course.skillName ? (
                          <StatusBadge tone="info">
                            <GraduationCap aria-hidden className="size-3" />
                            {course.skillName}
                          </StatusBadge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-soft">
                        {course.provider ? `${course.provider} · ` : ""}
                        {course.hours !== null ? `${course.hours}h` : "Carga não informada"}
                        {e && e.status !== "ENROLLED"
                          ? ` · ${e.progressPct}% concluído`
                          : ""}
                      </p>
                      {course.externalUrl ? (
                        <a
                          href={course.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-dark hover:underline"
                        >
                          <ExternalLink aria-hidden className="size-3" />
                          Acessar conteúdo
                        </a>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {e === null || e.status === "CANCELLED" ? (
                        <ActionButton
                          size="sm"
                          icon={Plus}
                          disabled={pending}
                          onClick={() => enroll(course.id)}
                        >
                          Matricular
                        </ActionButton>
                      ) : null}
                      {isActive ? (
                        <>
                          <ActionButton
                            size="sm"
                            variant="secondary"
                            onClick={() => setProgressFor(course)}
                          >
                            Progresso
                          </ActionButton>
                          <button
                            type="button"
                            aria-label="Cancelar matrícula"
                            disabled={pending}
                            onClick={() => cancel(e!.id)}
                            className="grid size-8 place-items-center rounded-md text-medium hover:bg-surface hover:text-danger disabled:opacity-50"
                          >
                            <XCircle aria-hidden className="size-4" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </SectionPanel>
      ))}

      {progressFor && progressFor.enrollment ? (
        <EnrollmentProgressModal
          key={progressFor.enrollment.id}
          open={progressFor !== null}
          course={progressFor}
          onClose={() => setProgressFor(null)}
          notify={notify}
        />
      ) : null}
    </div>
  );
}
