"use client"

import { MapPin, MousePointerClick, Users, Wallet } from "lucide-react"
import { BR_STATES } from "@/lib/ibge"
import type { Kpi } from "@/lib/sysadmin/types"
import { KpiCard } from "../KpiCard"
import { TrendKpi } from "../TrendKpi"
import type { UserPin } from "../BrazilMap"

export function KpiOverviewSection({
  kpi,
  ufCounts,
  userPins,
}: {
  kpi: Kpi
  ufCounts: Array<{ uf: string; count: number }>
  userPins: UserPin[]
}) {
  return (
    <>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          label="Usuários"
          value={kpi.totalUsers.toString()}
          subtitle={`${kpi.onboardedUsers} onboarded`}
        />
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label="Patrimônio médio por usuário"
          value={kpi.formattedAvg}
          subtitle={`mediana ${kpi.formattedMedian} · inclui FGTS`}
        />
        <KpiCard
          icon={<MapPin className="h-4 w-4" />}
          label="Estados ativos"
          value={ufCounts.length.toString()}
          subtitle={`de ${BR_STATES.length}`}
        />
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          label="Pins no mapa"
          value={userPins.length.toString()}
          subtitle="usuários com cidade"
        />
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<MousePointerClick className="h-4 w-4" />}
          label="Demo · total de cliques"
          value={kpi.demoClicks.total.toString()}
          subtitle="landing → conta da Larissa"
        />
        <KpiCard
          icon={<MousePointerClick className="h-4 w-4" />}
          label="Demo · últimas 24h"
          value={kpi.demoClicks.last24h.toString()}
          subtitle="cliques no último dia"
        />
        <KpiCard
          icon={<MousePointerClick className="h-4 w-4" />}
          label="Demo · últimos 7 dias"
          value={kpi.demoClicks.last7d.toString()}
          subtitle="cliques na última semana"
        />
        <KpiCard
          icon={<MousePointerClick className="h-4 w-4" />}
          label="Demo · IPs únicos"
          value={kpi.demoClicks.uniqueIps.toString()}
          subtitle="visitantes distintos"
        />
      </section>
    </>
  )
}

export function TrendsSection({ kpi }: { kpi: Kpi }) {
  return (
    <section className="grid gap-3 md:grid-cols-3">
      <TrendKpi
        label="Tendência · mês atual"
        net={kpi.trend1m.net}
        direction={kpi.trend1m.direction}
        why={kpi.trend1m.why}
      />
      <TrendKpi
        label="Tendência · últimos 6 meses"
        net={kpi.trend6m.net}
        direction={kpi.trend6m.direction}
        why={kpi.trend6m.why}
      />
      <TrendKpi
        label="Tendência · últimos 12 meses"
        net={kpi.trend12m.net}
        direction={kpi.trend12m.direction}
        why={kpi.trend12m.why}
      />
    </section>
  )
}
