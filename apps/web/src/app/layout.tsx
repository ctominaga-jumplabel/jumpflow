import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { appConfig } from "@/config/app";
import { THEME_COOKIE, type Theme } from "@/lib/theme";
import { ExperienceProvider } from "@/lib/experience/ExperienceProvider";
import { ExperienceSwitcher } from "@/lib/experience/ExperienceSwitcher";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: appConfig.name,
    template: `%s · ${appConfig.name}`,
  },
  description: "Plataforma Jump para horas, consultores, skills e alocacoes.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Theme is resolved on the server from the cookie so the correct palette is
  // in the HTML on first paint — no flash, no hydration mismatch. Default is
  // light (JumpFlow's identity); dark is opt-in via the day/night toggle.
  const theme: Theme =
    (await cookies()).get(THEME_COOKIE)?.value === "dark" ? "dark" : "light";
  return (
    <html
      lang="pt-BR"
      data-theme={theme}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/*
        Jump Experience Registry (P6): o provider apenas ESCREVE variáveis CSS no
        <html> a partir de um Experience Pack publicado pelo Jump Value, e sabe
        desfazer isso. Nenhuma regra de negócio, rota ou permissão passa por ele
        — o tema original (light/dark por cookie, resolvido acima no servidor)
        continua sendo a base e volta inteiro no reset.
        O switcher é ferramenta de demonstração e nasce desligado em produção
        (NEXT_PUBLIC_EXPERIENCE_SWITCHER).
      */}
      <body className="min-h-full flex flex-col">
        <ExperienceProvider>
          {children}
          <ExperienceSwitcher />
        </ExperienceProvider>
      </body>
    </html>
  );
}
