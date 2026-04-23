export const dynamic = "force-dynamic"
export const revalidate = 0

import { ArrowDown, ArrowUp, ArrowLeftRight, TrendingDown, TrendingUp } from "lucide-react"
import { requireOnboardedUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { untyped } from "@/lib/supabase/untyped"
import { formatBRL } from "@/lib/money"
import { formatInSaoPaulo, formatPtBrDateShort } from "@/lib/time"
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
  created_at: string
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

type PendingParsed = {
  id: string
  amount_cents: number
  type: "income" | "expense"
  occurred_on: string
  merchant: string | null
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

  const [
    { data: accounts },
    { data: allTxRaw },
    { data: pendingRaw },
    { data: profileRaw },
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, type, opening_balance_cents, created_at")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("sort_order"),
    // Fetch TODAS as tx (paid e unpaid). Filtro por account type acontece
    // depois: não-cartão só conta paid; cartão conta tudo (debt).
    untyped(supabase)
      .from("transactions")
      .select(
        "id, account_id, type, amount_cents, occurred_on, paid_at, created_at, merchant, is_transfer, category_id",
      )
      .eq("user_id", user.id)
      .order("occurred_on", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("capture_messages")
      .select("id, groq_parse_json")
      .eq("user_id", user.id)
      .eq("error", "no_account")
      .is("transaction_id", null),
    untyped(supabase)
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle(),
  ])

  const accs = (accounts ?? []) as AccountRow[]
  const creditAccountIds = new Set(
    accs.filter((a) => a.type === "credit").map((a) => a.id),
  )
  const rawTxs = ((allTxRaw ?? []) as Tx[]).filter((t) =>
    accs.some((a) => a.id === t.account_id),
  )
  // Regra: não-cartão só conta tx com paid_at setado (dinheiro que
  // realmente mexeu no saldo). Cartão conta tudo, charges são dívida
  // desde o swipe — saldo de cartão já inclui pending.
  const allTx = rawTxs.filter(
    (t) => creditAccountIds.has(t.account_id) || t.paid_at != null,
  )

  const pendingCaptures: PendingParsed[] = (pendingRaw ?? [])
    .map((c) => {
      const p = (c as { groq_parse_json: unknown }).groq_parse_json as {
        amount_cents?: number
        type?: "income" | "expense"
        occurred_on?: string
        merchant?: string | null
      } | null
      if (
        !p ||
        typeof p.amount_cents !== "number" ||
        (p.type !== "income" && p.type !== "expense") ||
        typeof p.occurred_on !== "string"
      ) {
        return null
      }
      return {
        id: (c as { id: string }).id,
        amount_cents: p.amount_cents,
        type: p.type,
        occurred_on: p.occurred_on,
        merchant: p.merchant ?? null,
      }
    })
    .filter((x): x is PendingParsed => x !== null)

  const displayName =
    (profileRaw as { display_name?: string | null } | null)?.display_name ??
    (user.user_metadata as { display_name?: string; full_name?: string } | null)
      ?.display_name ??
    (user.user_metadata as { full_name?: string } | null)?.full_name ??
    user.email ??
    ""

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

  const normalizeStr = (s: string) =>
    s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
  const bankKeyOf = (cardName: string): string => {
    const cleaned = cardName.replace(/cart[ãa]o.*/i, "").trim()
    return normalizeStr(cleaned.split(/\s+/)[0] ?? "")
  }

  // Detecta lump-sums de fatura de cartão em OUTRAS contas (merchant
  // "<banco> cartão" agendado). Esses entram no detalhamento do
  // cartão como "fatura a pagar" pra refletir a dívida real.
  function detectLumpSumsForCard(card: AccountRow): Tx[] {
    if (card.type !== "credit") return []
    const key = bankKeyOf(card.name)
    if (!key) return []
    return rawTxs.filter((t) => {
      if (t.account_id === card.id) return false
      if (t.is_transfer) return false
      if (t.type !== "expense") return false
      if (t.paid_at) return false // já pago
      const m = normalizeStr(t.merchant ?? "")
      return m.includes("cartao") && m.includes(key)
    })
  }

  const rows = accs.map((a) => {
    const own = allTx.filter((t) => t.account_id === a.id)
    const detectedLumpSums = detectLumpSumsForCard(a)
    const mine = [...own, ...detectedLumpSums]
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

  // Pendentes no período (sem conta atribuída) entram como bloco
  // separado — afetam o saldo projetado mas não pertencem a nenhuma
  // conta. Assim o saldo total do relatório reconcilia com o hero.
  const pendingInPeriod = pendingCaptures.filter((p) => {
    if (isFullHistory) return true
    return p.occurred_on >= periodStart! && p.occurred_on < periodEnd!
  })
  const pendingIncomeCents = pendingInPeriod
    .filter((p) => p.type === "income")
    .reduce((s, p) => s + p.amount_cents, 0)
  const pendingExpenseCents = pendingInPeriod
    .filter((p) => p.type === "expense")
    .reduce((s, p) => s + p.amount_cents, 0)
  const pendingNetCents = pendingIncomeCents - pendingExpenseCents

  const sum = (arr: typeof rows, field: keyof (typeof rows)[number]) =>
    arr.reduce((s, r) => s + (r[field] as number), 0)

  const accountsTotal = {
    startBalance: sum(nonFgts, "startBalance"),
    incomeCents: sum(nonFgts, "incomeCents"),
    expenseCents: sum(nonFgts, "expenseCents"),
    transferInCents: sum(nonFgts, "transferInCents"),
    transferOutCents: sum(nonFgts, "transferOutCents"),
    endBalance: sum(nonFgts, "endBalance"),
  }

  // Saldo projetado = saldo das contas + impacto das pendentes.
  // É o valor que aparece no card "Saldo total agora" do dashboard.
  const projectedEndBalance = accountsTotal.endBalance + pendingNetCents
  const totalIncomeCents = accountsTotal.incomeCents + pendingIncomeCents
  const totalExpenseCents = accountsTotal.expenseCents + pendingExpenseCents

  const proofOK =
    projectedEndBalance ===
    accountsTotal.startBalance +
      totalIncomeCents -
      totalExpenseCents +
      accountsTotal.transferInCents -
      accountsTotal.transferOutCents

  const generatedAt = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  })

  // XLSX guarda números como números — Excel aplica formato monetário
  // via "formato da célula" se o user quiser. Aqui entregamos reais (com
  // 2 decimais) como Number, não strings.
  const toReais = (cents: number) => Math.round(cents) / 100
  const xlsxRows: (string | number)[][] = [
    ["Conta", "Tipo", "Saldo inicial", "Entradas", "Saídas", "Transf. entrada", "Transf. saída", "Saldo final"],
    ...nonFgts.map((r) => [
      r.account.name,
      r.account.type,
      toReais(r.startBalance),
      toReais(r.incomeCents),
      toReais(r.expenseCents),
      toReais(r.transferInCents),
      toReais(r.transferOutCents),
      toReais(r.endBalance),
    ]),
    ...fgts.map((r) => [
      `${r.account.name} (FGTS, não entra no saldo)`,
      r.account.type,
      toReais(r.startBalance),
      toReais(r.incomeCents),
      toReais(r.expenseCents),
      toReais(r.transferInCents),
      toReais(r.transferOutCents),
      toReais(r.endBalance),
    ]),
  ]
  if (pendingInPeriod.length > 0) {
    xlsxRows.push([
      "PENDENTES (sem conta atribuída)",
      "pending",
      0,
      toReais(pendingIncomeCents),
      toReais(pendingExpenseCents),
      0,
      0,
      toReais(pendingNetCents),
    ])
  }
  xlsxRows.push([
    "TOTAL (ex-FGTS, com pendentes)",
    "",
    toReais(accountsTotal.startBalance),
    toReais(totalIncomeCents),
    toReais(totalExpenseCents),
    toReais(accountsTotal.transferInCents),
    toReais(accountsTotal.transferOutCents),
    toReais(projectedEndBalance),
  ])
  xlsxRows.push([])
  xlsxRows.push(["Detalhamento por conta"])
  xlsxRows.push(["Conta", "Data", "Tipo", "Descrição", "Transferência?", "Valor", "Saldo corrente"])
  for (const r of [...nonFgts, ...fgts]) {
    let running = r.startBalance
    xlsxRows.push([r.account.name, "—", "início", "Saldo inicial do período", "", "", toReais(running)])
    for (const t of r.within) {
      const delta = t.type === "income" ? t.amount_cents : -t.amount_cents
      running += delta
      xlsxRows.push([
        r.account.name,
        t.occurred_on,
        t.type === "income" ? "entrada" : "saída",
        t.merchant ?? "(sem descrição)",
        t.is_transfer ? "sim" : "não",
        toReais(delta),
        toReais(running),
      ])
    }
    xlsxRows.push([r.account.name, "—", "fim", "Saldo final do período", "", "", toReais(r.endBalance)])
  }

  // Meses disponíveis no dropdown: só aqueles que tiveram atividade
  // "real" — despesa, entrada formal ou pendente. Saldo inicial e
  // transferências não aparecem sozinhos (mês sem movimento humano).
  const monthsWithActivity = new Set<string>()
  for (const t of allTx) {
    if (t.is_transfer) continue
    monthsWithActivity.add(t.occurred_on.slice(0, 7))
  }
  for (const p of pendingCaptures) monthsWithActivity.add(p.occurred_on.slice(0, 7))
  // Garante que o mês atual apareça sempre, mesmo que vazio.
  monthsWithActivity.add(defaultYm)
  const availableMonths = [...monthsWithActivity]
    .sort()
    .reverse()
    .map((ym) => {
      const [yStr, mStr] = ym.split("-")
      const y = Number(yStr)
      const m = Number(mStr)
      return { value: ym, label: `${MONTH_NAMES_PT[m - 1]} ${y}` }
    })

  const fgtsEndBalance = fgts.reduce((s, r) => s + r.endBalance, 0)

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
          filename={`conciliacao-${isFullHistory ? "historico" : periodo}.xlsx`}
          sheetName={isFullHistory ? "Histórico" : periodLabel}
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
          · Gerado em {generatedAt} · {displayName}
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
                <th className="px-3 py-2 text-right">
                  <span className="inline-flex items-center justify-end gap-1">
                    <ArrowLeftRight className="h-3 w-3" />
                    Transf.
                  </span>
                </th>
                <th className="px-3 py-2 text-right">Saldo final</th>
              </tr>
            </thead>
            <tbody>
              {nonFgts.map((r) => {
                const transferNet = r.transferInCents - r.transferOutCents
                const netChange = r.endBalance - r.startBalance
                const TrendIcon =
                  netChange > 0 ? TrendingUp : netChange < 0 ? TrendingDown : null
                const trendColor =
                  netChange > 0
                    ? "text-income"
                    : netChange < 0
                      ? "text-expense"
                      : "text-strong"
                const first = r.within[0]
                const last = r.within[r.within.length - 1]
                const fmt = (t: Tx) =>
                  `${formatPtBrDateShort(t.occurred_on)} ${formatInSaoPaulo(new Date(t.created_at), "HH:mm")}`
                const rangeLabel =
                  first && last
                    ? first.id === last.id
                      ? fmt(first)
                      : `${fmt(first)} → ${fmt(last)}`
                    : null
                return (
                  <tr key={r.account.id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium text-strong">
                      <div>{r.account.name}</div>
                      {rangeLabel && (
                        <div className="mt-0.5 font-mono text-[10px] font-normal text-muted">
                          {rangeLabel}
                        </div>
                      )}
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
                    <td
                      className={`px-3 py-2 text-right font-mono font-semibold tabular-nums ${trendColor}`}
                    >
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {TrendIcon && <TrendIcon className="h-3.5 w-3.5" />}
                        {formatBRL(r.endBalance)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-subtle">
              {fgts.map((r) => {
                const transferNet = r.transferInCents - r.transferOutCents
                return (
                  <tr
                    key={r.account.id}
                    className="border-t border-dashed border-border text-muted"
                  >
                    <td className="px-3 py-2 italic">
                      {r.account.name} · FGTS (não entra no saldo)
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatBRL(r.startBalance)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {r.incomeCents > 0 ? `+ ${formatBRL(r.incomeCents)}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {r.expenseCents > 0 ? `− ${formatBRL(r.expenseCents)}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {transferNet === 0
                        ? "—"
                        : `${transferNet > 0 ? "+" : "−"} ${formatBRL(Math.abs(transferNet))}`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">
                      {formatBRL(r.endBalance)}
                    </td>
                  </tr>
                )
              })}
              {pendingInPeriod.length > 0 && (
                <tr className="border-t border-dashed border-border">
                  <td className="px-3 py-2 text-xs italic text-muted">
                    Pendentes (sem conta atribuída)
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-muted">
                    —
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-income">
                    {pendingIncomeCents > 0
                      ? `+ ${formatBRL(pendingIncomeCents)}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-expense">
                    {pendingExpenseCents > 0
                      ? `− ${formatBRL(pendingExpenseCents)}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-muted">
                    —
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-expense">
                    {formatBRL(pendingNetCents)}
                  </td>
                </tr>
              )}
              {(() => {
                const totalNetChange =
                  projectedEndBalance - accountsTotal.startBalance
                const TotalTrend =
                  totalNetChange > 0
                    ? TrendingUp
                    : totalNetChange < 0
                      ? TrendingDown
                      : null
                const totalTrendColor =
                  totalNetChange > 0
                    ? "text-income"
                    : totalNetChange < 0
                      ? "text-expense"
                      : "text-strong"
                return (
                  <tr className="border-t-2 border-border">
                    <td className="px-3 py-2 text-sm font-semibold uppercase tracking-wider text-strong">
                      Total ex-FGTS
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-strong">
                      {formatBRL(accountsTotal.startBalance)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-income">
                      + {formatBRL(totalIncomeCents)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-expense">
                      − {formatBRL(totalExpenseCents)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-muted">
                      0,00
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono font-semibold tabular-nums ${totalTrendColor}`}
                    >
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {TotalTrend && <TotalTrend className="h-4 w-4" />}
                        {formatBRL(projectedEndBalance)}
                      </span>
                    </td>
                  </tr>
                )
              })()}
            </tfoot>
          </table>
        </div>
        {fgts.length > 0 && (
          <p className="text-[11px] text-muted">
            FGTS {formatBRL(fgtsEndBalance)} listado acima em cinza — recurso
            bloqueado, fora do &ldquo;Saldo total agora&rdquo;.
          </p>
        )}
      </section>

      <section className="avoid-break space-y-3 rounded-2xl border-2 border-border bg-subtle p-5">
        <h2 className="text-sm font-medium uppercase tracking-wider text-strong">
          Prova matemática
        </h2>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 font-serif text-sm text-body">
          <span>Saldo inicial</span>
          <span className="font-mono font-semibold text-strong">
            {formatBRL(accountsTotal.startBalance)}
          </span>
          <span className="inline-flex items-center gap-1 text-income">
            <ArrowUp className="h-3.5 w-3.5" />
            entradas
            <span className="font-mono font-semibold">
              {formatBRL(totalIncomeCents)}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 text-expense">
            <ArrowDown className="h-3.5 w-3.5" />
            saídas
            <span className="font-mono font-semibold">
              {formatBRL(totalExpenseCents)}
            </span>
          </span>
          {(accountsTotal.transferInCents > 0 ||
            accountsTotal.transferOutCents > 0) && (
            <span className="inline-flex items-center gap-1 text-muted">
              <ArrowLeftRight className="h-3.5 w-3.5" />
              transf.
              <span className="font-mono">
                {formatBRL(
                  accountsTotal.transferInCents -
                    accountsTotal.transferOutCents,
                )}
              </span>
            </span>
          )}
          <span className="text-muted">=</span>
          {(() => {
            const delta = projectedEndBalance - accountsTotal.startBalance
            const color =
              delta > 0
                ? "text-income"
                : delta < 0
                  ? "text-expense"
                  : "text-strong"
            const Icon =
              delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : null
            return (
              <span
                className={`inline-flex items-center gap-1.5 font-mono text-base font-bold ${color}`}
              >
                {Icon && <Icon className="h-4 w-4" />}
                {formatBRL(projectedEndBalance)}
              </span>
            )
          })()}
          <span className={proofOK ? "text-income" : "text-expense"}>
            {proofOK ? "✓" : "✗"}
          </span>
        </div>
        <p className="text-xs text-muted">
          &ldquo;Saldo final&rdquo; aqui inclui{" "}
          {pendingInPeriod.length > 0
            ? `${pendingInPeriod.length} captura${pendingInPeriod.length === 1 ? "" : "s"} pendente${pendingInPeriod.length === 1 ? "" : "s"} (sem conta atribuída) — `
            : ""}
          é o mesmo valor do card &ldquo;Saldo total agora&rdquo; no dashboard.
          Cada conta listada acima reconcilia com o saldo exibido em{" "}
          <code className="rounded bg-canvas px-1 text-[10px]">/app/contas</code>.
        </p>
      </section>

      <section className="space-y-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-strong">
          Detalhamento por conta
        </h2>
        {[...nonFgts, ...fgts].map((r) => {
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
                    {(() => {
                      // Pré-calcula running balance em ordem cronológica
                      // asc, mas renderiza em ordem desc (mais recente em
                      // cima) — cada linha mostra o saldo NAQUELE ponto
                      // do tempo, preservando a conta correta.
                      const withRunning = r.within.map((t) => {
                        const delta =
                          t.type === "income" ? t.amount_cents : -t.amount_cents
                        running += delta
                        return { t, delta, runningAt: running }
                      })
                      return [...withRunning].reverse().map(({ t, delta, runningAt }) => {
                        const isIncome = delta >= 0
                        const hhmm = t.created_at
                          ? formatInSaoPaulo(new Date(t.created_at), "HH:mm")
                          : ""
                        return (
                          <tr key={t.id} className="border-b border-border/50">
                            <td className="py-1 text-body">
                              <span className="whitespace-nowrap">
                                {formatPtBrDateShort(t.occurred_on)}
                                {hhmm && (
                                  <span className="ml-1 text-[10px] text-muted">
                                    · {hhmm}
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="py-1 text-body">
                              <span className="inline-flex items-center gap-1.5">
                                {t.is_transfer ? (
                                  <ArrowLeftRight className="h-3 w-3 text-muted" />
                                ) : isIncome ? (
                                  <ArrowUp className="h-3 w-3 text-income" />
                                ) : (
                                  <ArrowDown className="h-3 w-3 text-expense" />
                                )}
                                {t.merchant ?? "(sem descrição)"}
                                {t.is_transfer && (
                                  <span className="ml-1 text-[10px] uppercase tracking-wider text-muted">
                                    transf.
                                  </span>
                                )}
                              </span>
                            </td>
                            <td
                              className={`py-1 text-right font-mono tabular-nums ${
                                isIncome ? "text-income" : "text-expense"
                              }`}
                            >
                              {isIncome ? "+" : "−"} {formatBRL(Math.abs(delta))}
                            </td>
                            <td className="py-1 text-right font-mono tabular-nums text-strong">
                              {formatBRL(runningAt)}
                            </td>
                          </tr>
                        )
                      })
                    })()}
                    {(() => {
                      const delta = r.endBalance - r.startBalance
                      const color =
                        delta > 0
                          ? "text-income"
                          : delta < 0
                            ? "text-expense"
                            : "text-strong"
                      const Icon =
                        delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : null
                      return (
                        <tr className="bg-subtle">
                          <td
                            className="py-1.5 text-[10px] font-semibold uppercase tracking-wider text-strong"
                            colSpan={3}
                          >
                            Saldo final
                          </td>
                          <td
                            className={`py-1.5 text-right font-mono font-semibold tabular-nums ${color}`}
                          >
                            <span className="inline-flex items-center justify-end gap-1.5">
                              {Icon && <Icon className="h-3.5 w-3.5" />}
                              {formatBRL(r.endBalance)}
                            </span>
                          </td>
                        </tr>
                      )
                    })()}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
      </section>

      {pendingInPeriod.length > 0 && (
        <section className="avoid-break space-y-3 rounded-xl border border-dashed border-border p-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-strong">
            Pendentes no período
          </h2>
          <p className="text-xs text-muted">
            Despesas capturadas sem conta atribuída. Já afetam o saldo total
            projetado. Atribua uma conta em /app pra tirar daqui.
          </p>
          <table className="w-full text-xs">
            <colgroup>
              <col style={{ width: "14%" }} />
              <col style={{ width: "66%" }} />
              <col style={{ width: "20%" }} />
            </colgroup>
            <thead className="border-b border-border text-[10px] uppercase tracking-wider text-muted">
              <tr>
                <th className="py-1.5 text-left">Data</th>
                <th className="py-1.5 text-left">Descrição</th>
                <th className="py-1.5 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {pendingInPeriod.map((p) => (
                <tr key={p.id} className="border-b border-border/50">
                  <td className="py-1 text-body">
                    {formatPtBrDateShort(p.occurred_on)}
                  </td>
                  <td className="py-1 text-body">
                    {p.merchant ?? "(sem descrição)"}
                  </td>
                  <td
                    className={`py-1 text-right font-mono tabular-nums ${
                      p.type === "income" ? "text-income" : "text-expense"
                    }`}
                  >
                    {p.type === "income" ? "+" : "−"}{" "}
                    {formatBRL(p.amount_cents)}
                  </td>
                </tr>
              ))}
              <tr className="bg-subtle">
                <td
                  className="py-1.5 text-[10px] font-semibold uppercase tracking-wider text-strong"
                  colSpan={2}
                >
                  Impacto no saldo
                </td>
                <td
                  className={`py-1.5 text-right font-mono font-semibold tabular-nums ${
                    pendingNetCents < 0 ? "text-expense" : "text-income"
                  }`}
                >
                  {formatBRL(pendingNetCents)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      <footer className="border-t border-border pt-4 text-[10px] text-muted">
        Caixa Forte · relatório de conciliação · Valores em BRL ·
        {` `}
        Transações pagas (paid_at ≠ NULL) + capturas pendentes (money já gasto
        mas ainda sem conta) compõem o saldo projetado. Agendadas futuras
        aparecem em área própria no dashboard.
      </footer>
    </article>
  )
}
