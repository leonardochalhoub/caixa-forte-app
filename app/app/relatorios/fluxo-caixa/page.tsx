export const dynamic = "force-dynamic"
export const revalidate = 0

import { ArrowDown, ArrowUp, TrendingDown, TrendingUp } from "lucide-react"
import { requireOnboardedUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { untyped } from "@/lib/supabase/untyped"
import { formatBRL } from "@/lib/money"
import { formatInSaoPaulo } from "@/lib/time"
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
  created_at: string
  merchant: string | null
  is_transfer: boolean | null
  category_id: string | null
}

function monthKey(d: string): string {
  return d.slice(0, 7)
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number)
  return `${MONTH_NAMES_PT[(m ?? 1) - 1]} ${y}`
}

export default async function FluxoCaixaPage() {
  const user = await requireOnboardedUser()
  const supabase = await createServerClient()

  const [{ data: accounts }, { data: txsRaw }, { data: catsRaw }, { data: profileRaw }] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id, name, type")
        .eq("user_id", user.id)
        .is("archived_at", null),
      untyped(supabase)
        .from("transactions")
        .select(
          "id, account_id, type, amount_cents, occurred_on, paid_at, created_at, merchant, is_transfer, category_id",
        )
        .eq("user_id", user.id)
        .order("occurred_on", { ascending: true }),
      supabase
        .from("categories")
        .select("id, name, is_formal_income")
        .eq("user_id", user.id),
      untyped(supabase)
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
  const formalIncomeIds = new Set(
    (catsRaw ?? [])
      .filter((c) => c.is_formal_income === true)
      .map((c) => c.id),
  )
  const catById = new Map((catsRaw ?? []).map((c) => [c.id, c.name]))
  const allTxs = ((txsRaw ?? []) as Tx[])
    .filter((t) => !creditAccountIds.has(t.account_id))
    .filter((t) => !t.is_transfer)

  // Agrupa por mês
  type MonthBucket = {
    key: string
    label: string
    incomeCents: number
    expenseCents: number
    netCents: number
    incomeCount: number
    expenseCount: number
    topExpenseCategory: { name: string; cents: number } | null
    topIncomeSource: { merchant: string; cents: number } | null
  }
  const byMonth = new Map<string, MonthBucket>()
  for (const t of allTxs) {
    const k = monthKey(t.occurred_on)
    let b = byMonth.get(k)
    if (!b) {
      b = {
        key: k,
        label: monthLabel(k),
        incomeCents: 0,
        expenseCents: 0,
        netCents: 0,
        incomeCount: 0,
        expenseCount: 0,
        topExpenseCategory: null,
        topIncomeSource: null,
      }
      byMonth.set(k, b)
    }
    const cents = Number(t.amount_cents)
    if (t.type === "income") {
      // Só renda formal (salário etc) entra no KPI "Entrada"
      if (t.category_id && formalIncomeIds.has(t.category_id)) {
        b.incomeCents += cents
        b.incomeCount++
        if (!b.topIncomeSource || cents > b.topIncomeSource.cents) {
          b.topIncomeSource = { merchant: t.merchant ?? "Entrada", cents }
        }
      }
    } else {
      b.expenseCents += cents
      b.expenseCount++
    }
    b.netCents = b.incomeCents - b.expenseCents
  }

  // Top categoria por mês (despesas)
  const expenseByMonthCategory = new Map<string, Map<string, number>>()
  for (const t of allTxs) {
    if (t.type !== "expense") continue
    if (!t.category_id) continue
    const k = monthKey(t.occurred_on)
    let inner = expenseByMonthCategory.get(k)
    if (!inner) {
      inner = new Map()
      expenseByMonthCategory.set(k, inner)
    }
    inner.set(
      t.category_id,
      (inner.get(t.category_id) ?? 0) + Number(t.amount_cents),
    )
  }
  for (const [k, inner] of expenseByMonthCategory) {
    const b = byMonth.get(k)
    if (!b) continue
    let top: { name: string; cents: number } | null = null
    for (const [catId, cents] of inner) {
      if (!top || cents > top.cents) {
        top = { name: catById.get(catId) ?? "Sem categoria", cents }
      }
    }
    b.topExpenseCategory = top
  }

  const months = [...byMonth.values()].sort((a, b) =>
    a.key < b.key ? 1 : -1,
  )
  const grandIncome = months.reduce((s, m) => s + m.incomeCents, 0)
  const grandExpense = months.reduce((s, m) => s + m.expenseCents, 0)
  const grandNet = grandIncome - grandExpense
  const avgMonthlyNet = months.length > 0 ? Math.round(grandNet / months.length) : 0

  // Máximo pra escalar as barras
  const maxBarCents = months.reduce(
    (m, b) => Math.max(m, Math.max(b.incomeCents, b.expenseCents)),
    0,
  )

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
    ["Mês", "Entradas", "Saídas", "Saldo do mês", "# entradas", "# saídas", "Top categoria (saída)", "Top entrada"],
    ...months.map((m) => [
      m.label,
      m.incomeCents / 100,
      m.expenseCents / 100,
      m.netCents / 100,
      m.incomeCount,
      m.expenseCount,
      m.topExpenseCategory?.name ?? "—",
      m.topIncomeSource?.merchant ?? "—",
    ]),
    [],
    ["TOTAL", grandIncome / 100, grandExpense / 100, grandNet / 100, "", "", "", ""],
    ["Média mensal", "", "", avgMonthlyNet / 100, "", "", "", ""],
  ]

  return (
    <article className="report-root space-y-8">
      <div className="no-print flex flex-wrap items-center justify-end gap-3">
        <PrintActions
          rows={xlsxRows}
          filename="fluxo-caixa.xlsx"
          sheetName="Fluxo de caixa"
        />
      </div>

      <header className="space-y-1 border-b border-border pb-4">
        <p className="text-xs uppercase tracking-[0.22em] text-muted">
          Relatório de Fluxo de Caixa
        </p>
        <h1 className="font-serif text-3xl text-strong">
          {months.length > 0
            ? `${months[months.length - 1]!.label} → ${months[0]!.label}`
            : "Sem dados"}
        </h1>
        <p className="text-xs text-muted">
          {months.length} meses com atividade · Gerado em {generatedAt} ·{" "}
          {displayName}
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <StatCard
          icon={<ArrowUp className="h-4 w-4 text-income" />}
          label="Entradas totais"
          value={formatBRL(grandIncome)}
          sub={`${months.reduce((s, m) => s + m.incomeCount, 0)} lançamentos`}
        />
        <StatCard
          icon={<ArrowDown className="h-4 w-4 text-expense" />}
          label="Saídas totais"
          value={formatBRL(grandExpense)}
          sub={`${months.reduce((s, m) => s + m.expenseCount, 0)} lançamentos`}
        />
        <StatCard
          icon={
            grandNet >= 0 ? (
              <TrendingUp className="h-4 w-4 text-income" />
            ) : (
              <TrendingDown className="h-4 w-4 text-expense" />
            )
          }
          label="Saldo acumulado"
          value={formatBRL(grandNet)}
          sub={`média ${formatBRL(avgMonthlyNet)}/mês`}
          tone={grandNet >= 0 ? "income" : "expense"}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-strong">
          Mês a mês
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <colgroup>
              <col style={{ width: "20%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "28%" }} />
            </colgroup>
            <thead className="bg-subtle text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Mês</th>
                <th className="px-3 py-2 text-right">
                  <span className="inline-flex items-center justify-end gap-1">
                    <ArrowUp className="h-3 w-3 text-income" />
                    Entradas
                  </span>
                </th>
                <th className="px-3 py-2 text-right">
                  <span className="inline-flex items-center justify-end gap-1">
                    <ArrowDown className="h-3 w-3 text-expense" />
                    Saídas
                  </span>
                </th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2 text-left">Categoria que mais pesou</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const netColor =
                  m.netCents > 0
                    ? "text-income"
                    : m.netCents < 0
                      ? "text-expense"
                      : "text-strong"
                const inPct = maxBarCents > 0 ? (m.incomeCents / maxBarCents) * 100 : 0
                const outPct =
                  maxBarCents > 0 ? (m.expenseCents / maxBarCents) * 100 : 0
                return (
                  <tr
                    key={m.key}
                    className="border-t border-border align-middle"
                  >
                    <td className="px-3 py-2 font-medium text-strong">
                      {m.label}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-mono tabular-nums text-income">
                          {m.incomeCents > 0 ? `+ ${formatBRL(m.incomeCents)}` : "—"}
                        </span>
                        <div className="h-1 w-full max-w-[120px] rounded-full bg-income/15">
                          <div
                            className="h-full rounded-full bg-income"
                            style={{ width: `${inPct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-mono tabular-nums text-expense">
                          {m.expenseCents > 0 ? `− ${formatBRL(m.expenseCents)}` : "—"}
                        </span>
                        <div className="h-1 w-full max-w-[120px] rounded-full bg-expense/15">
                          <div
                            className="h-full rounded-full bg-expense"
                            style={{ width: `${outPct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono font-semibold tabular-nums ${netColor}`}
                    >
                      {formatBRL(m.netCents)}
                    </td>
                    <td className="px-3 py-2 text-xs text-body">
                      {m.topExpenseCategory ? (
                        <>
                          {m.topExpenseCategory.name}{" "}
                          <span className="font-mono text-muted">
                            {formatBRL(m.topExpenseCategory.cents)}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-subtle">
              <tr className="border-t-2 border-border">
                <td className="px-3 py-2 text-sm font-semibold uppercase tracking-wider text-strong">
                  Total
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-income">
                  + {formatBRL(grandIncome)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-expense">
                  − {formatBRL(grandExpense)}
                </td>
                <td
                  className={`px-3 py-2 text-right font-mono font-semibold tabular-nums ${
                    grandNet >= 0 ? "text-income" : "text-expense"
                  }`}
                >
                  {formatBRL(grandNet)}
                </td>
                <td className="px-3 py-2 text-xs text-muted">
                  média {formatBRL(avgMonthlyNet)}/mês
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <footer className="border-t border-border pt-4 text-[10px] text-muted">
        Caixa Forte · fluxo de caixa · Valores em BRL · Transações de cartão de
        crédito e transferências entre contas ficam fora. Renda formal
        (salário, pró-labore etc) compõe &ldquo;Entradas&rdquo;.
      </footer>
    </article>
  )
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  tone?: "income" | "expense"
}) {
  const color =
    tone === "income"
      ? "text-income"
      : tone === "expense"
        ? "text-expense"
        : "text-strong"
  return (
    <div className="avoid-break space-y-1 rounded-xl border border-border bg-canvas/50 p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
        {icon}
        {label}
      </div>
      <p className={`font-mono text-2xl font-semibold tabular-nums ${color}`}>
        {value}
      </p>
      <p className="text-[11px] text-muted">{sub}</p>
    </div>
  )
}
