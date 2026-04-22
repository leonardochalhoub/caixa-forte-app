import Link from "next/link"
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { formatBRL } from "@/lib/money"

type Category = {
  id: string
  name: string
  parent_id: string | null
  is_income: boolean
  is_formal_income: boolean
  sort_order: number
}

interface Stats {
  count: number
  totalCents: number
}

export function CategoriesGrid({
  categories,
  stats,
  rangeQuery,
}: {
  categories: Category[]
  stats: Map<string, Stats>
  rangeQuery?: string
}) {
  const rawParents = categories.filter((c) => !c.parent_id)
  const childrenByParent = new Map<string, Category[]>()
  for (const c of categories) {
    if (c.parent_id) {
      const list = childrenByParent.get(c.parent_id) ?? []
      list.push(c)
      childrenByParent.set(c.parent_id, list)
    }
  }

  function rollupStats(parent: Category): Stats {
    const own = stats.get(parent.id) ?? { count: 0, totalCents: 0 }
    const kids = (childrenByParent.get(parent.id) ?? []).reduce<Stats>(
      (acc, k) => {
        const s = stats.get(k.id) ?? { count: 0, totalCents: 0 }
        return { count: acc.count + s.count, totalCents: acc.totalCents + s.totalCents }
      },
      { count: 0, totalCents: 0 },
    )
    return {
      count: own.count + kids.count,
      totalCents: own.totalCents + kids.totalCents,
    }
  }

  // Group and sort: entradas first (value DESC), then saídas (value DESC).
  // Subcategories within each parent follow the same rule — biggest first.
  const parents = [...rawParents].sort((a, b) => {
    if (a.is_income !== b.is_income) return a.is_income ? -1 : 1
    return rollupStats(b).totalCents - rollupStats(a).totalCents
  })

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {parents.map((parent) => {
        const children = (childrenByParent.get(parent.id) ?? []).sort((a, b) => {
          const aT = (stats.get(a.id)?.totalCents ?? 0)
          const bT = (stats.get(b.id)?.totalCents ?? 0)
          if (aT !== bT) return bT - aT
          return a.sort_order - b.sort_order
        })
        const rolled = rollupStats(parent)
        const isIncome = parent.is_income

        const parentHref = rangeQuery
          ? `/app/categorias/${parent.id}?${rangeQuery}`
          : `/app/categorias/${parent.id}`

        return (
          <article
            key={parent.id}
            className="group flex flex-col gap-3 rounded-2xl border border-border bg-subtle p-4 transition-colors hover:border-muted"
          >
            <Link href={parentHref} className="block">
              <header className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                      isIncome ? "bg-income/15 text-income" : "bg-expense/15 text-expense"
                    }`}
                    aria-hidden
                  >
                    {isIncome ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                  </span>
                  <h2 className="flex items-center gap-1 text-sm font-medium text-strong">
                    {parent.name}
                    <ChevronRight className="h-3 w-3 text-muted transition-transform group-hover:translate-x-0.5" />
                  </h2>
                </div>
                <div className="text-right">
                  <p
                    className={`font-mono text-sm font-semibold tabular-nums ${
                      isIncome ? "text-income" : "text-strong"
                    }`}
                  >
                    {formatBRL(rolled.totalCents)}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted">
                    {rolled.count} {rolled.count === 1 ? "transação" : "transações"}
                  </p>
                </div>
              </header>
            </Link>

            {children.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {children.map((child) => {
                  const s = stats.get(child.id) ?? { count: 0, totalCents: 0 }
                  const hasActivity = s.count > 0
                  const childHref = rangeQuery
                    ? `/app/categorias/${child.id}?${rangeQuery}`
                    : `/app/categorias/${child.id}`
                  return (
                    <Link key={child.id} href={childHref}>
                      <Badge
                        variant={hasActivity ? "default" : "muted"}
                        className="cursor-pointer text-xs transition-colors hover:border-strong"
                        title={
                          hasActivity
                            ? `${s.count} tx · ${formatBRL(s.totalCents)}`
                            : "Abrir subcategoria"
                        }
                      >
                        {child.name}
                        {hasActivity && (
                          <span className="ml-1.5 font-mono tabular-nums text-muted">
                            {s.count}
                          </span>
                        )}
                      </Badge>
                    </Link>
                  )
                })}
              </div>
            )}

            {children.length === 0 && rolled.count === 0 && (
              <p className="text-xs text-muted">Sem subcategorias · sem transações ainda</p>
            )}
          </article>
        )
      })}
    </div>
  )
}
