"use client";

import { motion } from "motion/react";
import { BadgeCheck, Blocks, Clock, FolderKanban, Sparkles } from "lucide-react";
import { appConfig } from "@/config/app";

const pillars = [
  {
    title: "Horas",
    description: "Lancamento semanal e aprovacao.",
    icon: Clock,
  },
  {
    title: "Alocacao",
    description: "Capacidade por projeto e periodo.",
    icon: FolderKanban,
  },
  {
    title: "Skills",
    description: "Matriz tecnica e certificados.",
    icon: BadgeCheck,
  },
];

const mvpQueue = [
  "Autenticacao e perfis",
  "Consultores, clientes e projetos",
  "Alocacao de consultores",
  "Lancamento semanal de horas",
  "Aprovacao e relatorio mensal",
];

export function HomePage() {
  return (
    <main className="min-h-screen bg-[#f6f7f2] text-[#1d2520]">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-6 sm:px-8 lg:px-10">
        <motion.header
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between border-b border-[#d9ded4] pb-5"
          initial={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-md bg-[#2563eb] text-sm font-bold text-white">
              JF
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#4b6358]">
                Jump
              </p>
              <h1 className="text-xl font-semibold">{appConfig.name}</h1>
            </div>
          </div>
          <span className="rounded-md border border-[#cbd3c4] px-3 py-2 text-sm font-medium text-[#4b6358]">
            MVP
          </span>
        </motion.header>

        <div className="grid flex-1 gap-8 py-10 lg:grid-cols-[1fr_420px] lg:items-center">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl"
            initial={{ opacity: 0, y: 12 }}
            transition={{ delay: 0.08, duration: 0.4, ease: "easeOut" }}
          >
            <p className="mb-4 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[#2563eb]">
              <Sparkles aria-hidden="true" className="size-4" />
              Plataforma operacional dos consultores
            </p>
            <h2 className="text-4xl font-semibold leading-tight text-[#111814] sm:text-5xl">
              Horas, alocacoes, skills e aprovacoes em um fluxo unico.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4b6358]">
              O {appConfig.name} nasce para dar velocidade ao apontamento de
              horas e visibilidade para gestores, People, comercial e
              financeiro acompanharem capacidade, projetos e rentabilidade.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {pillars.map(({ title, description, icon: Icon }, index) => (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-md border border-[#d9ded4] bg-white p-4"
                  initial={{ opacity: 0, y: 10 }}
                  key={title}
                  transition={{
                    delay: 0.16 + index * 0.06,
                    duration: 0.35,
                    ease: "easeOut",
                  }}
                >
                  <Icon aria-hidden="true" className="mb-4 size-5 text-[#2563eb]" />
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#5f7168]">
                    {description}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.aside
            animate={{ opacity: 1, x: 0 }}
            className="rounded-md border border-[#d9ded4] bg-white p-5 shadow-sm"
            initial={{ opacity: 0, x: 14 }}
            transition={{ delay: 0.18, duration: 0.4, ease: "easeOut" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="inline-flex items-center gap-2 font-semibold">
                <Blocks aria-hidden="true" className="size-5 text-[#2563eb]" />
                Fila do MVP
              </h3>
              <span className="text-sm text-[#5f7168]">Fundacao</span>
            </div>
            <div className="mt-5 space-y-3">
              {mvpQueue.map((item, index) => (
                <div
                  className="flex items-center gap-3 rounded-md bg-[#f6f7f2] px-3 py-3 text-sm"
                  key={item}
                >
                  <span className="grid size-7 place-items-center rounded-md bg-[#dbeafe] font-semibold text-[#1d4ed8]">
                    {index + 1}
                  </span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </motion.aside>
        </div>
      </section>
    </main>
  );
}

