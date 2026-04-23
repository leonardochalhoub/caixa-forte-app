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
import { PendingCaptures } from "./_components/PendingCaptures"
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
    { data: pendingCaptures },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("type, amount_cents, occurred_on, category_id, is_transfer, account_id")
      .eq("user_id", user.id)
      .gte("occurred_on", oldestStart),
    // "Últimas transações" no dashboard só mostra movimentações das
    // contas normais. Tx em cartão de crédito (charges) ficam dentro
    // da fatura em /app/cartoes — não aparecem aqui pra não poluir.
    untyped(supabase)
      .from("transactions")
      .select(
        "id, type, amount_cents, occurred_on, merchant, note, needs_review, account_id, category_id, created_at, paid_at",
      )
      .eq("user_id", user.id)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
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
    // flowRealized agora traz TODAS as tx (com e sem paid_at) +
    // account_id. Depois separamos: contas não-cartão usam só paid_at
    // não-nulo; cartão de crédito usa tudo (charge é dívida desde o
    // swipe, independente de paid_at).
    untyped(supabase)
      .from("transactions")
      .select("account_id, type, amount_cents, paid_at, is_transfer")
      .eq("user_id", user.id),
    supabase
      .from("transactions")
      .select(
        "id, type, amount_cents, occurred_on, merchant, note, account_id, category_id",
      )
      .eq("user_id", user.id)
      .is("paid_at", null)
      .order("occurred_on", { ascending: true })
      .limit(20),
    supabase
      .from("capture_messages")
      .select("id, channel, raw_input, groq_parse_json, created_at")
      .eq("user_id", user.id)
      .eq("error", "no_account")
      .is("transaction_id", null)
      .order("created_at", { ascending: true })
      .limit(20),
  ])

  const formalIncomeIds = new Set(
    (categories ?? [])
      .filter((c) => c.is_formal_income === true)
      .map((c) => c.id),
  )

  // Pending captures (no_account) are real spending that hasn't been
  // allocated yet. We synthesize them as virtual transactions so the
  // monthly KPIs and the hero total reflect them right away — even though
  // they're not on any account. Assigning an account later just moves the
  // number from "pending" to a real account without double-counting.
  const pendingVirtualTx = (pendingCaptures ?? [])
    .map((c) => c.groq_parse_json as {
      amount_cents?: number
      type?: "income" | "expense"
      occurred_on?: string
    } | null)
    .filter(
      (p): p is {
        amount_cents: number
        type: "income" | "expense"
        occurred_on: string
      } =>
        !!p &&
        typeof p.amount_cents === "number" &&
        (p.type === "income" || p.type === "expense") &&
        typeof p.occurred_on === "string",
    )

  // KPIs mensais (Entrada/Saída/Perda) não contam tx em cartão de
  // crédito — esse dinheiro ainda não "saiu" da vida do user, só vai
  // sair quando a fatura for paga (daí o pagamento sim entra em Saída).
  const creditAccountIdSet = new Set(
    (accounts ?? []).filter((a) => a.type === "credit").map((a) => a.id),
  )
  const monthly = bucketizeTransactions(
    [
      ...(monthTx ?? [])
        .filter((t) => !creditAccountIdSet.has(t.account_id))
        .map((t) => ({
          occurred_on: t.occurred_on,
          type: t.type as "income" | "expense",
          amount_cents: Number(t.amount_cents),
          category_id: t.category_id,
          is_transfer: t.is_transfer ?? false,
        })),
      ...pendingVirtualTx.map((p) => ({
        occurred_on: p.occurred_on,
        type: p.type,
        amount_cents: p.amount_cents,
        category_id: null,
        is_transfer: false,
      })),
    ],
    slots,
    formalIncomeIds,
  )

  const pendingNetCents = pendingVirtualTx.reduce(
    (s, p) => s + (p.type === "income" ? p.amount_cents : -p.amount_cents),
    0,
  )

  const accountTypeById = new Map(
    (accounts ?? []).map((a) => [a.id, a.type as AccountType]),
  )
  const flowByAccount = new Map<string, number>()
  for (const t of flowRealized ?? []) {
    const accType = accountTypeById.get(t.account_id)
    const isCreditAcc = accType === "credit"
    // Cartão: conta tudo (inclusive paid_at=null) — charges são dívida
    // assim que aparecem. Demais contas: só paid_at não-nulo.
    if (!isCreditAcc && t.paid_at == null) continue
    const delta = t.type === "income" ? Number(t.amount_cents) : -Number(t.amount_cents)
    flowByAccount.set(t.account_id, (flowByAccount.get(t.account_id) ?? 0) + delta)
  }

  // Detecta dívida "a pagar" de cartão a partir de merchants tipo
  // "<banco> Cartão <mês>" em qualquer conta — útil quando o user
  // registra a fatura como agendada na corrente em vez de itemizar as
  // compras no cartão. Só entra na dívida exibida se paid_at=null.
  const normalizeStr = (s: string) =>
    s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
  const bankKey = (name: string): string => {
    const cleaned = name.replace(/cart[ãa]o.*/i, "").trim()
    return normalizeStr(cleaned.split(/\s+/)[0] ?? "")
  }
  // Busca todas as tx do user (incluindo agendadas) pra detectar
  // lump-sums. Limitado a expense is_transfer=false.
  const { data: allTxRaw } = await untyped(supabase)
    .from("transactions")
    .select("account_id, type, amount_cents, merchant, paid_at, is_transfer")
    .eq("user_id", user.id)
    .eq("type", "expense")
  const allExpenseTx = (allTxRaw ?? []) as Array<{
    account_id: string
    amount_cents: number
    merchant: string | null
    paid_at: string | null
    is_transfer: boolean | null
  }>
  const detectedCardDebt = new Map<string, number>()
  for (const card of (accounts ?? []).filter(
    (a) => (a.type as AccountType) === "credit",
  )) {
    const key = bankKey(card.name)
    if (!key) continue
    let debt = 0
    for (const t of allExpenseTx) {
      if (t.is_transfer) continue
      if (t.account_id === card.id) continue // já contado em flowByAccount
      if (t.paid_at) continue // fatura já paga no passado, water under the bridge
      const m = normalizeStr(t.merchant ?? "")
      if (!m.includes("cartao")) continue
      if (!m.includes(key)) continue
      debt += Number(t.amount_cents)
    }
    if (debt > 0) detectedCardDebt.set(card.id, debt)
  }

  const accountsWithBalance = (accounts ?? []).map((a) => {
    const base = Number(a.opening_balance_cents ?? 0) + (flowByAccount.get(a.id) ?? 0)
    const detected = detectedCardDebt.get(a.id) ?? 0
    const isCredit = (a.type as AccountType) === "credit"
    // Pra cartão: dívida detectada é o "total oficial" da fatura
    // (lump-sum). Os charges itemizados já estão em `base` via flow —
    // se o lump-sum cobre ou excede os itemizados, ele É o total.
    // Regra: balance = opening - max(|flow cartão|, detected).
    // Pra demais contas: detected = 0, fica só base.
    let balance = base
    if (isCredit) {
      // Lump-sum = valor base da fatura (original). Itemizados (card
      // flow) = compras novas em cima. Total debt = soma dos dois.
      const itemizedDebt = Math.abs(
        base - Number(a.opening_balance_cents ?? 0),
      )
      balance =
        Number(a.opening_balance_cents ?? 0) - (itemizedDebt + detected)
    }
    return {
      id: a.id,
      name: a.name,
      type: a.type as AccountType,
      balanceCents: balance,
    }
  })

  const savingsAccounts = accountsWithBalance.filter(
    (a) => a.type === "savings" || a.type === "poupanca",
  )
  const investmentAccounts = accountsWithBalance.filter((a) => a.type === "investment")
  const cryptoAccounts = accountsWithBalance.filter((a) => a.type === "crypto")
  const fgtsAccounts = accountsWithBalance.filter((a) => a.type === "fgts")
  const creditAccounts = accountsWithBalance.filter((a) => a.type === "credit")
  const liquidAccounts = accountsWithBalance.filter(
    (a) =>
      a.type !== "savings" &&
      a.type !== "poupanca" &&
      a.type !== "investment" &&
      a.type !== "crypto" &&
      a.type !== "fgts" &&
      a.type !== "credit",
  )
  const savingsCents = savingsAccounts.reduce((s, a) => s + a.balanceCents, 0)
  const investmentCents = investmentAccounts.reduce((s, a) => s + a.balanceCents, 0)
  const cryptoCents = cryptoAccounts.reduce((s, a) => s + a.balanceCents, 0)
  const fgtsCents = fgtsAccounts.reduce((s, a) => s + a.balanceCents, 0)
  const liquidCents = liquidAccounts.reduce((s, a) => s + a.balanceCents, 0)
  // Credit card balance = running debt (negative when you owe). Subtracted
  // from the "liquid + savings + investments" net worth.
  const creditCents = creditAccounts.reduce((s, a) => s + a.balanceCents, 0)
  // Saldo = dinheiro disponível + investimentos. FGTS fica de fora
  // (bloqueado) e cartão de crédito também — dívida só derruba o saldo
  // quando a fatura é paga (o transfer pair debita a conta corrente).
  // Pendentes reduzem, são dinheiro já gasto sem conta atribuída.
  const totalBalanceCents =
    liquidCents +
    savingsCents +
    investmentCents +
    cryptoCents +
    pendingNetCents

  const creditIdsForFilter = new Set(
    (accounts ?? []).filter((a) => a.type === "credit").map((a) => a.id),
  )

  // Pra lump-sums de fatura ("<banco> cartão <mês>") em contas
  // correntes, o valor exibido em Agendadas e Últimas transações é o
  // TOTAL da fatura = lump-sum + charges itemizados no cartão do mesmo
  // banco/mês. Sem isso o user vê R$ 6.415,25 em vez de R$ 7.196,69.
  const normalizeMerchant = (s: string) =>
    s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
  const bankKeyOfCard = (cardName: string): string => {
    const cleaned = cardName.replace(/cart[ãa]o.*/i, "").trim()
    return normalizeMerchant(cleaned.split(/\s+/)[0] ?? "")
  }
  const cardsByBankKey = new Map<string, string>() // bankKey -> card.id
  for (const a of accounts ?? []) {
    if (a.type !== "credit") continue
    const k = bankKeyOfCard(a.name)
    if (k) cardsByBankKey.set(k, a.id)
  }
  // Calcula itemizados por cartão+mês a partir do flowRealized
  const itemizedByCardMonth = new Map<string, number>() // `${cardId}-${yyyy-mm}` -> cents
  for (const t of flowRealized ?? []) {
    if (t.is_transfer) continue
    if (!creditIdsForFilter.has(t.account_id)) continue
    if (t.type !== "expense") continue
    // occurred_on não está em flowRealized mas podemos usar paid_at como fallback
    // Mais simples: buscar de monthTx que tem occurred_on
  }
  // Fallback: usa monthTx (que tem occurred_on) pra construir o map
  for (const t of monthTx ?? []) {
    if (t.is_transfer) continue
    if (!creditIdsForFilter.has(t.account_id)) continue
    if (t.type !== "expense") continue
    const key = `${t.account_id}-${t.occurred_on.slice(0, 7)}`
    itemizedByCardMonth.set(
      key,
      (itemizedByCardMonth.get(key) ?? 0) + Number(t.amount_cents),
    )
  }

  function effectiveAmountCents(t: {
    amount_cents: number | string
    merchant: string | null
    occurred_on: string
  }): number {
    const base = Number(t.amount_cents)
    const m = normalizeMerchant(t.merchant ?? "")
    if (!m.includes("cartao")) return base
    for (const [bankKey, cardId] of cardsByBankKey) {
      if (!m.includes(bankKey)) continue
      const addon =
        itemizedByCardMonth.get(`${cardId}-${t.occurred_on.slice(0, 7)}`) ?? 0
      return base + addon
    }
    return base
  }

  const filteredUpcoming = (upcomingTx ?? [])
    .filter((t) => !creditIdsForFilter.has(t.account_id))
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
        creditCents={creditCents}
        liquidAccounts={liquidAccounts}
        savingsAccounts={savingsAccounts}
        investmentAccounts={investmentAccounts}
        cryptoAccounts={cryptoAccounts}
        fgtsAccounts={fgtsAccounts}
        creditAccounts={creditAccounts}
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

      <PendingCaptures
        captures={(pendingCaptures ?? [])
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

      {filteredUpcoming.length > 0 && (
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
              {filteredUpcoming.map((t) => {
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
                        {isIncome ? "+" : "−"} {formatBRL(effectiveAmountCents(t))}
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

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-strong">Últimas transações</h2>
          <a href="/app/transacoes" className="text-sm text-muted hover:text-strong">
            Ver todas →
          </a>
        </div>
        <RecentTransactions
          transactions={(recentTx ?? [])
            .filter(
              (t: { account_id: string }) => !creditIdsForFilter.has(t.account_id),
            )
            .slice(0, 50)
            .map((t: {
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
          categories={categories ?? []}
        />
      </section>
    </div>
  )
}
