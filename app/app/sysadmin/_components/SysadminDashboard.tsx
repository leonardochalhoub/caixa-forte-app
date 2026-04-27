"use client"

import type { Kpi, LoginEvent, UserRow } from "@/lib/sysadmin/types"
import type { UserPin } from "./BrazilMap"
import { ActivitySection } from "./tabs/ActivitySection"
import { DemoSection } from "./tabs/DemoSection"
import { GeoSection } from "./tabs/GeoSection"
import { KpiOverviewSection, TrendsSection } from "./tabs/KpiOverviewSection"
import { RanksSection } from "./tabs/RanksSection"
import { UsersSection } from "./tabs/UsersSection"

interface Props {
  rows: UserRow[]
  recentEvents: LoginEvent[]
  kpi: Kpi
  trend: Array<{ month: string; net: number; income: number; expense: number }>
  ufCounts: Array<{ uf: string; count: number }>
  userPins: UserPin[]
  topBanks: Array<{ bank: string; count: number; totalCents: number }>
  topCategories: Array<{ name: string; amountCents: number }>
  topSubcategories: Array<{ label: string; amountCents: number; parent: string }>
  currentUserIsOwner: boolean
}

export function SysadminDashboard({
  rows,
  recentEvents,
  kpi,
  trend,
  ufCounts,
  userPins,
  topBanks,
  topCategories,
  topSubcategories,
  currentUserIsOwner,
}: Props) {
  void trend

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-strong">Painel do Sysadmin</h1>
        <p className="text-sm text-muted">
          Métricas agregadas do Caixa Forte. Por privacidade, nunca exibimos saldo ou
          transações individuais aqui — apenas agregados e dados de acesso.
        </p>
      </header>

      <KpiOverviewSection kpi={kpi} ufCounts={ufCounts} userPins={userPins} />

      <DemoSection />

      <TrendsSection kpi={kpi} />

      <GeoSection userPins={userPins} ufCounts={ufCounts} />

      <RanksSection
        topBanks={topBanks}
        topCategories={topCategories}
        topSubcategories={topSubcategories}
      />

      <UsersSection rows={rows} currentUserIsOwner={currentUserIsOwner} />

      <ActivitySection rows={rows} recentEvents={recentEvents} />
    </div>
  )
}
