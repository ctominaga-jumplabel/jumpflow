"use client";

import { MetricCard } from "@/components/ui/MetricCard";
import { dashboardKpis } from "@/lib/mock-data/dashboard";

/**
 * KPI grid for the dashboard. Client component so the icon components in the
 * mock data never cross the server/client serialization boundary.
 */
export function KpiGrid() {
  return (
    <section
      aria-label="Indicadores"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {dashboardKpis.map((kpi, index) => (
        <MetricCard
          key={kpi.id}
          label={kpi.label}
          value={kpi.value}
          hint={kpi.hint}
          icon={kpi.icon}
          trend={kpi.trend}
          trendLabel={kpi.trendLabel}
          index={index}
        />
      ))}
    </section>
  );
}
