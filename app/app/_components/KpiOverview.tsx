import {
  ArrowDown,
  ArrowUp,
  Banknote,
  Bitcoin,
  CreditCard,
  Landmark,
  LineChart,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react"
import type { ReactNode } from "react"
import { formatBRL } from "@/lib/money"
import type { MonthlyTotals } from "@/lib/analytics/periods"
import { aggregatePeriod, project } from "@/lib/analytics/projection"
import { shortBankName, splitBankAndSub } from "@/lib/bank-taxonomy"
import { BankLogoImg } from "./BankLogoImg"

export interface BreakdownAccount {
  id: string
  name: string
  balanceCents: number
}

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

function HeroBalance({
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
  monthLabel,
  monthNetCents,
  incomeCents,
  expenseCents,
  deltaPct,
  aside,
  currentWhy,
}: {
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
  monthLabel: string
  monthNetCents: number
  incomeCents: number
  expenseCents: number
  deltaPct: number | null
  aside?: React.ReactNode
  currentWhy?: string
}) {
  const totalNeg = totalBalanceCents < 0
  const monthNeg = monthNetCents < 0
  const pct = deltaPct != null ? Math.round(deltaPct * 100) : null
  const DeltaIcon = pct == null ? null : pct >= 0 ? TrendingUp : TrendingDown
  const deltaColor = pct == null ? "" : pct >= 0 ? "text-income" : "text-expense"

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-subtle via-base to-base p-8">
      <div className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(circle_at_top_right,var(--color-border),transparent_60%)]" />
      <div className="relative space-y-6">
        <div className="grid gap-6 text-center md:grid-cols-3">
          <div className="flex flex-col items-center space-y-2">
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted">
              Saldo do mês · {monthLabel}
            </p>
            <p
              className={`font-mono text-3xl font-semibold tabular-nums tracking-tight md:text-4xl ${
                monthNeg ? "text-expense" : "text-strong"
              }`}
            >
              {formatBRL(monthNetCents)}
            </p>
            {pct != null && DeltaIcon && (
              <p className={`flex items-center gap-1.5 text-xs font-medium ${deltaColor}`}>
                <DeltaIcon className="h-3.5 w-3.5" />
                {pct > 0 ? "+" : ""}
                {pct}% vs mês anterior
              </p>
            )}
            {currentWhy && (
              <p className="max-w-xs text-center text-xs leading-snug text-muted">
                {currentWhy}
              </p>
            )}
          </div>

          <div className="flex flex-col items-center">
            <p className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-[0.22em] text-muted">
              <ArrowUp className="h-3 w-3 text-income" />
              Entrada do mês
            </p>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-strong md:text-3xl">
              {formatBRL(incomeCents)}
            </p>
          </div>

          <div className="flex flex-col items-center">
            <p className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-[0.22em] text-muted">
              <ArrowDown className="h-3 w-3 text-expense" />
              Saída do mês
            </p>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-strong md:text-3xl">
              {formatBRL(expenseCents)}
            </p>
          </div>
        </div>

        <div className="h-px bg-border" />

        <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-canvas">
              <Wallet className="h-5 w-5 text-strong" />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted">
                Saldo total agora
              </p>
              <p
                className={`font-mono text-4xl font-semibold tabular-nums tracking-tight md:text-5xl ${
                  totalNeg ? "text-expense" : "text-ink"
                }`}
              >
                {formatBRL(totalBalanceCents)}
              </p>
            </div>
          </div>
          {aside && <div className="min-w-0">{aside}</div>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <BreakdownPanel
            icon={<Banknote className="h-3 w-3" />}
            title="Conta Corrente"
            accounts={liquidAccounts}
            totalCents={liquidCents}
            emptyHint="Adicione uma conta corrente"
          />
          <BreakdownPanel
            icon={<Landmark className="h-3 w-3" />}
            title="Renda Fixa"
            accounts={savingsAccounts}
            totalCents={savingsCents}
            emptyHint="Cofrinhos, CDB, Tesouro"
          />
          <BreakdownPanel
            icon={<LineChart className="h-3 w-3" />}
            title="Renda Variável"
            accounts={investmentAccounts}
            totalCents={investmentCents}
            emptyHint="Ações, FII, ETF"
            dashed
          />
          <BreakdownPanel
            icon={<Bitcoin className="h-3 w-3" />}
            title="Cripto"
            accounts={cryptoAccounts}
            totalCents={cryptoCents}
            emptyHint="Bitcoin, ETH, outras"
            dashed
          />
          <BreakdownPanel
            icon={<CreditCard className="h-3 w-3" />}
            title="Cartão de Crédito"
            accounts={creditAccounts}
            totalCents={creditCents}
            emptyHint="Ainda sem cartões"
            dashed
            sortByDebt
            footnote={
              creditCents < 0
                ? "dívida aberta — não entra no saldo total"
                : "não entra no saldo total"
            }
          />
          <BreakdownPanel
            icon={<PiggyBank className="h-3 w-3" />}
            title="FGTS"
            accounts={fgtsAccounts}
            totalCents={fgtsCents}
            emptyHint=""
            dashed
            footnote="não entra no saldo total"
          />
        </div>

      </div>
    </div>
  )
}

