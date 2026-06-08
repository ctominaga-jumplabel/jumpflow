"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, BadgeCheck, Clock, FolderKanban } from "lucide-react";
import { appConfig } from "@/config/app";

const pillars = [
  {
    title: "Horas",
    description: "Lançamento semanal e aprovação.",
    icon: Clock,
  },
  {
    title: "Alocação",
    description: "Capacidade por projeto e período.",
    icon: FolderKanban,
  },
  {
    title: "Skills",
    description: "Matriz técnica e certificados.",
    icon: BadgeCheck,
  },
];

export function HomePage() {
  const reduce = useReducedMotion();

  return (
    <main className="min-h-screen bg-canvas text-strong">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-12 sm:px-8">
        <motion.header
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
          initial={reduce ? false : { opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-md bg-brand text-sm font-bold text-white">
              {appConfig.monogram}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-soft">
                Jump
              </p>
              <h1 className="text-lg font-semibold">{appConfig.name}</h1>
            </div>
          </div>
          <span className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-medium">
            Ambiente MVP
          </span>
        </motion.header>

        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="mt-16 max-w-2xl"
          initial={reduce ? false : { opacity: 0, y: 12 }}
          transition={{ delay: 0.08, duration: 0.4, ease: "easeOut" }}
        >
          <h2 className="text-4xl font-semibold leading-tight text-strong sm:text-5xl">
            Horas, alocações, skills e aprovações em um fluxo único.
          </h2>
          <p className="mt-5 text-lg leading-8 text-medium">
            O {appConfig.name} é a plataforma operacional dos consultores da
            Jump: velocidade no apontamento de horas e visibilidade de
            capacidade, projetos e rentabilidade.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/app/dashboard"
              className="inline-flex items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white outline-none transition-colors hover:bg-brand-dark focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              Acessar plataforma
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <span className="text-sm text-soft">
              Demonstração com dados mockados.
            </span>
          </div>

          <div className="mt-12 grid gap-3 sm:grid-cols-3">
            {pillars.map(({ title, description, icon: Icon }, index) => (
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="rounded-md border border-border bg-surface p-4"
                initial={reduce ? false : { opacity: 0, y: 10 }}
                key={title}
                transition={{
                  delay: 0.16 + index * 0.04,
                  duration: 0.3,
                  ease: "easeOut",
                }}
              >
                <Icon aria-hidden="true" className="mb-3 size-5 text-brand" />
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-medium">
                  {description}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>
    </main>
  );
}
