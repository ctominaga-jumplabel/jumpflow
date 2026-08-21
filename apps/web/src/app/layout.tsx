import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { appConfig } from "@/config/app";
import { THEME_COOKIE, type Theme } from "@/lib/theme";
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
