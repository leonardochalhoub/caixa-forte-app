import { requireOnboardedUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { currentMonthRange, todayIsoDate, formatPtBrDateShort } from "@/lib/time"
import { lastNMonthSlots } from "@/lib/analytics/periods"
import { CategoriesGrid } from "./_components/CategoriesGrid"
import { NewCategoryButton } from "./_components/NewCategoryButton"
import { PeriodFilter } from "./_components/PeriodFilter"

export const dynamic = "force-dynamic"

interface RangeResolved {
  start: string
  end: string
  label: string
  currentKey: string // "current" | "6m" | "12m" | "all" | "range"
  from: string | null
  to: string | null
}

function endOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map((x) => parseInt(x, 10))
  if (!y || !m) return ym + "-01"
  const nextStart = m === 12 ? new Date(y + 1, 0, 1) : new Date(y, m, 1)
  const end = new Date(nextStart.getTime() - 86_400_000)
  return end.toISOString().slice(0, 10)
}

function resolvePeriod(args: {
  period?: string
  from?: string
  to?: string
}): RangeResolved {
  const today = todayIsoDate()

  // Custom range via from/to (takes priority over period)
  if (args.from && args.to && /^\d{4}-\d{2}$/.test(args.from) && /^\d{4}-\d{2}$/.test(args.to)) {
    const a = args.from <= args.to ? args.from : args.to
    const b = args.from <= args.to ? args.to : args.from
    const start = `${a}-01`
    const end = endOfMonth(b)
    return {
      start,
      end,
      label: `${formatPtBrDateShort(start)} → ${formatPtBrDateShort(end)}`,
      currentKey: "range",
      from: a,
      to: b,
    }
  }

  const raw = args.period

  if (!raw || raw === "current") {
    const { start, end } = currentMonthRange()
    return {
      start,
      end,
      label: `Este mês · ${formatPtBrDateShort(start)} → hoje`,
      currentKey: "current",
      from: null,
      to: null,
    }
  }

  if (raw === "6m") {
    const slots = lastNMonthSlots(6)
    const start = slots[0]!.start
    return {
      start,
      end: today,
      label: `Últimos 6 meses · ${formatPtBrDateShort(start)} → hoje`,
      currentKey: "6m",
      from: null,
      to: null,
    }
  }

  if (raw === "12m") {
    const slots = lastNMonthSlots(12)
    const start = slots[0]!.start
    return {
      start,
      end: today,
      label: `Últimos 12 meses · ${formatPtBrDateShort(start)} → hoje`,
      currentKey: "12m",
      from: null,
      to: null,
    }
  }

  if (raw === "all") {
    return {
      start: "1970-01-01",
      end: "9999-12-31",
      label: "Todo o histórico",
      currentKey: "all",
      from: null,
      to: null,
    }
  }

  // fallback: current month
  const { start, end } = currentMonthRange()
  return {
    start,
    end,
    label: `Este mês · ${formatPtBrDateShort(start)} → hoje`,
    currentKey: "current",
    from: null,
    to: null,
  }
}

export default async function CategoriasPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}) {
  const user = await requireOnboardedUser()
  const supabase = await createServerClient()
  const params = await searchParams
  const range = resolvePeriod(params)

  const [{ data: categories }, { data: transactions }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, parent_id, is_income, is_formal_income, sort_order")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("sort_order"),
    supabase
      .from("transactions")
      .select("category_id, amount_cents, type, is_transfer, occurred_on")
      .eq("user_id", user.id)
      .gte("occurred_on", range.start)
      .lte("occurred_on", range.end),
  ])

  const stats = new Map<string, { count: number; totalCents: number }>()
  for (const t of transactions ?? []) {
    if (t.is_transfer) continue
    if (!t.category_id) continue
    const prev = stats.get(t.category_id) ?? { count: 0, totalCents: 0 }
    prev.count += 1
    prev.totalCents += Number(t.amount_cents)
    stats.set(t.category_id, prev)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-strong">Categorias</h1>
          <p className="text-xs text-muted">Totais por categoria no período selecionado.</p>
        </div>
        <NewCategoryButton
          categories={(categories ?? []).map((c) => ({
            id: c.id as string,
            name: c.name as string,
            parent_id: (c.parent_id as string | null) ?? null,
            is_income: c.is_income as boolean,
          }))}
        />
      </div>
      <PeriodFilter
        current={range.currentKey}
        from={range.from}
        to={range.to}
        rangeLabel={range.label}
      />
      <CategoriesGrid
        categories={categories ?? []}
        stats={stats}
        rangeQuery={buildRangeQuery(range)}
      />
    </div>
  )
}

function buildRangeQuery(range: RangeResolved): string {
  const q = new URLSearchParams()
  if (range.currentKey === "range" && range.from && range.to) {
    q.set("from", range.from)
    q.set("to", range.to)
  } else if (range.currentKey !== "current") {
    q.set("period", range.currentKey)
  }
  return q.toString()
}
