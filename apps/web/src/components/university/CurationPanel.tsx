"use client";

import { useState, useTransition } from "react";
import {
  BookOpen,
  Layers,
  Pencil,
  Plus,
  Power,
  PowerOff,
} from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { FeedbackTone } from "@/components/ui/Feedback";
import {
  setCourseStatus,
  setTrackStatus,
} from "@/app/app/universidade/actions";
import {
  learningStatusLabels,
  type CourseView,
  type TrackOption,
  type TrackView,
} from "@/lib/university/types";
import { TrackFormModal } from "./TrackFormModal";
import { CourseFormModal } from "./CourseFormModal";

export interface CurationPanelProps {
  tracks: TrackView[];
  courses: CourseView[];
  trackOptions: TrackOption[];
  skillOptions: { id: string; name: string }[];
  notify: (tone: FeedbackTone, text: string) => void;
}

export function CurationPanel({
  tracks,
  courses,
  trackOptions,
  skillOptions,
  notify,
}: CurationPanelProps) {
  const [pending, startTransition] = useTransition();
  const [trackForm, setTrackForm] = useState<{ track: TrackView | null } | null>(
    null,
  );
  const [courseForm, setCourseForm] = useState<{
    course: CourseView | null;
  } | null>(null);

  function toggleTrack(track: TrackView) {
    const status = track.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    startTransition(async () => {
      const result = await setTrackStatus({ id: track.id, status });
      if (result.ok) {
        notify("success", status === "ACTIVE" ? "Trilha reativada." : "Trilha inativada.");
      } else {
        notify("warning", result.message);
      }
    });
  }

  function toggleCourse(course: CourseView) {
    const status = course.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    startTransition(async () => {
      const result = await setCourseStatus({ id: course.id, status });
      if (result.ok) {
        notify("success", status === "ACTIVE" ? "Curso reativado." : "Curso inativado.");
      } else {
        notify("warning", result.message);
      }
    });
  }

  return (
    <div className="space-y-5">
      <SectionPanel
        title="Trilhas"
        description="Agrupam cursos por tema. Inative (soft delete) em vez de excluir."
        action={
          <ActionButton
            icon={Plus}
            size="sm"
            onClick={() => setTrackForm({ track: null })}
          >
            Nova trilha
          </ActionButton>
        }
      >
        {tracks.length === 0 ? (
          <div className="px-5 py-10">
            <EmptyState
              icon={Layers}
              title="Nenhuma trilha ainda"
              description="Crie a primeira trilha para organizar os cursos."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {tracks.map((track) => (
              <li
                key={track.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-strong">
                      {track.title}
                    </span>
                    <StatusBadge
                      tone={track.status === "ACTIVE" ? "success" : "neutral"}
                    >
                      {learningStatusLabels[track.status]}
                    </StatusBadge>
                    {track.category ? (
                      <StatusBadge tone="neutral">{track.category}</StatusBadge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-soft">
                    {track.activeCourseCount} curso(s) ativo(s) de{" "}
                    {track.totalCourseCount}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label="Editar trilha"
                    onClick={() => setTrackForm({ track })}
                    className="grid size-8 place-items-center rounded-md text-medium hover:bg-surface hover:text-strong"
                  >
                    <Pencil aria-hidden className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={
                      track.status === "ACTIVE"
                        ? "Inativar trilha"
                        : "Reativar trilha"
                    }
                    disabled={pending}
                    onClick={() => toggleTrack(track)}
                    className="grid size-8 place-items-center rounded-md text-medium hover:bg-surface hover:text-strong disabled:opacity-50"
                  >
                    {track.status === "ACTIVE" ? (
                      <PowerOff aria-hidden className="size-4" />
                    ) : (
                      <Power aria-hidden className="size-4" />
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionPanel>

      <SectionPanel
        title="Cursos"
        description="Vínculo opcional a trilha e a uma competência do catálogo."
        action={
          <ActionButton
            icon={Plus}
            size="sm"
            onClick={() => setCourseForm({ course: null })}
          >
            Novo curso
          </ActionButton>
        }
      >
        {courses.length === 0 ? (
          <div className="px-5 py-10">
            <EmptyState
              icon={BookOpen}
              title="Nenhum curso ainda"
              description="Crie o primeiro curso e, se quiser, vincule-o a uma trilha e a uma competência."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {courses.map((course) => (
              <li
                key={course.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-strong">
                      {course.title}
                    </span>
                    <StatusBadge
                      tone={course.status === "ACTIVE" ? "success" : "neutral"}
                    >
                      {learningStatusLabels[course.status]}
                    </StatusBadge>
                    {course.trackTitle ? (
                      <StatusBadge tone="neutral">{course.trackTitle}</StatusBadge>
                    ) : null}
                    {course.skillName ? (
                      <StatusBadge tone="info">{course.skillName}</StatusBadge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-soft">
                    {course.provider ? `${course.provider} · ` : ""}
                    {course.hours !== null ? `${course.hours}h · ` : ""}
                    {course.enrollmentCount} matrícula(s)
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label="Editar curso"
                    onClick={() => setCourseForm({ course })}
                    className="grid size-8 place-items-center rounded-md text-medium hover:bg-surface hover:text-strong"
                  >
                    <Pencil aria-hidden className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={
                      course.status === "ACTIVE"
                        ? "Inativar curso"
                        : "Reativar curso"
                    }
                    disabled={pending}
                    onClick={() => toggleCourse(course)}
                    className="grid size-8 place-items-center rounded-md text-medium hover:bg-surface hover:text-strong disabled:opacity-50"
                  >
                    {course.status === "ACTIVE" ? (
                      <PowerOff aria-hidden className="size-4" />
                    ) : (
                      <Power aria-hidden className="size-4" />
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionPanel>

      {trackForm ? (
        <TrackFormModal
          key={trackForm.track?.id ?? "new"}
          open={trackForm !== null}
          track={trackForm.track}
          onClose={() => setTrackForm(null)}
          notify={notify}
        />
      ) : null}

      {courseForm ? (
        <CourseFormModal
          key={courseForm.course?.id ?? "new"}
          open={courseForm !== null}
          course={courseForm.course}
          trackOptions={trackOptions}
          skillOptions={skillOptions}
          onClose={() => setCourseForm(null)}
          notify={notify}
        />
      ) : null}
    </div>
  );
}
