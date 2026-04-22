export const dynamic = "force-dynamic"
export const revalidate = 0

import { requireOnboardedUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { untyped } from "@/lib/supabase/untyped"
import type { AccountType } from "@/lib/types"
import { bucketizeTransactions, lastNMonthSlots } from "@/lib/analytics/periods"
import { todayIsoDate, formatPtBrDateShort } from "@/lib/time"
import { formatBRL } from "@/lib/money"
import { UF_CENTROIDS } from "@/lib/ibge"
import { explainTrends } from "@/lib/ai/trend-explainer"
import Link from "next/link"
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { ClockWeather } from "./_components/ClockWeather"
import { KpiOverview } from "./_components/KpiOverview"
import { QuickCapture } from "./_components/QuickCapture"
import { RecentTransactions } from "./_components/RecentTransactions"
import { TrendStrip } from "./_components/TrendStrip"

export default async function DashboardPage() {
  const user = await requireOnboardedUser()
  const supabase = await createServerClient()

  const slots = lastNMonthSlots(12)
  const oldestStart = slots[0]!.start
  const today = todayIsoDate()

  const [
    { data: monthTx },
    { data: recentTx },
    { data: accounts },
    { data: categories },
    { data: flowRealized },
    { data: upcomingTx },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("type, amount_cents, occurred_on, category_id, is_transfer")
      .eq("user_id", user.id)
      .gte("occurred_on", oldestStart),
    untyped(supabase)
      .from("transactions")
      .select(
        "id, type, amount_cents, occurred_on, merchant, note, needs_review, account_id, category_id, created_at, paid_at",
      )
      .eq("user_id", user.id)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("accounts")
      .select("id, name, type, opening_balance_cents")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("sort_order"),
    supabase
      .from("categories")
      .select("id, name, is_income, parent_id, is_formal_income")
      .eq("user_id", user.id)
      .order("sort_order"),
    supabase
      .from("transactions")
      .select("account_id, type, amount_cents")
      .eq("user_id", user.id)
      .not("paid_at", "is", null),
    supabase
      .from("transactions")
      .select(
        "id, type, amount_cents, occurred_on, merchant, note, account_id, category_id",
      )
      .eq("user_id", user.id)
      .is("paid_at", null)
      .order("occurred_on", { ascending: true })
      .limit(5),
  ])

  const formalIncomeIds = new Set(
    (categories ?? [])
      .filter((c) => c.is_formal_income === true)
      .map((c) => c.id),
  )

  const monthly = bucketizeTransactions(
    (monthTx ?? []).map((t) => ({
      occurred_on: t.occurred_on,
      type: t.type as "income" | "expense",
      amount_cents: Number(t.amount_cents),
      category_id: t.category_id,
      is_transfer: t.is_transfer ?? false,
    })),
    slots,
    formalIncomeIds,
  )

  const flowByAccount = new Map<string, number>()
  for (const t of flowRealized ?? []) {
    const delta = t.type === "income" ? Number(t.amount_cents) : -Number(t.amount_cents)
    flowByAccount.set(t.account_id, (flowByAccount.get(t.account_id) ?? 0) + delta)
  }

  const accountsWithBalance = (accounts ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type as AccountType,
    balanceCents: Number(a.opening_balance_cents ?? 0) + (flowByAccount.get(a.id) ?? 0),
  }))

  const savingsAccounts = accountsWithBalance.filter(
    (a) => a.type === "savings" || a.type === "poupanca",
  )
  const investmentAccounts = accountsWithBalance.filter((a) => a.type === "investment")
  const cryptoAccounts = accountsWithBalance.filter((a) => a.type === "crypto")
  const fgtsAccounts = accountsWithBalance.filter((a) => a.type === "fgts")
  const liquidAccounts = accountsWithBalance.filter(
    (a) =>
      a.type !== "savings" &&
      a.type !== "poupanca" &&
      a.type !== "investment" &&
      a.type !== "crypto" &&
      a.type !== "fgts",
  )
  const savingsCents = savingsAccounts.reduce((s, a) => s + a.balanceCents, 0)
  const investmentCents = investmentAccounts.reduce((s, a) => s + a.balanceCents, 0)
  const cryptoCents = cryptoAccounts.reduce((s, a) => s + a.balanceCents, 0)
  const fgtsCents = fgtsAccounts.reduce((s, a) => s + a.balanceCents, 0)
  const liquidCents = liquidAccounts.reduce((s, a) => s + a.balanceCents, 0)
  // FGTS is intentionally EXCLUDED from the total — locked funds.
  const totalBalanceCents = liquidCents + savingsCents + investmentCents + cryptoCents

  const upcomingNet = (upcomingTx ?? []).reduce(
    (sum, t) =>
      sum + (t.type === "income" ? Number(t.amount_cents) : -Number(t.amount_cents)),
    0,
  )

  const hasGroqKey = !!process.env.GROQ_API_KEY
  const hasAccounts = (accounts ?? []).length > 0

  // Optional — present only after migration 0017. Used to seed the weather
  // widget with the user's state-capital coordinates.
  let cityName: string | null = null
  let uf: string | null = null
  try {
    const locRes = await untyped(supabase)
      .from("profiles")
      .select("city_name, uf")
      .eq("user_id", user.id)
      .maybeSingle()
    cityName = (locRes.data?.city_name as string | null) ?? null
    uf = (locRes.data?.uf as string | null) ?? null
  } catch {
    /* columns don't exist yet */
  }
  const coords = (uf && UF_CENTROIDS[uf]) || null

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
          <ClockWeather cityName={cityName} uf={uf} coords={coords} compact />
        }
        trendExplanations={trendExplanations}
        last12={monthly}
        totalBalanceCents={totalBalanceCents}
        liquidCents={liquidCents}
        savingsCents={savingsCents}
        investmentCents={investmentCents}
        cryptoCents={cryptoCents}
        fgtsCents={fgtsCents}
        liquidAccounts={liquidAccounts}
        savingsAccounts={savingsAccounts}
        investmentAccounts={investmentAccounts}
        cryptoAccounts={cryptoAccounts}
        fgtsAccounts={fgtsAccounts}
      />

      {(upcomingTx ?? []).length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-baseline justify-between">
              <div>
                <h2 className="text-sm font-medium text-strong">
                  Agendadas · ainda não pagas
                </h2>
                <p className="text-xs text-muted">
                  Total a vencer:{" "}
                  <span
                    className={`font-mono tabular-nums ${
                      upcomingNet < 0 ? "text-expense" : "text-income"
                    }`}
                  >
                    {formatBRL(upcomingNet)}
                  </span>
                  . Marque como paga ao editar para incluir no saldo.
                </p>
              </div>
            </div>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {(upcomingTx ?? []).map((t) => {
                const isIncome = t.type === "income"
                return (
                  <li key={t.id}>
                    <Link
                      href={`/app/transacoes/${t.id}`}
                      className="group flex items-center gap-4 px-4 py-3 text-sm transition-colors hover:bg-subtle"
                    >
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full ${
                          isIncome ? "bg-income/10" : "bg-expense/10"
                        }`}
                      >
                        {isIncome ? (
                          <ArrowUp className="h-3.5 w-3.5 text-income" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5 text-expense" />
                        )}
                      </span>
                      <div className="flex-1">
                        <p className="truncate font-medium text-strong">
                          {t.merchant ?? t.note ?? "Sem descrição"}
                        </p>
                        <p className="text-xs text-muted">
                          {formatPtBrDateShort(t.occurred_on)} ·{" "}
                          {accountNameMap.get(t.account_id) ?? "conta"}
                        </p>
                      </div>
                      <p
                        className={`font-mono text-sm font-semibold tabular-nums ${
                          isIncome ? "text-income" : "text-expense"
                        }`}
                      >
                        {isIncome ? "+" : "−"} {formatBRL(Number(t.amount_cents))}
                      </p>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}

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

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-strong">Últimas transações</h2>
          <a href="/app/transacoes" className="text-sm text-muted hover:text-strong">
            Ver todas →
          </a>
        </div>
        <RecentTransactions
          transactions={(recentTx ?? []).map((t: {
            id: string
            type: string
            amount_cents: number
            occurred_on: string
            merchant: string | null
            note: string | null
            needs_review: boolean | null
            account_id: string
            category_id: string | null
            created_at: string
            paid_at: string | null
          }) => ({
            id: t.id,
            type: t.type as "income" | "expense",
            amount_cents: Number(t.amount_cents),
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
          categories={categories ?? []}
        />
      </section>
    </div>
  )
}