function BreakdownPanel({
  icon,
  title,
  accounts,
  totalCents,
  emptyHint,
  dashed,
  footnote,
  sortByDebt,
}: {
  icon: ReactNode
  title: string
  accounts: BreakdownAccount[]
  totalCents: number
  emptyHint: string
  dashed?: boolean
  footnote?: string
  // true = ordena do mais negativo pro menos (maior dívida primeiro).
  // Usado pelo painel de cartão.
  sortByDebt?: boolean
}) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border ${dashed ? "border-dashed" : ""} border-border bg-canvas/50 p-3`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-muted">
        {icon}
        {title}
      </div>
      <p className="font-mono text-xl font-semibold tabular-nums tracking-tight text-strong">
        {formatBRL(totalCents)}
      </p>
      {footnote && <p className="text-[10px] italic text-muted">{footnote}</p>}
      {accounts.length === 0 ? (
        <p className="text-[11px] leading-snug text-muted">{emptyHint}</p>
      ) : (
        <ul className="space-y-1">
          {[...accounts]
            .sort((a, b) =>
              sortByDebt
                ? a.balanceCents - b.balanceCents
                : b.balanceCents - a.balanceCents,
            )
            .map((acc) => {
              const { bank } = splitBankAndSub(acc.name)
              const label = shortBankName(bank)
              return (
                <li
                  key={acc.id}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-body">
                    <BankLogoImg name={bank} />
                    <span className="truncate" title={bank}>
                      {label}
                    </span>
                  </span>
                  <span className="font-mono tabular-nums text-body">
                    {formatBRL(acc.balanceCents)}
                  </span>
                </li>
              )
            })}
        </ul>
      )}
    </div>
  )
}

function PeriodCard({
  label,
  incomeCents,
  expenseCents,
  netCents,
  subtitle,
  isProjection,
  why,
}: {
  label: string
  incomeCents: number
  expenseCents: number
  netCents: number
  subtitle: string
  isProjection?: boolean
  why?: string
}) {
  const netColor = netCents < 0 ? "text-expense" : "text-ink"

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border bg-canvas p-5 transition-colors hover:border-muted ${
        isProjection ? "border-dashed" : ""
      }`}
    >
      <p className="text-[10px] uppercase tracking-[0.22em] text-muted">{label}</p>

      <div className="mt-3 space-y-2.5">
        <div className="flex items-baseline justify-between">
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted">
            <ArrowUp className="h-3 w-3 text-income" />
            Entrada
          </span>
          <span className="font-mono text-sm font-medium tabular-nums text-strong">
            {formatBRL(incomeCents)}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted">
            <ArrowDown className="h-3 w-3 text-expense" />
            Saída
          </span>
          <span className="font-mono text-sm font-medium tabular-nums text-strong">
            {formatBRL(expenseCents)}
          </span>
        </div>
        <div className="flex items-baseline justify-between border-t border-border pt-2.5">
          <span className="text-[10px] uppercase tracking-wider text-muted">Saldo</span>
          <span
            className={`font-mono text-lg font-semibold tabular-nums tracking-tight ${netColor}`}
          >
            {formatBRL(netCents)}
          </span>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted">{subtitle}</p>
      {why && (
        <p className="mt-2 text-xs leading-snug text-body">{why}</p>
      )}
    </div>
  )
}
