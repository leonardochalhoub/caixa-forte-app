export const dynamic = "force-dynamic"
export const revalidate = 0

import { ArrowDown, ArrowUp, FileBarChart, TrendingDown, TrendingUp } from "lucide-react"
import { requireOnboardedUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { formatBRL } from "@/lib/money"
import { PrintActions } from "../conciliacao/_components/PrintActions"
import { DREPeriodSelector } from "./_components/DREPeriodSelector"
import {
  buildAvailablePeriods,
  buildDREXlsxRows,
  buildExpenseGroups,
  buildIncomeGroups,
  computeTotals,
  filterDREEffectiveTxs,
  getCreditAccountIds,
  getFormalIncomeIds,
  parsePeriod,
  resolveDisplayName,
} from "@/lib/reports/dre-helpers"
import { fetchAllOccurredOn, fetchDREData } from "@/lib/reports/dre-queries"
import type { SearchParams } from "@/lib/reports/dre-types"

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

  const { accounts: accs, txsRaw, catsRaw, profileRaw } = await fetchDREData(
    supabase,
    user.id,
    period.start,
    period.end,
  )

  // Exclui saldo-inicial artificial e tx em cartão de crédito (mesma
  // regra do hero/Home pra DRE bater com o KPI de "Saída do mês").
  const creditAccountIds = getCreditAccountIds(accs)
  const txs = filterDREEffectiveTxs(txsRaw, creditAccountIds)
  const cats = catsRaw
  const catById = new Map(cats.map((c) => [c.id, c]))
  const formalIncomeIds = getFormalIncomeIds(cats)

  // Separa receitas e despesas
  const incomes = txs.filter((t) => t.type === "income")
  const expenses = txs.filter((t) => t.type === "expense")

  const receitas = buildIncomeGroups(incomes, catById, formalIncomeIds)
  const despesas = buildExpenseGroups(expenses, catById)

  const receitasArr = [...receitas.values()].sort(
    (a, b) => b.totalCents - a.totalCents,
  )
  const despesasArr = [...despesas.values()].sort(
    (a, b) => b.totalCents - a.totalCents,
  )

  const totals = computeTotals(receitasArr, despesasArr)
  const { receitaTotal, despesaTotal, resultado, margem } = totals

  // Meses disponíveis
  const allOccurredOn = await fetchAllOccurredOn(supabase, user.id)
  const { periodOptions, yearOptions } = buildAvailablePeriods(allOccurredOn, now)

  const displayName = resolveDisplayName(
    profileRaw,
    user.user_metadata as { display_name?: string; full_name?: string } | null,
    user.email,
  )
  const generatedAt = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  })

  const xlsxRows = buildDREXlsxRows({
    period,
    receitasArr,
    despesasArr,
    totals,
  })

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

      {/* RECEITAS — só operacional (renda de trabalho), mesma regra do hero */}
      <section className="avoid-break space-y-3 rounded-2xl border-2 border-border p-5">
        <h2 className="font-serif text-xl text-strong">RECEITAS</h2>

        <div className="space-y-3">
          {receitasArr.filter((r) => r.isFormal).length === 0 ? (
            <p className="pl-4 text-xs italic text-muted">
              Sem receitas operacionais no período.
            </p>
          ) : (
            receitasArr
              .filter((r) => r.isFormal)
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
