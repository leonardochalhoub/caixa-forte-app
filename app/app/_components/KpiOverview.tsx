import { formatBRL } from "@/lib/money"
import type { MonthlyTotals } from "@/lib/analytics/periods"
import { aggregatePeriod, project } from "@/lib/analytics/projection"
import { HeroBalance } from "./HeroBalance"
import { PeriodCard } from "./PeriodCard"
import type { BreakdownAccount } from "./BreakdownPanel"

export type { BreakdownAccount } from "./BreakdownPanel"

export interface KpiOverviewProps {
  last12: MonthlyTotals[]
  totalBalanceCents: number
  liquidCents: number
  savingsCents: number
  investmentCents: number
  cryptoCents: number
  fgtsCents: number
  creditCents: number
  liquidAccounts: BreakdownAccount[]
  savingsAccounts: BreakdownAccount[]
  investmentAccounts: BreakdownAccount[]
  cryptoAccounts: BreakdownAccount[]
  fgtsAccounts: BreakdownAccount[]
  creditAccounts: BreakdownAccount[]
  // Optional right-rail content that sits beside "Saldo total agora".
  heroAside?: React.ReactNode
  // Short AI-generated sentences explaining each time-window's verdict.
  trendExplanations?: {
    current: string
    last6: string
    last12: string
  }
}

export function KpiOverview({
  last12,
  totalBalanceCents,
  liquidCents,
  savingsCents,
  investmentCents,
  cryptoCents,
  fgtsCents,
  creditCents,
  liquidAccounts,
  savingsAccounts,
  investmentAccounts,
  cryptoAccounts,
  fgtsAccounts,
  creditAccounts,
  heroAside,
  trendExplanations,
}: KpiOverviewProps) {
  const current = last12[last12.length - 1]!
  const previous = last12[last12.length - 2]
  const thisMonthDelta =
    previous && previous.netCents !== 0
      ? (current.netCents - previous.netCents) / Math.abs(previous.netCents)
      : null

  const last6 = aggregatePeriod(last12.slice(-6))
  const last12Agg = aggregatePeriod(last12)
  const proj6 = project(last12.slice(-6), 6)
  const proj12 = project(last12.slice(-6), 12)

  return (
    <div className="space-y-4">
      <HeroBalance
        totalBalanceCents={totalBalanceCents}
        liquidCents={liquidCents}
        savingsCents={savingsCents}
        investmentCents={investmentCents}
        cryptoCents={cryptoCents}
        fgtsCents={fgtsCents}
        creditCents={creditCents}
        liquidAccounts={liquidAccounts}
        savingsAccounts={savingsAccounts}
        investmentAccounts={investmentAccounts}
        cryptoAccounts={cryptoAccounts}
        fgtsAccounts={fgtsAccounts}
        creditAccounts={creditAccounts}
        monthLabel={current.label}
        monthNetCents={current.netCents}
        incomeCents={current.incomeCents}
        expenseCents={current.expenseCents}
        aside={heroAside}
        currentWhy={trendExplanations?.current}
        deltaPct={thisMonthDelta}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <PeriodCard
          label="Últimos 6 meses"
          incomeCents={last6.incomeCents}
          expenseCents={last6.expenseCents}
          netCents={last6.netCents}
          subtitle={`média ${formatBRL(last6.avgMonthlyNet)}/mês`}
          why={trendExplanations?.last6}
        />
        <PeriodCard
          label="Últimos 12 meses"
          incomeCents={last12Agg.incomeCents}
          expenseCents={last12Agg.expenseCents}
          netCents={last12Agg.netCents}
          subtitle={`média ${formatBRL(last12Agg.avgMonthlyNet)}/mês`}
          why={trendExplanations?.last12}
        />
        <PeriodCard
          label="Projeção · 6 meses"
          incomeCents={proj6.incomeCents}
          expenseCents={proj6.expenseCents}
          netCents={proj6.netCents}
          subtitle={proj6.monthsUsed === 0 ? "sem dados" : `base ${proj6.monthsUsed}m histórico`}
          isProjection
        />
        <PeriodCard
          label="Projeção · 12 meses"
          incomeCents={proj12.incomeCents}
          expenseCents={proj12.expenseCents}
          netCents={proj12.netCents}
          subtitle={proj12.monthsUsed === 0 ? "sem dados" : `base ${proj12.monthsUsed}m histórico`}
          isProjection
        />
      </div>
    </div>
  )
}
