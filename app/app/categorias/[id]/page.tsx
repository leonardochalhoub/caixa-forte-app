import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowDown, ArrowLeft, ArrowUp, Pencil } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requireOnboardedUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { formatBRL } from "@/lib/money"
import { currentMonthRange, todayIsoDate, formatPtBrDateShort } from "@/lib/time"
import { lastNMonthSlots } from "@/lib/analytics/periods"

export const dynamic = "force-dynamic"

interface Range {
  start: string
  end: string
  label: string
  query: string
}

function endOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map((x) => parseInt(x, 10))
  if (!y || !m) return ym + "-01"
  const nextStart = m === 12 ? new Date(y + 1, 0, 1) : new Date(y, m, 1)
  const end = new Date(nextStart.getTime() - 86_400_000)
  return end.toISOString().slice(0, 10)
}

function resolveRange(p: {
  period?: string
  from?: string
  to?: string
}): Range {
  const today = todayIsoDate()
  const q = new URLSearchParams()
  if (p.from && p.to && /^\d{4}-\d{2}$/.test(p.from) && /^\d{4}-\d{2}$/.test(p.to)) {
    const a = p.from <= p.to ? p.from : p.to
    const b = p.from <= p.to ? p.to : p.from
    q.set("from", a)
    q.set("to", b)
    return {
      start: `${a}-01`,
      end: endOfMonth(b),
      label: `${formatPtBrDateShort(`${a}-01`)} → ${formatPtBrDateShort(endOfMonth(b))}`,
      query: q.toString(),
    }
  }
  if (p.period === "6m") {
    const slots = lastNMonthSlots(6)
    q.set("period", "6m")
    return {
      start: slots[0]!.start,
      end: today,
      label: `Últimos 6 meses`,
      query: q.toString(),
    }
  }
  if (p.period === "12m") {
    const slots = lastNMonthSlots(12)
    q.set("period", "12m")
    return {
      start: slots[0]!.start,
      end: today,
      label: `Últimos 12 meses`,
      query: q.toString(),
    }
  }
  if (p.period === "all") {
    q.set("period", "all")
    return {
      start: "1970-01-01",
      end: "9999-12-31",
      label: "Todo o histórico",
      query: q.toString(),
    }
  }
  const { start, end } = currentMonthRange()
  return {
    start,
    end,
    label: `Este mês · ${formatPtBrDateShort(start)} → hoje`,
    query: "",
  }
}

export default async function CategoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}) {
  const [{ id }, searchP] = await Promise.all([params, searchParams])
  const user = await requireOnboardedUser()
  const supabase = await createServerClient()
  const range = resolveRange(searchP)

  const [{ data: category }, { data: allCategories }, { data: accounts }] =
    await Promise.all([
      supabase
        .from("categories")
        .select("id, name, parent_id, is_income, is_formal_income")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("categories")
        .select("id, name, parent_id, is_income")
        .eq("user_id", user.id)
        .is("archived_at", null),
      supabase
        .from("accounts")
        .select("id, name, type")
        .eq("user_id", user.id)
        .is("archived_at", null),
    ])

  if (!category) notFound()

  // Collect this category + all its descendants so a click on "Renda"
  // surfaces transactions from Renda itself AND Salário / Investimentos.
  const childrenOf = new Map<string, string[]>()
  for (const c of allCategories ?? []) {
    if (!c.parent_id) continue
    const list = childrenOf.get(c.parent_id) ?? []
    list.push(c.id)
    childrenOf.set(c.parent_id, list)
  }
  const includedIds = new Set<string>([category.id])
  const queue = [category.id]
  while (queue.length > 0) {
    const head = queue.shift()!
    for (const child of childrenOf.get(head) ?? []) {
      if (!includedIds.has(child)) {
        includedIds.add(child)
        queue.push(child)
      }
    }
  }

  const { data: transactions } = await supabase
    .from("transactions")
    .select(
      "id, type, amount_cents, occurred_on, merchant, note, account_id, category_id, is_transfer, created_at",
    )
    .eq("user_id", user.id)
    .in("category_id", Array.from(includedIds))
    .gte("occurred_on", range.start)
    .lte("occurred_on", range.end)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })

  const accountMap = new Map((accounts ?? []).map((a) => [a.id, a.name]))
  const catMap = new Map(
    (allCategories ?? []).map((c) => [c.id, { name: c.name, parent_id: c.parent_id }]),
  )
  function catLabel(catId: string | null): string {
    if (!catId) return "sem categoria"
    const c = catMap.get(catId)
    if (!c) return "sem categoria"
    if (c.parent_id) {
      const parent = catMap.get(c.parent_id)
      return parent ? `${parent.name} > ${c.name}` : c.name
    }
    return c.name
  }

  const nonTransfer = (transactions ?? []).filter((t) => !t.is_transfer)
  const totalCents = nonTransfer.reduce((s, t) => s + Number(t.amount_cents), 0)
  const isIncome = category.is_income
  const parentName = category.parent_id
    ? catMap.get(category.parent_id)?.name ?? null
    : null

  const backHref = range.query
    ? `/app/categorias?${range.query}`
    : "/app/categorias"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Link
            href={backHref}
            className="flex items-center gap-1 text-xs text-muted hover:text-strong"
          >
            <ArrowLeft className="h-3 w-3" />
            Voltar para Categorias
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-strong">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                isIncome ? "bg-income/15 text-income" : "bg-expense/15 text-expense"
              }`}
              aria-hidden
            >
              {isIncome ? (
                <ArrowUp className="h-4 w-4" />
              ) : (
                <ArrowDown className="h-4 w-4" />
              )}
            </span>
            {parentName ? `${parentName} > ${category.name}` : category.name}
          </h1>
          <p className="text-xs text-muted">{range.label}</p>
        </div>
        <div className="text-right">
          <p
            className={`font-mono text-2xl font-semibold tabular-nums tracking-tight ${
              isIncome ? "text-income" : "text-strong"
            }`}
          >
            {formatBRL(totalCents)}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-muted">
            {nonTransfer.length} {nonTransfer.length === 1 ? "transação" : "transações"}
          </p>
        </div>
      </div>

      {nonTransfer.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted">
            Nenhuma transação nesta categoria dentro do período selecionado.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-2.5">Data</th>
                  <th className="px-4 py-2.5">Estabelecimento / nota</th>
                  <th className="px-4 py-2.5">Categoria</th>
                  <th className="px-4 py-2.5">Conta</th>
                  <th className="px-4 py-2.5 text-right">Valor</th>
                  <th className="px-4 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {nonTransfer.map((tx) => (
                  <tr key={tx.id} className="text-body">
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-muted">
                      {formatPtBrDateShort(tx.occurred_on)}
                    </td>
                    <td className="px-4 py-2">
                      <p className="text-strong">{tx.merchant ?? "—"}</p>
                      {tx.note && (
                        <p className="text-[11px] text-muted">{tx.note}</p>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant="muted" className="text-[10px]">
                        {catLabel(tx.category_id)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-[11px] text-muted">
                      {accountMap.get(tx.account_id) ?? "—"}
                    </td>
                    <td
                      className={`whitespace-nowrap px-4 py-2 text-right font-mono tabular-nums ${
                        tx.type === "income" ? "text-income" : "text-expense"
                      }`}
                    >
                      {tx.type === "income" ? "+" : "−"} {formatBRL(tx.amount_cents)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/app/transacoes/${tx.id}`}>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 px-2 text-xs"
                        >
                          <Pencil className="h-3 w-3" />
                          Editar
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
