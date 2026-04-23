export const dynamic = "force-dynamic"
export const revalidate = 0

import { requireOnboardedUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { untyped } from "@/lib/supabase/untyped"
import { formatBRL } from "@/lib/money"
import { formatPtBrDateShort } from "@/lib/time"
import { PrintActions } from "./_components/PrintActions"
import { PeriodSelector } from "./_components/PeriodSelector"

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

type AccountRow = {
  id: string
  name: string
  type: string
  opening_balance_cents: number | null
  created_at: string
}

interface SearchParams {
  periodo?: string
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

export default async function ConciliacaoPage({
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

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name, type, opening_balance_cents, created_at")
    .eq("user_id", user.id)
    .is("archived_at", null)
    .order("sort_order")

  const accs = (accounts ?? []) as AccountRow[]

  const { data: allTxRaw } = await untyped(supabase)
    .from("transactions")
    .select(
      "id, account_id, type, amount_cents, occurred_on, paid_at, merchant, is_transfer, category_id",
    )
    .eq("user_id", user.id)
    .not("paid_at", "is", null)
    .order("occurred_on", { ascending: true })
  const allTx = (allTxRaw ?? []) as Tx[]

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
  const beforePeriod = (t: Tx) => {
    if (isFullHistory) return false
    return t.occurred_on < periodStart!
  }

  const rows = accs.map((a) => {
    const mine = allTx.filter((t) => t.account_id === a.id)
    const opening = Number(a.opening_balance_cents ?? 0)
    const before = mine.filter(beforePeriod)
    const within = mine.filter(inPeriod)

    const sumDelta = (txs: Tx[]) =>
      txs.reduce(
        (s, t) => s + (t.type === "income" ? t.amount_cents : -t.amount_cents),
        0,
      )

    const startBalance = isFullHistory ? opening : opening + sumDelta(before)
    const incomeCents = within
      .filter((t) => t.type === "income" && !t.is_transfer)
      .reduce((s, t) => s + t.amount_cents, 0)
    const expenseCents = within
      .filter((t) => t.type === "expense" && !t.is_transfer)
      .reduce((s, t) => s + t.amount_cents, 0)
    const transferInCents = within
      .filter((t) => t.type === "income" && t.is_transfer)
      .reduce((s, t) => s + t.amount_cents, 0)
    const transferOutCents = within
      .filter((t) => t.type === "expense" && t.is_transfer)
      .reduce((s, t) => s + t.amount_cents, 0)
    const endBalance =
      startBalance + incomeCents - expenseCents + transferInCents - transferOutCents

    return {
      account: a,
      opening,
      startBalance,
      incomeCents,
      expenseCents,
      transferInCents,
      transferOutCents,
      endBalance,
      within,
      before,
    }
  })

  const nonFgts = rows.filter((r) => r.account.type !== "fgts")
  const fgts = rows.filter((r) => r.account.type === "fgts")

  const sum = (arr: typeof rows, field: keyof (typeof rows)[number]) =>
    arr.reduce((s, r) => s + (r[field] as number), 0)

  const totals = {
    startBalance: sum(nonFgts, "startBalance"),
    incomeCents: sum(nonFgts, "incomeCents"),
    expenseCents: sum(nonFgts, "expenseCents"),
    transferInCents: sum(nonFgts, "transferInCents"),
    transferOutCents: sum(nonFgts, "transferOutCents"),
    endBalance: sum(nonFgts, "endBalance"),
  }

  const proofOK =
    totals.endBalance ===
    totals.startBalance +
      totals.incomeCents -
      totals.expenseCents +
      totals.transferInCents -
      totals.transferOutCents

  const generatedAt = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  })

  const csvRows: string[][] = [
    ["Conta", "Tipo", "Saldo inicial", "Entradas", "Saídas", "Transf. entrada", "Transf. saída", "Saldo final"],
    ...nonFgts.map((r) => [
      r.account.name,
      r.account.type,
      (r.startBalance / 100).toFixed(2),
      (r.incomeCents / 100).toFixed(2),
      (r.expenseCents / 100).toFixed(2),
      (r.transferInCents / 100).toFixed(2),
      (r.transferOutCents / 100).toFixed(2),
      (r.endBalance / 100).toFixed(2),
    ]),
    [
      "TOTAL (ex-FGTS)",
      "",
      (totals.startBalance / 100).toFixed(2),
      (totals.incomeCents / 100).toFixed(2),
      (totals.expenseCents / 100).toFixed(2),
      (totals.transferInCents / 100).toFixed(2),
      (totals.transferOutCents / 100).toFixed(2),
      (totals.endBalance / 100).toFixed(2),
    ],
  ]
  // Detalhamento linha a linha ao final do CSV
  csvRows.push([])
  csvRows.push(["Detalhamento por conta"])
  csvRows.push(["Conta", "Data", "Tipo", "Descrição", "Transferência?", "Valor", "Saldo corrente"])
  for (const r of nonFgts) {
    let running = r.startBalance
    csvRows.push([r.account.name, "—", "início", "Saldo inicial do período", "", "", (running / 100).toFixed(2)])
    for (const t of r.within) {
      const delta = t.type === "income" ? t.amount_cents : -t.amount_cents
      running += delta
      csvRows.push([
        r.account.name,
        t.occurred_on,
        t.type === "income" ? "entrada" : "saída",
        t.merchant ?? "(sem descrição)",
        t.is_transfer ? "sim" : "não",
        ((delta / 100)).toFixed(2),
        (running / 100).toFixed(2),
      ])
    }
    csvRows.push([r.account.name, "—", "fim", "Saldo final do período", "", "", (r.endBalance / 100).toFixed(2)])
  }
  const csvContent = csvRows
    .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n")

  // Lista de meses com atividade para o seletor
  const monthsWithActivity = new Set<string>()
  for (const t of allTx) monthsWithActivity.add(t.occurred_on.slice(0, 7))
  for (const a of accs) monthsWithActivity.add(a.created_at.slice(0, 7))
  const availableMonths = [...monthsWithActivity]
    .sort()
    .reverse()
    .map((ym) => {
      const [yStr, mStr] = ym.split("-")
      const y = Number(yStr)
      const m = Number(mStr)
      return { value: ym, label: `${MONTH_NAMES_PT[m - 1]} ${y}` }
    })

  return (
    <article className="report-root space-y-8">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector
          current={periodo}
          options={availableMonths}
          fullHistoryLabel="Histórico completo"
        />
        <PrintActions
          csvContent={csvContent}
          filename={`conciliacao-${isFullHistory ? "historico" : periodo}.csv`}
        />
      </div>

      <header className="space-y-1 border-b border-border pb-4">
        <p className="text-xs uppercase tracking-[0.22em] text-muted">
          Relatório de Conciliação
        </p>
        <h1 className="font-serif text-3xl text-strong">{periodLabel}</h1>
        <p className="text-xs text-muted">
          {isFullHistory ? (
            <>
              Da data de criação de cada conta até{" "}
              {new Date().toLocaleDateString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })}
              .
            </>
          ) : (
            <>
              De {formatPtBrDateShort(periodStart!)} até{" "}
              {formatPtBrDateShort(
                new Date(new Date(periodEnd!).getTime() - 86400000)
                  .toISOString()
                  .slice(0, 10),
              )}
              .
            </>
          )}{" "}
          · Gerado em {generatedAt} · {user.email}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-strong">
          Resumo do período
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <colgroup>
              <col style={{ width: "28%" }} />
              <col style={{ width: "14.4%" }} />
              <col style={{ width: "14.4%" }} />
              <col style={{ width: "14.4%" }} />
              <col style={{ width: "14.4%" }} />
              <col style={{ width: "14.4%" }} />
            </colgroup>
            <thead className="bg-subtle text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Conta</th>
                <th className="px-3 py-2 text-right">Saldo inicial</th>
                <th className="px-3 py-2 text-right">Entradas</th>
                <th className="px-3 py-2 text-right">Saídas</th>
                <th className="px-3 py-2 text-right">Transf. ↔</th>
                <th className="px-3 py-2 text-right">Saldo final</th>
              </tr>
            </thead>
            <tbody>
              {nonFgts.map((r) => {
                const transferNet = r.transferInCents - r.transferOutCents
                return (
                  <tr key={r.account.id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium text-strong">
                      {r.account.name}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-body">
                      {formatBRL(r.startBalance)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-income">
                      {r.incomeCents > 0 ? `+ ${formatBRL(r.incomeCents)}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-expense">
                      {r.expenseCents > 0 ? `− ${formatBRL(r.expenseCents)}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted">
                      {transferNet === 0
                        ? "—"
                        : `${transferNet > 0 ? "+" : "−"} ${formatBRL(Math.abs(transferNet))}`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-strong">
                      {formatBRL(r.endBalance)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-subtle">
              <tr className="border-t-2 border-border">
                <td className="px-3 py-2 text-sm font-semibold uppercase tracking-wider text-strong">
                  Total ex-FGTS
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-strong">
                  {formatBRL(totals.startBalance)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-income">
                  + {formatBRL(totals.incomeCents)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-expense">
                  − {formatBRL(totals.expenseCents)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-muted">
                  0,00
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-strong">
                  {formatBRL(totals.endBalance)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {fgts.length > 0 && (
          <p className="text-[11px] text-muted">
            FGTS (R$ {(fgts.reduce((s, r) => s + r.endBalance, 0) / 100).toFixed(2)})
            não entra no saldo total — recurso bloqueado.
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border-2 border-border bg-subtle p-5">
        <h2 className="text-sm font-medium uppercase tracking-wider text-strong">
          Prova matemática
        </h2>
        <p className="font-serif text-sm text-body">
          Saldo inicial{" "}
          <span className="font-mono text-strong">
            {formatBRL(totals.startBalance)}
          </span>{" "}
          + entradas{" "}
          <span className="font-mono text-income">
            {formatBRL(totals.incomeCents)}
          </span>{" "}
          − saídas{" "}
          <span className="font-mono text-expense">
            {formatBRL(totals.expenseCents)}
          </span>{" "}
          + transf. recebidas{" "}
          <span className="font-mono text-muted">
            {formatBRL(totals.transferInCents)}
          </span>{" "}
          − transf. enviadas{" "}
          <span className="font-mono text-muted">
            {formatBRL(totals.transferOutCents)}
          </span>{" "}
          ={" "}
          <span className="font-mono font-semibold text-strong">
            {formatBRL(totals.endBalance)}
          </span>{" "}
          {proofOK ? "✓" : "✗"}
        </p>
        <p className="text-xs text-muted">
          Saldo final de cada conta confere com o mostrado na dashboard (coluna
          &ldquo;Saldo final&rdquo; desta tabela). Somatório ex-FGTS é o
          &ldquo;Saldo total agora&rdquo;.
        </p>
      </section>

      <section className="space-y-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-strong">
          Detalhamento por conta
        </h2>
        {nonFgts.map((r) => {
          let running = r.startBalance
          return (
            <div
              key={r.account.id}
              className="avoid-break space-y-2 rounded-xl border border-border p-4"
            >
              <div className="flex items-baseline justify-between">
                <h3 className="font-medium text-strong">{r.account.name}</h3>
                <p className="text-xs text-muted">
                  Saldo inicial:{" "}
                  <span className="font-mono text-strong">
                    {formatBRL(r.startBalance)}
                  </span>
                </p>
              </div>
              {r.within.length === 0 ? (
                <p className="text-xs italic text-muted">
                  Sem movimentações no período.
                </p>
              ) : (
                <table className="w-full text-xs">
                  <colgroup>
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "52%" }} />
                    <col style={{ width: "17%" }} />
                    <col style={{ width: "17%" }} />
                  </colgroup>
                  <thead className="border-b border-border text-[10px] uppercase tracking-wider text-muted">
                    <tr>
                      <th className="py-1.5 text-left">Data</th>
                      <th className="py-1.5 text-left">Descrição</th>
                      <th className="py-1.5 text-right">Valor</th>
                      <th className="py-1.5 text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.within.map((t) => {
                      const delta =
                        t.type === "income" ? t.amount_cents : -t.amount_cents
                      running += delta
                      return (
                        <tr key={t.id} className="border-b border-border/50">
                          <td className="py-1 text-body">
                            {formatPtBrDateShort(t.occurred_on)}
                          </td>
                          <td className="py-1 text-body">
                            {t.merchant ?? "(sem descrição)"}
                            {t.is_transfer && (
                              <span className="ml-1.5 text-[10px] uppercase tracking-wider text-muted">
                                transf.
                              </span>
                            )}
                          </td>
                          <td
                            className={`py-1 text-right font-mono tabular-nums ${
                              delta >= 0 ? "text-income" : "text-expense"
                            }`}
                          >
                            {delta >= 0 ? "+" : "−"} {formatBRL(Math.abs(delta))}
                          </td>
                          <td className="py-1 text-right font-mono tabular-nums text-strong">
                            {formatBRL(running)}
                          </td>
                        </tr>
                      )
                    })}
                    <tr className="bg-subtle">
                      <td
                        className="py-1.5 text-[10px] font-semibold uppercase tracking-wider text-strong"
                        colSpan={3}
                      >
                        Saldo final
                      </td>
                      <td className="py-1.5 text-right font-mono font-semibold tabular-nums text-strong">
                        {formatBRL(r.endBalance)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
      </section>

      <footer className="border-t border-border pt-4 text-[10px] text-muted">
        Caixa Forte · relatório de conciliação · Valores em BRL ·
        {` `}
        Apenas transações pagas (paid_at ≠ NULL) entram no cálculo. Agendadas e
        pendentes aparecem em áreas próprias no dashboard.
      </footer>
    </article>
  )
}
