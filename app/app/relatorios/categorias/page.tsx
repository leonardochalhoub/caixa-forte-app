export const dynamic = "force-dynamic"
export const revalidate = 0

import { Tags } from "lucide-react"
import { requireOnboardedUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { formatBRL } from "@/lib/money"
import { PeriodSelector } from "../conciliacao/_components/PeriodSelector"
import { PrintActions } from "../conciliacao/_components/PrintActions"

const MONTH_NAMES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
]

type Tx = {
  id: string
  account_id: string
  type: "income" | "expense"
  amount_cents: number
  occurred_on: string
  paid_at: string | null
  merchant: string | null
  is_transfer: boolean | null
  category_id: string | null
}

type CategoryRow = {
  id: string
  name: string
  parent_id: string | null
  is_income: boolean
}

function monthBounds(ym: string): { start: string; end: string; label: string } {
  const [yStr, mStr] = ym.split("-")
  const y = Number(yStr)
  const m = Number(mStr)
  const start = `${y}-${String(m).padStart(2, "0")}-01`
  const nextMonth =
    m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`
  return {
    start,
    end: nextMonth,
    label: `${MONTH_NAMES_PT[m - 1]} ${y}`,
  }
}

interface SearchParams {
  periodo?: string
}

export default async function CategoriasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requireOnboardedUser()
  const supabase = await createServerClient()
  const sp = await searchParams

  const now = new Date()
  const defaultYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const periodo = sp.periodo ?? defaultYm
  const isFullHistory = periodo === "tudo"

  const [{ data: accounts }, { data: txsRaw }, { data: catsRaw }, { data: profileRaw }] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id, type")
        .eq("user_id", user.id)
        .is("archived_at", null),
      supabase
        .from("transactions")
        .select(
          "id, account_id, type, amount_cents, occurred_on, paid_at, merchant, is_transfer, category_id",
        )
        .eq("user_id", user.id),
      supabase
        .from("categories")
        .select("id, name, parent_id, is_income")
        .eq("user_id", user.id),
      supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle(),
    ])

  const creditAccountIds = new Set(
    (accounts ?? [])
      .filter((a) => a.type === "credit")
      .map((a) => a.id),
  )
  const cats = (catsRaw ?? []) as CategoryRow[]
  const catById = new Map(cats.map((c) => [c.id, c]))

  let periodStart: string | null = null
  let periodEnd: string | null = null
  let periodLabel = "Histórico completo"
  if (!isFullHistory) {
    const b = monthBounds(periodo)
    periodStart = b.start
    periodEnd = b.end
    periodLabel = b.label
  }

  const inPeriod = (t: Tx) => {
    if (isFullHistory) return true
    return t.occurred_on >= periodStart! && t.occurred_on < periodEnd!
  }

  const txs = ((txsRaw ?? []) as Tx[])
    .filter((t) => !creditAccountIds.has(t.account_id))
    .filter((t) => !t.is_transfer)
    .filter((t) => t.type === "expense")
    .filter(inPeriod)

  // Agrupa por categoria (subcategoria some no parent)
  type CatAgg = {
    parentId: string
    parentName: string
    totalCents: number
    count: number
    children: Map<string, { id: string; name: string; cents: number; count: number }>
  }
  const byParent = new Map<string, CatAgg>()

  for (const t of txs) {
    const cat = t.category_id ? catById.get(t.category_id) : null
    const parentId = cat?.parent_id ?? (cat ? cat.id : "__none__")
    const parentName = cat?.parent_id
      ? catById.get(cat.parent_id)?.name ?? "Sem categoria"
      : cat?.name ?? "Sem categoria"

    let agg = byParent.get(parentId)
    if (!agg) {
      agg = {
        parentId,
        parentName,
        totalCents: 0,
        count: 0,
        children: new Map(),
      }
      byParent.set(parentId, agg)
    }
    const cents = Number(t.amount_cents)
    agg.totalCents += cents
    agg.count++

    // Se a tx era subcategoria, registra dentro
    if (cat?.parent_id) {
      const child = agg.children.get(cat.id) ?? {
        id: cat.id,
        name: cat.name,
        cents: 0,
        count: 0,
      }
      child.cents += cents
      child.count++
      agg.children.set(cat.id, child)
    }
  }

  const categorias = [...byParent.values()].sort((a, b) => b.totalCents - a.totalCents)
  const grandTotal = categorias.reduce((s, c) => s + c.totalCents, 0)
  const maxBar = categorias[0]?.totalCents ?? 0

  // Meses disponíveis
  const monthsWithExpense = new Set<string>()
  for (const t of (txsRaw ?? []) as Tx[]) {
    if (creditAccountIds.has(t.account_id)) continue
    if (t.is_transfer || t.type !== "expense") continue
    monthsWithExpense.add(t.occurred_on.slice(0, 7))
  }
  monthsWithExpense.add(defaultYm)
  const availableMonths = [...monthsWithExpense]
    .sort()
    .reverse()
    .map((ym) => {
      const [yStr, mStr] = ym.split("-")
      const y = Number(yStr)
      const m = Number(mStr)
      return { value: ym, label: `${MONTH_NAMES_PT[m - 1]} ${y}` }
    })

  const displayName =
    (profileRaw as { display_name?: string | null } | null)?.display_name ??
    (user.user_metadata as { display_name?: string; full_name?: string } | null)
      ?.display_name ??
    user.email ??
    ""
  const generatedAt = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  })

  const xlsxRows: (string | number)[][] = [
    ["Categoria", "Subcategoria", "Total", "# tx", "% do total"],
    ...categorias.flatMap((c) => {
      const rows: (string | number)[][] = [
        [
          c.parentName,
          "—",
          c.totalCents / 100,
          c.count,
          grandTotal > 0 ? (c.totalCents / grandTotal) * 100 : 0,
        ],
      ]
      for (const child of [...c.children.values()].sort(
        (a, b) => b.cents - a.cents,
      )) {
        rows.push([
          c.parentName,
          child.name,
          child.cents / 100,
          child.count,
          grandTotal > 0 ? (child.cents / grandTotal) * 100 : 0,
        ])
      }
      return rows
    }),
    [],
    ["TOTAL", "", grandTotal / 100, txs.length, 100],
  ]

  return (
    <article className="report-root space-y-8">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector
          current={periodo}
          options={availableMonths}
          fullHistoryLabel="Histórico completo"
        />
        <PrintActions
          rows={xlsxRows}
          filename={`gastos-categoria-${isFullHistory ? "historico" : periodo}.xlsx`}
          sheetName={isFullHistory ? "Histórico" : periodLabel}
        />
      </div>

      <header className="space-y-1 border-b border-border pb-4">
        <p className="text-xs uppercase tracking-[0.22em] text-muted">
          Relatório de Gastos por Categoria
        </p>
        <h1 className="flex items-center gap-2 font-serif text-3xl text-strong">
          <Tags className="h-6 w-6" />
          {periodLabel}
        </h1>
        <p className="text-xs text-muted">
          {txs.length} lançamentos · Total {formatBRL(grandTotal)} · Gerado em{" "}
          {generatedAt} · {displayName}
        </p>
      </header>

      {categorias.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">
          Sem gastos registrados no período.
        </p>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-strong">
            Ranking de categorias
          </h2>
          <ul className="space-y-2">
            {categorias.map((c, idx) => {
              const pct = grandTotal > 0 ? (c.totalCents / grandTotal) * 100 : 0
              const barPct = maxBar > 0 ? (c.totalCents / maxBar) * 100 : 0
              return (
                <li
                  key={c.parentId}
                  className="avoid-break rounded-xl border border-border p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-subtle text-[10px] font-semibold tabular-nums text-strong">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-medium text-strong">
                          {c.parentName}
                        </p>
                        <p className="font-mono text-base font-semibold tabular-nums text-expense">
                          − {formatBRL(c.totalCents)}
                        </p>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted">
                        <span>
                          {c.count} lançamento{c.count === 1 ? "" : "s"}
                        </span>
                        <span className="font-mono tabular-nums">
                          {pct.toFixed(1)}% do total
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-expense/10">
                        <div
                          className="h-full rounded-full bg-expense"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  {c.children.size > 0 && (
                    <ul className="mt-3 space-y-1 border-t border-border pt-2 text-xs">
                      {[...c.children.values()]
                        .sort((a, b) => b.cents - a.cents)
                        .map((child) => (
                          <li
                            key={child.id}
                            className="flex items-center justify-between gap-3 text-body"
                          >
                            <span className="flex items-center gap-1.5">
                              <span className="text-muted">↳</span>
                              {child.name}
                              <span className="text-[10px] text-muted">
                                · {child.count}
                              </span>
                            </span>
                            <span className="font-mono tabular-nums text-expense">
                              {formatBRL(child.cents)}
                            </span>
                          </li>
                        ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <footer className="border-t border-border pt-4 text-[10px] text-muted">
        Caixa Forte · gastos por categoria · Valores em BRL · Inclui despesas
        pagas e agendadas; exclui cartão de crédito e transferências.
      </footer>
    </article>
  )
}
