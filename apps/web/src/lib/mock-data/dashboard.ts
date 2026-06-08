import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  Clock,
  FolderKanban,
  Users,
} from "lucide-react";

/**
 * Mocked dashboard data for the MVP shell.
 * NOTE: not connected to the database yet. Numbers are illustrative and exist
 * only to render the operational dashboard layout.
 */

export type Trend = "up" | "down" | "flat";

export interface DashboardKpi {
  id: string;
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  trend?: Trend;
  trendLabel?: string;
}

export const dashboardKpis: DashboardKpi[] = [
  {
    id: "pending-hours",
    label: "Horas pendentes",
    value: "186h",
    hint: "Aguardando aprovação",
    icon: Clock,
    trend: "up",
    trendLabel: "+24h na semana",
  },
  {
    id: "approved-hours",
    label: "Horas aprovadas",
    value: "1.248h",
    hint: "No mês corrente",
    icon: CheckCircle2,
    trend: "up",
    trendLabel: "+8% vs. mês anterior",
  },
  {
    id: "active-consultants",
    label: "Consultores ativos",
    value: "42",
    hint: "Com alocação vigente",
    icon: Users,
    trend: "flat",
    trendLabel: "Estável",
  },
  {
    id: "active-projects",
    label: "Projetos ativos",
    value: "17",
    hint: "Em execução",
    icon: FolderKanban,
    trend: "up",
    trendLabel: "+2 novos",
  },
];

export type PendingSeverity = "warning" | "danger" | "info";

export interface PendingItem {
  id: string;
  title: string;
  context: string;
  owner: string;
  severity: PendingSeverity;
  meta: string;
}

export const pendingItems: PendingItem[] = [
  {
    id: "p1",
    title: "12 lançamentos aguardando aprovação",
    context: "Projeto Atlas · Cliente Vix Energia",
    owner: "Carlos Nunes",
    severity: "warning",
    meta: "Semana 23",
  },
  {
    id: "p2",
    title: "Horas reprovadas sem correção",
    context: "Projeto Órion · Cliente Banco Sul",
    owner: "Marina Alves",
    severity: "danger",
    meta: "há 3 dias",
  },
  {
    id: "p3",
    title: "Período semanal não enviado",
    context: "5 consultores · Área de Dados",
    owner: "Equipe Dados",
    severity: "warning",
    meta: "Semana 23",
  },
  {
    id: "p4",
    title: "Certificados próximos do vencimento",
    context: "3 consultores · AWS / Azure",
    owner: "People",
    severity: "info",
    meta: "próximos 30 dias",
  },
];

export interface AllocationRow {
  id: string;
  consultant: string;
  role: string;
  allocation: number;
  status: "balanced" | "over" | "bench";
}

export const allocationSummary: AllocationRow[] = [
  { id: "a1", consultant: "Bruno Lima", role: "Tech Lead", allocation: 95, status: "balanced" },
  { id: "a2", consultant: "Marina Alves", role: "Data Engineer", allocation: 120, status: "over" },
  { id: "a3", consultant: "Carlos Nunes", role: "Consultor Pleno", allocation: 80, status: "balanced" },
  { id: "a4", consultant: "Júlia Reis", role: "Consultora Sênior", allocation: 0, status: "bench" },
];

export interface UpcomingClosing {
  id: string;
  client: string;
  project: string;
  period: string;
  status: "open" | "review" | "ready";
  approvedHours: string;
}

export const upcomingClosings: UpcomingClosing[] = [
  {
    id: "c1",
    client: "Vix Energia",
    project: "Atlas",
    period: "Maio/2026",
    status: "review",
    approvedHours: "320h",
  },
  {
    id: "c2",
    client: "Banco Sul",
    project: "Órion",
    period: "Maio/2026",
    status: "open",
    approvedHours: "208h",
  },
  {
    id: "c3",
    client: "Loja Norte",
    project: "Vega",
    period: "Maio/2026",
    status: "ready",
    approvedHours: "164h",
  },
];
