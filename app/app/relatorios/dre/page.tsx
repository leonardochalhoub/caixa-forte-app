export const dynamic = "force-dynamic"
export const revalidate = 0

import { ArrowDown, ArrowUp, FileBarChart, TrendingDown, TrendingUp } from "lucide-react"
import { requireOnboardedUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { untyped } from "@/lib/supabase/untyped"
import { formatBRL } from "@/lib/money"
import { PrintActions } from "../conciliacao/_components/PrintActions"
import { DREPeriodSelector } from "./_components/DREPeriodSelector"

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
  is_formal_income: boolean | null
}

type AccountRow = {
  id: string
  name: string
  type: string
}

interface SearchParams {
  periodo?: string
}

function parsePeriod(p: string): {
  kind: "mensal" | "anual"
  label: string
  start: string
  end: string // exclusive
} {
  if (p.startsWith("anual:")) {
    const y = Number(p.slice(6))
    return {
      kind: "anual",
      label: `Ano ${y}`,
      start: `${y}-01-01`,
      end: `${y + 1}-01-01`,
    }
  }
  const ym = p.startsWith("mensal:") ? p.slice(7) : p
  const [yStr, mStr] = ym.split("-")
  const y = Number(yStr)
  const m = Number(mStr)
  const start = `${y}-${String(m).padStart(2, "0")}-01`
  const endMonth = m === 12 ? 1 : m + 1
  const endYear = m === 12 ? y + 1 : y
  const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`
  return {
    kind: "mensal",
    label: `${MONTH_NAMES_PT[m - 1]} ${y}`,
    start,
    end,
  }
}

export default async function DREPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requireOnboardedUser()
  const supabase = await createServerClient()
  const sp = await searchParams

  const now = new Date()
  const defaultPeriod = `mensal:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const periodStr = sp.periodo ?? defaultPeriod
  const period = parsePeriod(periodStr)

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
          "id, account_id, type, amount_cents, occurred_on, paid_at, merchant, is_transfer, category_id",
        )
        .eq("user_id", user.id)
        .gte("occurred_on", period.start)
        .lt("occurred_on", period.end),
      supabase
        .from("categories")
        .select("id, name, parent_id, is_income, is_formal_income")
        .eq("user_id", user.id),
      untyped(supabase)
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle(),
    ])

  const accs = (accounts ?? []) as AccountRow[]
  const txs = ((txsRaw ?? []) as Tx[])
    // Transferências não são receita nem despesa — só movimento interno
    .filter((t) => !t.is_transfer)
  const cats = (catsRaw ?? []) as CategoryRow[]
  const catById = new Map(cats.map((c) => [c.id, c]))
  const formalIncomeIds = new Set(
    cats.filter((c) => c.is_formal_income === true).map((c) => c.id),
  )

  // Separa receitas e despesas
  const incomes = txs.filter((t) => t.type === "income")
  const expenses = txs.filter((t) => t.type === "expense")

  // RECEITAS por categoria pai
  type IncomeGroup = {
    parentId: string
    parentName: string
    isFormal: boolean
    totalCents: number
    count: number
    children: Map<string, { id: string; name: string; cents: number; count: number }>
  }
  const receitas = new Map<string, IncomeGroup>()
  for (const t of incomes) {
    const cat = t.category_id ? catById.get(t.category_id) : null
    const parentId = cat?.parent_id ?? (cat ? cat.id : "__none__")
    const parent = cat?.parent_id ? catById.get(cat.parent_id) : cat
    const isFormal = Boolean(
      (cat?.is_formal_income === true) ||
        (parent && formalIncomeIds.has(parent.id)),
    )
    let g = receitas.get(parentId)
    if (!g) {
      g = {
        parentId,
        parentName: parent?.name ?? cat?.name ?? "Sem categoria",
        isFormal,
        totalCents: 0,
        count: 0,
        children: new Map(),
      }
      receitas.set(parentId, g)
    }
    const cents = Number(t.amount_cents)
    g.totalCents += cents
    g.count++
    if (cat?.parent_id) {
      const child = g.children.get(cat.id) ?? {
        id: cat.id,
        name: cat.name,
        cents: 0,
        count: 0,
      }
      child.cents += cents
      child.count++
      g.children.set(cat.id, child)
    }
  }

  // DESPESAS por categoria pai (com sub)
  type ExpenseGroup = {
    parentId: string
    parentName: string
    totalCents: number
    count: number
    children: Map<string, { id: string; name: string; cents: number; count: number }>
  }
  const despesas = new Map<string, ExpenseGroup>()
  for (const t of expenses) {
    const cat = t.category_id ? catById.get(t.category_id) : null
    const parentId = cat?.parent_id ?? (cat ? cat.id : "__none__")
    const parent = cat?.parent_id ? catById.get(cat.parent_id) : cat
    let g = despesas.get(parentId)
    if (!g) {
      g = {
        parentId,
        parentName: parent?.name ?? cat?.name ?? "Sem categoria",
        totalCents: 0,
        count: 0,
        children: new Map(),
      }
      despesas.set(parentId, g)
    }
    const cents = Number(t.amount_cents)
    g.totalCents += cents
    g.count++
    if (cat?.parent_id) {
      const child = g.children.get(cat.id) ?? {
        id: cat.id,
        name: cat.name,
        cents: 0,
        count: 0,
      }
      child.cents += cents
      child.count++
      g.children.set(cat.id, child)
    }
  }

  const receitasArr = [...receitas.values()].sort(
    (a, b) => b.totalCents - a.totalCents,
  )
  const despesasArr = [...despesas.values()].sort(
    (a, b) => b.totalCents - a.totalCents,
  )

  const receitaTrabalho = receitasArr
    .filter((r) => r.isFormal)
    .reduce((s, r) => s + r.totalCents, 0)
  const receitaCapital = receitasArr
    .filter((r) => !r.isFormal)
    .reduce((s, r) => s + r.totalCents, 0)

  // Headline "Receita total" = só receita operacional (trabalho), mesma
  // regra do hero/Home: capital (dividendos, cashback) é não-operacional
  // e entra separado pra não poluir a margem operacional.
  const receitaTotal = receitaTrabalho

  const despesaTotal = despesasArr.reduce((s, d) => s + d.totalCents, 0)
  const resultado = receitaTotal - despesaTotal
  const margem = receitaTotal > 0 ? (resultado / receitaTotal) * 100 : 0
  const resultadoLiquido = resultado + receitaCapital

  // Meses disponíveis
  const activeMonths = new Set<string>()
  const activeYears = new Set<number>()
  const { data: allTxsForPeriods } = await untyped(supabase)
    .from("transactions")
    .select("occurred_on")
    .eq("user_id", user.id)
  for (const t of (allTxsForPeriods ?? []) as { occurred_on: string }[]) {
    activeMonths.add(t.occurred_on.slice(0, 7))
    activeYears.add(Number(t.occurred_on.slice(0, 4)))
  }
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  activeMonths.add(currentYm)
  activeYears.add(now.getFullYear())

  const periodOptions = [...activeMonths]
    .sort()
    .reverse()
    .map((ym) => {
      const [yStr, mStr] = ym.split("-")
      const y = Number(yStr)
      const m = Number(mStr)
      return {
        value: `mensal:${ym}`,
        label: `${MONTH_NAMES_PT[m - 1]} ${y}`,
      }
    })
  const yearOptions = [...activeYears]
    .sort((a, b) => b - a)
    .map((y) => ({ value: `anual:${y}`, label: `Ano ${y}` }))

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
    ["DRE · " + period.label],
    [],
    ["RECEITAS"],
    ["  Rendimentos do Trabalho", receitaTrabalho / 100],
    ...receitasArr
      .filter((r) => r.isFormal)
      .flatMap((r) => [
        [`    ${r.parentName}`, r.totalCents / 100, r.count],
        ...[...r.children.values()].map((c) => [
          `      ${c.name}`,
          c.cents / 100,
          c.count,
        ]),
      ]),
    ["  Rendimentos de Capital e Outros", receitaCapital / 100],
    ...receitasArr
      .filter((r) => !r.isFormal)
      .flatMap((r) => [
        [`    ${r.parentName}`, r.totalCents / 100, r.count],
        ...[...r.children.values()].map((c) => [
          `      ${c.name}`,
          c.cents / 100,
          c.count,
        ]),
      ]),
    ["TOTAL RECEITAS", receitaTotal / 100],
    [],
    ["DESPESAS"],
    ...despesasArr.flatMap((d) => [
      [`  ${d.parentName}`, d.totalCents / 100, d.count],
      ...[...d.children.values()]
        .sort((a, b) => b.cents - a.cents)
        .map((c) => [`    ${c.name}`, c.cents / 100, c.count]),
    ]),
    ["TOTAL DESPESAS", despesaTotal / 100],
    [],
    ["RESULTADO DO PERÍODO", resultado / 100],
    ["Margem (%)", Number(margem.toFixed(2))],
  ]

  return (
    <article className="report-root space-y-8">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <DREPeriodSelector
          current={periodStr}
          months={periodOptions}
          years={yearOptions}
        />
        <PrintActions
          rows={xlsxRows}
          filename={`dre-${periodStr.replace(":", "-")}.xlsx`}
          sheetName={period.label}
        />
      </div>

      <header className="space-y-1 border-b border-border pb-4">
        <p className="text-xs uppercase tracking-[0.22em] text-muted">
          Demonstração de Resultado do Exercício
        </p>
        <h1 className="flex items-center gap-2 font-serif text-3xl text-strong">
          <FileBarChart className="h-6 w-6" />
          {period.label}
        </h1>
        <p className="text-xs text-muted">
          {txs.length} lançamentos · Gerado em {generatedAt} · {displayName}
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <StatCard
          icon={<ArrowUp className="h-4 w-4 text-income" />}
          label="Receita total"
          value={formatBRL(receitaTotal)}
          sub={`${incomes.length} entradas`}
          tone="income"
        />
        <StatCard
          icon={<ArrowDown className="h-4 w-4 text-expense" />}
          label="Despesa total"
          value={formatBRL(despesaTotal)}
          sub={`${expenses.length} saídas`}
          tone="expense"
        />
        <StatCard
          icon={
            resultado >= 0 ? (
              <TrendingUp className="h-4 w-4 text-income" />
            ) : (
              <TrendingDown className="h-4 w-4 text-expense" />
            )
          }
          label={resultado >= 0 ? "Superávit" : "Déficit"}
          value={formatBRL(resultado)}
          sub={`margem ${margem.toFixed(1)}%`}
          tone={resultado >= 0 ? "income" : "expense"}
        />
      </section>

      {/* RECEITAS */}
      <section className="avoid-break space-y-3 rounded-2xl border-2 border-border p-5">
        <h2 className="font-serif text-xl text-strong">RECEITAS</h2>

        <div className="space-y-3">
          <SubTotal label="Rendimentos do Trabalho" total={receitaTrabalho} />
          {receitasArr
            .filter((r) => r.isFormal)
            .map((r) => (
              <Group key={r.parentId} name={r.parentName} group={r} tone="income" />
            ))}
        </div>

        <div className="space-y-3 pt-3">
          <SubTotal label="Rendimentos de Capital e Outros" total={receitaCapital} />
          {receitasArr.filter((r) => !r.isFormal).length === 0 ? (
            <p className="pl-4 text-xs italic text-muted">
              Sem rendimentos de capital no período.
            </p>
          ) : (
            receitasArr
              .filter((r) => !r.isFormal)
              .map((r) => (
                <Group
                  key={r.parentId}
                  name={r.parentName}
                  group={r}
                  tone="income"
                />
              ))
          )}
        </div>

        <div className="flex items-baseline justify-between border-t-2 border-border pt-3">
          <span className="text-sm font-semibold uppercase tracking-wider text-strong">
            Total de Receitas
          </span>
          <span className="font-mono text-xl font-bold tabular-nums text-income">
            {formatBRL(receitaTotal)}
          </span>
        </div>
      </section>

      {/* DESPESAS */}
      <section className="avoid-break space-y-3 rounded-2xl border-2 border-border p-5">
        <h2 className="font-serif text-xl text-strong">DESPESAS</h2>

        {despesasArr.length === 0 ? (
          <p className="pl-4 text-xs italic text-muted">
            Sem despesas no período.
          </p>
        ) : (
          <div className="space-y-3">
            {despesasArr.map((d) => (
              <Group
                key={d.parentId}
                name={d.parentName}
                group={d}
                tone="expense"
              />
            ))}
          </div>
        )}

        <div className="flex items-baseline justify-between border-t-2 border-border pt-3">
          <span className="text-sm font-semibold uppercase tracking-wider text-strong">
            Total de Despesas
          </span>
          <span className="font-mono text-xl font-bold tabular-nums text-expense">
            − {formatBRL(despesaTotal)}
          </span>
        </div>
      </section>

      {/* RESULTADO */}
      <section className="avoid-break space-y-3 rounded-2xl border-2 border-border bg-subtle p-5">
        <h2 className="text-sm font-medium uppercase tracking-wider text-strong">
          Resultado do período
        </h2>
        <div className="flex items-baseline justify-between">
          <span className="font-serif text-lg text-body">
            {resultado >= 0 ? "Superávit" : "Déficit"} do período
          </span>
          <span
            className={`font-mono text-3xl font-bold tabular-nums ${
              resultado >= 0 ? "text-income" : "text-expense"
            }`}
          >
            {formatBRL(resultado)}
          </span>
        </div>
        <p className="text-xs text-body">
          Receitas{" "}
          <span className="font-mono text-income">{formatBRL(receitaTotal)}</span>{" "}
          − Despesas{" "}
          <span className="font-mono text-expense">{formatBRL(despesaTotal)}</span>{" "}
          ={" "}
          <span
            className={`font-mono font-semibold ${
              resultado >= 0 ? "text-income" : "text-expense"
            }`}
          >
            {formatBRL(resultado)}
          </span>{" "}
          · margem {margem.toFixed(1)}%
        </p>
      </section>

      <footer className="border-t border-border pt-4 text-[10px] text-muted">
        Caixa Forte · DRE · Regime: caixa (reconhece quando ocorre). Transferências
        entre contas ficam fora. Esta demonstração mostra a PERFORMANCE
        financeira do período; o Balanço Contábil mostra a POSIÇÃO no final
        dele. Ambos são complementares.
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

function SubTotal({ label, total }: { label: string; total: number }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border pb-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-strong">
        {label}
      </span>
      <span className="font-mono text-sm font-semibold tabular-nums text-strong">
        {formatBRL(total)}
      </span>
    </div>
  )
}

function Group({
  name,
  group,
  tone,
}: {
  name: string
  group: {
    totalCents: number
    count: number
    children: Map<string, { id: string; name: string; cents: number; count: number }>
  }
  tone: "income" | "expense"
}) {
  const amountColor = tone === "income" ? "text-income" : "text-expense"
  const sign = tone === "income" ? "+" : "−"
  return (
    <div className="space-y-1 pl-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-body">
          {name}{" "}
          <span className="text-[10px] text-muted">
            · {group.count} lançamento{group.count === 1 ? "" : "s"}
          </span>
        </span>
        <span className={`font-mono font-semibold tabular-nums ${amountColor}`}>
          {sign} {formatBRL(group.totalCents)}
        </span>
      </div>
      {group.children.size > 0 && (
        <ul className="space-y-0.5 pl-4">
          {[...group.children.values()]
            .sort((a, b) => b.cents - a.cents)
            .map((c) => (
              <li
                key={c.id}
                className="flex items-baseline justify-between text-[11px] text-muted"
              >
                <span>↳ {c.name}</span>
                <span className="font-mono tabular-nums">{formatBRL(c.cents)}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
