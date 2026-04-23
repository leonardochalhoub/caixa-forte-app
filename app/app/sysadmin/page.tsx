import { isOwner, requireAdmin } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { untyped } from "@/lib/supabase/untyped"
import { splitBankAndSub } from "@/lib/bank-taxonomy"
import { formatBRL } from "@/lib/money"
import { SysadminDashboard } from "./_components/SysadminDashboard"

export const dynamic = "force-dynamic"

// The sysadmin view is aggregate-only. We explicitly avoid per-user financial
// detail to respect the privacy disclaimer shown on signup/profile. What we
// expose per user is identity (name, email, city) + access activity (login
// count, last login) and management controls (role). No balance, no
// transaction data.

interface UserRow {
  user_id: string
  email: string | null
  display_name: string | null
  role: string
  city_name: string | null
  uf: string | null
  onboarded_at: string | null
  created_at: string
  last_login_at: string | null
  login_count: number
}

export default async function SysadminPage() {
  await requireAdmin()
  const ownerFlag = await isOwner()
  const admin = createAdminClient()
  const db = untyped(admin)

  const { data: authUsers } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  const users = authUsers?.users ?? []

  const profilesRes = await db
    .from("profiles")
    .select(
      "user_id, display_name, role, city_name, uf, lat, lng, gender, onboarded_at, created_at, is_demo",
    )
  const profiles = (profilesRes.data ?? []) as Array<{
    user_id: string
    display_name: string | null
    role: string | null
    city_name: string | null
    uf: string | null
    lat: number | null
    lng: number | null
    gender: "M" | "F" | null
    onboarded_at: string | null
    created_at: string
    is_demo: boolean | null
  }>
  const profileById = new Map(profiles.map((p) => [p.user_id, p]))
  // Contas demo (Larissa, etc) são excluídas de TODAS as métricas de
  // usuários reais — user count, balance médio, mapa, trend, categorias.
  // Visíveis apenas via KPI dedicado de cliques na landing.
  const demoUserIds = new Set(
    profiles.filter((p) => p.is_demo).map((p) => p.user_id),
  )

  const eventsRes = await db
    .from("login_events")
    .select("user_id, happened_at")
    .order("happened_at", { ascending: false })
    .limit(10000)
  const events = (eventsRes.data ?? []) as Array<{
    user_id: string
    happened_at: string
  }>
  const lastLoginMap = new Map<string, { last: string | null; count: number }>()
  for (const e of events) {
    const entry = lastLoginMap.get(e.user_id) ?? { last: null, count: 0 }
    if (!entry.last) entry.last = e.happened_at
    entry.count += 1
    lastLoginMap.set(e.user_id, entry)
  }

  // Macro aggregates — computed server-side, never broken down per user.
  // `balancesSample` is a sorted array of per-user totals held only long
  // enough to compute mean/median, then discarded before the response.
  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)

  const { data: accountsFull } = await admin
    .from("accounts")
    .select("id, user_id, name, type, opening_balance_cents")
    .is("archived_at", null)
  // Only settled (paid_at IS NOT NULL) — matches the user dashboard so the
  // sysadmin balance agrees with what the user sees. Scheduled/unpaid
  // transactions are excluded until they're marked as paid.
  const { data: flowsAll } = await admin
    .from("transactions")
    .select("account_id, type, amount_cents")
    .not("paid_at", "is", null)

  // Contas pertencentes à conta demo — excluídas de todas as métricas.
  const demoAccountIds = new Set(
    (accountsFull ?? [])
      .filter((a) => demoUserIds.has(a.user_id as string))
      .map((a) => a.id as string),
  )
  const flowByAccount = new Map<string, number>()
  for (const tx of flowsAll ?? []) {
    const aid = tx.account_id as string
    if (demoAccountIds.has(aid)) continue
    const delta =
      tx.type === "income" ? Number(tx.amount_cents) : -Number(tx.amount_cents)
    flowByAccount.set(aid, (flowByAccount.get(aid) ?? 0) + delta)
  }

  // Aggregate patrimônio total per user — includes FGTS (unlike the user
  // dashboard's "Saldo total agora") so admins see the full picture. Kept
  // only long enough to compute mean/median, then discarded.
  const totalsByUserScratch = new Map<string, number>()
  for (const a of accountsFull ?? []) {
    const uid = a.user_id as string
    if (demoUserIds.has(uid)) continue
    const opening = Number(a.opening_balance_cents ?? 0)
    const flow = flowByAccount.get(a.id as string) ?? 0
    totalsByUserScratch.set(uid, (totalsByUserScratch.get(uid) ?? 0) + opening + flow)
  }

  const recentRes = await db
    .from("login_events")
    .select("id, user_id, happened_at, ip, user_agent")
    .order("happened_at", { ascending: false })
    .limit(100)
  const recentEvents = (recentRes.data ?? []) as Array<{
    id: number
    user_id: string
    happened_at: string
    ip: string | null
    user_agent: string | null
  }>

  const rows: UserRow[] = users
    .filter((u) => !demoUserIds.has(u.id))
    .map((u) => {
      const p = profileById.get(u.id)
      const login = lastLoginMap.get(u.id) ?? { last: null, count: 0 }
      return {
        user_id: u.id,
        email: u.email ?? null,
        display_name: p?.display_name ?? null,
        role: p?.role ?? "user",
        city_name: p?.city_name ?? null,
        uf: p?.uf ?? null,
        onboarded_at: p?.onboarded_at ?? null,
        created_at: u.created_at ?? new Date().toISOString(),
        last_login_at: login.last,
        login_count: login.count,
      }
    })

  const onboardedTotals = Array.from(totalsByUserScratch.values())
  const totalUsers = rows.length
  const onboardedUsers = rows.filter((r) => r.onboarded_at).length
  const avgBalanceCents =
    onboardedTotals.length === 0
      ? 0
      : Math.round(onboardedTotals.reduce((s, v) => s + v, 0) / onboardedTotals.length)
  const medianBalanceCents = (() => {
    if (onboardedTotals.length === 0) return 0
    const sorted = [...onboardedTotals].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2
      ? sorted[mid]!
      : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
  })()
  // Discard the scratch map so it doesn't end up in the payload.
  totalsByUserScratch.clear()

  // Wealth trend — aggregated monthly net across all users (last 12 months).
  // Matches the user dashboard's rules exactly so numbers line up:
  //   • exclude is_transfer
  //   • only count income whose category is marked is_formal_income
  //   • include scheduled/future-dated tx in the current month
  const months: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    months.push(d.toISOString().slice(0, 7))
  }
  const trendStartDate = new Date(today.getFullYear(), today.getMonth() - 11, 1)
    .toISOString()
    .slice(0, 10)
  const trendEndDate = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10)

  const { data: formalIncomeCats } = await admin
    .from("categories")
    .select("id, is_formal_income")
  const formalIncomeIds = new Set(
    (formalIncomeCats ?? [])
      .filter((c) => (c as { is_formal_income?: boolean }).is_formal_income)
      .map((c) => c.id as string),
  )

  const { data: flowsForTrend } = await admin
    .from("transactions")
    .select("user_id, type, amount_cents, occurred_on, is_transfer, category_id")
    .gte("occurred_on", trendStartDate)
    .lte("occurred_on", trendEndDate)
  const trendByMonth = new Map<string, { income: number; expense: number }>()
  for (const m of months) trendByMonth.set(m, { income: 0, expense: 0 })
  for (const tx of flowsForTrend ?? []) {
    if (demoUserIds.has((tx as { user_id: string }).user_id)) continue
    if ((tx as { is_transfer?: boolean }).is_transfer) continue
    const m = (tx.occurred_on as string).slice(0, 7)
    const entry = trendByMonth.get(m)
    if (!entry) continue
    if (tx.type === "income") {
      const catId = tx.category_id as string | null
      if (catId && formalIncomeIds.has(catId)) {
        entry.income += Number(tx.amount_cents)
      }
    } else {
      entry.expense += Number(tx.amount_cents)
    }
  }
  // Averaged per active user — "o fluxo típico de um usuário" — so the trend
  // stays meaningful as the base grows. Descending by month (newest first).
  const activeUsers = Math.max(1, onboardedUsers)
  const trend = months
    .map((m) => {
      const e = trendByMonth.get(m)!
      return {
        month: m,
        net: Math.round((e.income - e.expense) / activeUsers),
        income: Math.round(e.income / activeUsers),
        expense: Math.round(e.expense / activeUsers),
      }
    })
    .sort((a, b) => b.month.localeCompare(a.month))
  const trendDirection: "rising" | "falling" | "flat" = (() => {
    if (trend.length < 2) return "flat"
    const firstN = Math.floor(trend.length / 2)
    const first =
      trend.slice(0, firstN).reduce((s, t) => s + t.net, 0) / Math.max(1, firstN)
    const second =
      trend.slice(firstN).reduce((s, t) => s + t.net, 0) /
      Math.max(1, trend.length - firstN)
    if (second > first * 1.05) return "rising"
    if (second < first * 0.95) return "falling"
    return "flat"
  })()

  const ufCounts = new Map<string, number>()
  for (const r of rows) {
    if (!r.uf) continue
    ufCounts.set(r.uf, (ufCounts.get(r.uf) ?? 0) + 1)
  }

  // Per-user pins for the map (admin-only, guarded by requireAdmin() above).
  // We deliberately ship only identity + geo + signup date — no financials.
  const userPins = rows
    .filter((r) => r.uf)
    .map((r) => {
      const p = profileById.get(r.user_id)
      return {
        user_id: r.user_id,
        display_name: r.display_name,
        email: r.email,
        city_name: r.city_name,
        uf: r.uf!,
        lat: p?.lat ?? null,
        lng: p?.lng ?? null,
        gender: p?.gender ?? null,
        created_at: r.created_at,
      }
    })

  // Period trends: this month, last 6 months, last 12 months. Computed from
  // the already-filtered trend array (which ends on the current month).
  const currentMonth = todayIso.slice(0, 7)
  const thisMonthNet =
    trend.find((t) => t.month === currentMonth)?.net ?? 0
  const last6Net = trend
    .slice(0, 6)
    .reduce((s, t) => s + t.net, 0)
  const last12Net = trend.reduce((s, t) => s + t.net, 0)

  function directionFromSlice(slice: typeof trend): "rising" | "falling" | "flat" {
    if (slice.length < 2) return "flat"
    const half = Math.floor(slice.length / 2)
    const older =
      slice.slice(half).reduce((s, t) => s + t.net, 0) / Math.max(1, slice.length - half)
    const newer =
      slice.slice(0, half).reduce((s, t) => s + t.net, 0) / Math.max(1, half)
    if (newer > older * 1.05) return "rising"
    if (newer < older * 0.95) return "falling"
    return "flat"
  }
  const trend1m = {
    net: thisMonthNet,
    direction:
      thisMonthNet > 0 ? "rising" : thisMonthNet < 0 ? "falling" : "flat",
  } as const
  const trend6m = { net: last6Net, direction: directionFromSlice(trend.slice(0, 6)) }
  const trend12m = { net: last12Net, direction: directionFromSlice(trend) }

  // Aggregate bank popularity & value — how many accounts exist per bank
  // brand across all users AND the combined balance held in those accounts.
  // Two numbers per bank, no per-user breakdown.
  const bankAgg = new Map<string, { count: number; totalCents: number }>()
  for (const a of accountsFull ?? []) {
    if (demoUserIds.has(a.user_id as string)) continue
    const { bank } = splitBankAndSub((a.name as string | null) ?? "")
    if (!bank || bank.length < 2) continue
    const opening = Number(a.opening_balance_cents ?? 0)
    const flow = flowByAccount.get(a.id as string) ?? 0
    const balance = opening + flow
    const entry = bankAgg.get(bank) ?? { count: 0, totalCents: 0 }
    entry.count += 1
    entry.totalCents += balance
    bankAgg.set(bank, entry)
  }
  const topBanks = Array.from(bankAgg.entries())
    .map(([bank, v]) => ({ bank, count: v.count, totalCents: v.totalCents }))
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, 10)

  // Category / subcategory spending — sum of expense amounts across all users,
  // split by parent category (is "top bucket") and child category
  // (sub-bucket). Only aggregates, no per-user breakdown.
  const { data: allCats } = await admin
    .from("categories")
    .select("id, name, parent_id, is_income")
  const catById = new Map(
    (allCats ?? []).map((c) => [
      c.id as string,
      {
        name: c.name as string,
        parent_id: c.parent_id as string | null,
        is_income: c.is_income as boolean,
      },
    ]),
  )

  const { data: allExpenseFlows } = await admin
    .from("transactions")
    .select("user_id, category_id, amount_cents, type, is_transfer, occurred_on")
    .eq("type", "expense")
    .lte("occurred_on", todayIso)
  const byParent = new Map<string, number>()
  const bySub = new Map<string, { amount: number; parentName: string }>()
  for (const tx of allExpenseFlows ?? []) {
    if (demoUserIds.has((tx as { user_id: string }).user_id)) continue
    if ((tx as { is_transfer?: boolean }).is_transfer) continue
    const catId = tx.category_id as string | null
    if (!catId) continue
    const cat = catById.get(catId)
    if (!cat) continue
    const amt = Number(tx.amount_cents)
    if (cat.parent_id) {
      const parent = catById.get(cat.parent_id)
      const parentName = parent?.name ?? "(sem grupo)"
      byParent.set(parentName, (byParent.get(parentName) ?? 0) + amt)
      const subKey = `${parentName} > ${cat.name}`
      const cur = bySub.get(subKey) ?? { amount: 0, parentName }
      cur.amount += amt
      bySub.set(subKey, cur)
    } else {
      byParent.set(cat.name, (byParent.get(cat.name) ?? 0) + amt)
    }
  }
  const topCategories = Array.from(byParent.entries())
    .map(([name, amountCents]) => ({ name, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, 8)
  const topSubcategories = Array.from(bySub.entries())
    .map(([label, v]) => ({ label, amountCents: v.amount, parent: v.parentName }))
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, 10)

  // Sysadmin trend cards intentionally DON'T call Groq. The verdict label
  // (Enriquecendo/Empobrecendo/Estável) carries the meaning; burning
  // tokens-per-minute on every admin page load isn't worth it. User-facing
  // explainer stays on /app where context matters more.
  // Cliques no link "Ver conta de exemplo" da landing — KPI separado
  // das métricas de usuários reais.
  const { data: clicksAll } = await db
    .from("demo_clicks")
    .select("created_at, ip_hash")
  const clicks = (clicksAll ?? []) as Array<{
    created_at: string
    ip_hash: string | null
  }>
  const now = Date.now()
  const dayAgo = now - 24 * 60 * 60 * 1000
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000
  const demoClicksStats = {
    total: clicks.length,
    last24h: clicks.filter((c) => new Date(c.created_at).getTime() >= dayAgo).length,
    last7d: clicks.filter((c) => new Date(c.created_at).getTime() >= weekAgo).length,
    uniqueIps: new Set(clicks.map((c) => c.ip_hash).filter(Boolean)).size,
  }

  const kpi = {
    totalUsers,
    onboardedUsers,
    avgBalanceCents,
    medianBalanceCents,
    trendDirection,
    formattedAvg: formatBRL(avgBalanceCents),
    formattedMedian: formatBRL(medianBalanceCents),
    trend1m,
    trend6m,
    trend12m,
    demoClicks: demoClicksStats,
  }

  return (
    <SysadminDashboard
      rows={rows}
      recentEvents={recentEvents}
      kpi={kpi}
      trend={trend}
      ufCounts={Array.from(ufCounts.entries()).map(([uf, count]) => ({
        uf,
        count,
      }))}
      userPins={userPins}
      topBanks={topBanks}
      topCategories={topCategories}
      topSubcategories={topSubcategories}
      currentUserIsOwner={ownerFlag}
    />
  )
}
