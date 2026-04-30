export const dynamic = "force-dynamic"
export const revalidate = 0

import Link from "next/link"
import { requireOnboardedUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import type { AccountType } from "@/lib/types"
import { lastNMonthSlots } from "@/lib/analytics/periods"
import { UF_CENTROIDS } from "@/lib/ibge"
import { explainTrends } from "@/lib/ai/trend-explainer"
import { Card, CardContent } from "@/components/ui/card"
import { ClockWeather } from "./_components/ClockWeather"
import { KpiOverview } from "./_components/KpiOverview"
import { PendingCaptures } from "./_components/PendingCaptures"
import { QuickCapture } from "./_components/QuickCapture"
import { RecentTransactions } from "./_components/RecentTransactions"
import { UpcomingList } from "./_components/UpcomingList"
import { UpcomingInvoices } from "./_components/UpcomingInvoices"
// Recharts via lazy boundary — economiza ~95KB no JS inicial do /app.
// (Conselho v4 vercel-perf)
import {
  PatrimonyTrendLazy as PatrimonyTrend,
  TrendStripLazy as TrendStrip,
} from "./_components/LazyCharts"
import {
  fetchAllExpenseTx,
  fetchCardCalcTxs,
  fetchDashboardCore,
  fetchPatrimonySnapshots,
  fetchUserLocation,
} from "@/lib/dashboard/queries"
import {
  buildAccountsWithBalance,
  buildCardsByBankKey,
  buildFlowByAccount,
  buildItemizedByCardMonth,
  buildMonthlyTotals,
  buildOpenDebtByCard,
  buildPendingVirtualTx,
  buildTotalBalanceCents,
  getCreditAccountIds,
  getFormalIncomeIds,
  groupAccountsByType,
  makeEffectiveAmountFn,
  pendingNetCentsOf,
  sumGroupTotals,
} from "@/lib/dashboard/helpers"

export default async function DashboardPage() {
  const user = await requireOnboardedUser()
  const supabase = await createServerClient()

  const slots = lastNMonthSlots(12)
  const oldestStart = slots[0]!.start

  const [core, allExpenseTx, cardCalcTxs, location, patrimonySnapshots] =
    await Promise.all([
      fetchDashboardCore(supabase, user.id, oldestStart),
      fetchAllExpenseTx(supabase, user.id),
      fetchCardCalcTxs(supabase, user.id),
      fetchUserLocation(supabase, user.id),
      fetchPatrimonySnapshots(supabase, user.id, 90),
    ])
  // allExpenseTx é mantido em paridade com a versão anterior — alimenta
  // o `detectedCardDebt` legado que serve como base de referência pro
  // openDebtByCard. Não é usado diretamente no display.
  void allExpenseTx

  const { accounts, categories, monthTx, recentTx, flowRealized, upcomingTx, pendingCaptures } =
    core

  const formalIncomeIds = getFormalIncomeIds(categories)
  const creditAccountIdSet = getCreditAccountIds(accounts)
  const cardsByBankKey = buildCardsByBankKey(accounts)
  const itemizedByCardMonth = buildItemizedByCardMonth(monthTx, creditAccountIdSet)
  const pendingVirtualTx = buildPendingVirtualTx(pendingCaptures)
  const pendingNetCents = pendingNetCentsOf(pendingVirtualTx)

  const monthly = buildMonthlyTotals({
    monthTx,
    pending: pendingVirtualTx,
    slots,
    formalIncomeIds,
    creditAccountIds: creditAccountIdSet,
    cardsByBankKey,
    itemizedByCardMonth,
  })

  const accountTypeById = new Map(
    accounts.map((a) => [a.id, a.type as AccountType]),
  )
  const flowByAccount = buildFlowByAccount(flowRealized, accountTypeById)
  const openDebtByCard = buildOpenDebtByCard(cardCalcTxs, accounts)
  const accountsWithBalance = buildAccountsWithBalance(
    accounts,
    flowByAccount,
    openDebtByCard,
  )

  const grouped = groupAccountsByType(accountsWithBalance)
  const totals = sumGroupTotals(grouped)
  const totalBalanceCents = buildTotalBalanceCents(totals, pendingNetCents)

  const effectiveAmountCents = makeEffectiveAmountFn({
    cardsByBankKey,
    itemizedByCardMonth,
  })

  const filteredUpcoming = upcomingTx
    .filter((t) => !creditAccountIdSet.has(t.account_id))
    .slice(0, 5)
  const upcomingNet = filteredUpcoming.reduce(
    (sum, t) =>
      sum +
      (t.type === "income"
        ? effectiveAmountCents(t)
        : -effectiveAmountCents(t)),
    0,
  )

  const hasGroqKey = !!process.env.GROQ_API_KEY
  const hasAccounts = accounts.length > 0

  const coords = (location.uf && UF_CENTROIDS[location.uf]) || null

  // Per-user AI commentary on monthly / 6m / 12m net flow (entradas − saídas,
  // ignoring transfers). Single Groq call; silently empty when key missing.
  const currentNet = monthly[monthly.length - 1]?.netCents ?? 0
  const last6Net = monthly.slice(-6).reduce((s, m) => s + m.netCents, 0)
  const last12Net = monthly.reduce((s, m) => s + m.netCents, 0)
  const trendMonthly = monthly.map((m) => ({ month: m.key, netCents: m.netCents }))
  const trendDirection = (net: number): "rising" | "falling" | "flat" =>
    net > 0 ? "rising" : net < 0 ? "falling" : "flat"
  const trendExplanations = await explainTrends(
    {
      label: "mês atual",
      direction: trendDirection(currentNet),
      netCents: currentNet,
      monthly: trendMonthly.slice(-1),
    },
    {
      label: "últimos 6 meses",
      direction: trendDirection(last6Net),
      netCents: last6Net,
      monthly: trendMonthly.slice(-6),
    },
    {
      label: "últimos 12 meses",
      direction: trendDirection(last12Net),
      netCents: last12Net,
      monthly: trendMonthly,
    },
  )

  const accountNameMap = new Map(accountsWithBalance.map((a) => [a.id, a.name]))

  return (
    <div className="space-y-8">
      <QuickCapture hasGroqKey={hasGroqKey} hasAccounts={hasAccounts} />

      <KpiOverview
        heroAside={
          <ClockWeather
            cityName={location.cityName}
            uf={location.uf}
            coords={coords}
            compact
          />
        }
        trendExplanations={trendExplanations}
        last12={monthly}
        totalBalanceCents={totalBalanceCents}
        liquidCents={totals.liquidCents}
        savingsCents={totals.savingsCents}
        investmentCents={totals.investmentCents}
        cryptoCents={totals.cryptoCents}
        fgtsCents={totals.fgtsCents}
        creditCents={totals.creditCents}
        ticketCents={totals.ticketCents}
        liquidAccounts={grouped.liquidAccounts}
        savingsAccounts={grouped.savingsAccounts}
        investmentAccounts={grouped.investmentAccounts}
        cryptoAccounts={grouped.cryptoAccounts}
        fgtsAccounts={grouped.fgtsAccounts}
        creditAccounts={grouped.creditAccounts}
        ticketAccounts={grouped.ticketAccounts}
      />

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-baseline justify-between">
            <div>
              <h2 className="text-sm font-medium text-strong">Entrada vs saída (12 meses)</h2>
              <p className="text-xs text-muted">Tendência mensal do seu fluxo de caixa</p>
            </div>
          </div>
          <TrendStrip data={monthly} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-baseline justify-between">
            <div>
              <h2 className="text-sm font-medium text-strong">Evolução do patrimônio</h2>
              <p className="text-xs text-muted">
                Snapshot diário do saldo total · últimos 90 dias
              </p>
            </div>
          </div>
          <PatrimonyTrend data={patrimonySnapshots} />
        </CardContent>
      </Card>

      <PendingCaptures
        captures={pendingCaptures
          .filter((c) => {
            const p = c.groq_parse_json as { amount_cents?: number } | null
            return !!p && typeof p.amount_cents === "number"
          })
          .map((c) => {
            const p = c.groq_parse_json as {
              amount_cents: number
              type: "income" | "expense"
              category_name: string
              subcategory_name: string | null
              merchant: string | null
              occurred_on: string
            }
            return {
              id: c.id,
              channel: c.channel,
              raw_input: c.raw_input,
              created_at: c.created_at,
              parsed: {
                amountCents: p.amount_cents,
                type: p.type,
                categoryName: p.category_name,
                subcategoryName: p.subcategory_name,
                merchant: p.merchant,
                occurredOn: p.occurred_on,
              },
            }
          })}
        accounts={accountsWithBalance.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
        }))}
      />

      <UpcomingList
        items={filteredUpcoming}
        upcomingNet={upcomingNet}
        accountNameMap={accountNameMap}
        effectiveAmountCents={effectiveAmountCents}
      />

      <UpcomingInvoices
        cards={accounts
          .filter((a) => a.type === "credit")
          .map((a) => ({
            id: a.id,
            name: a.name,
            openDebtCents: openDebtByCard.get(a.id) ?? 0,
            closingDay: (a.closing_day as number | null | undefined) ?? null,
          }))}
      />

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-strong">Últimas transações</h2>
          <Link href="/app/transacoes" className="text-sm text-muted hover:text-strong">
            Ver todas →
          </Link>
        </div>
        <RecentTransactions
          transactions={recentTx
            .filter((t) => !creditAccountIdSet.has(t.account_id))
            .slice(0, 50)
            .map((t) => ({
              id: t.id,
              type: t.type as "income" | "expense",
              amount_cents: effectiveAmountCents(t),
              occurred_on: t.occurred_on,
              merchant: t.merchant,
              note: t.note,
              needs_review: t.needs_review ?? false,
              account_id: t.account_id,
              category_id: t.category_id,
              created_at: t.created_at,
              paid_at: t.paid_at,
            }))}
          accounts={accountsWithBalance}
          categories={categories}
        />
      </section>
    </div>
  )
}
