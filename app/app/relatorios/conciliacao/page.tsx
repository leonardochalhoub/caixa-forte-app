export const dynamic = "force-dynamic"
export const revalidate = 0

import { requireOnboardedUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { untyped } from "@/lib/supabase/untyped"
import { formatBRL } from "@/lib/money"
import { formatPtBrDateShort } from "@/lib/time"
import { PrintActions } from "./_components/PrintActions"
import { PeriodSelector } from "./_components/PeriodSelector"
import { ThemeToggle } from "./_components/ThemeToggle"

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

type PendingParsed = {
  id: string
  amount_cents: number
  type: "income" | "expense"
  occurred_on: string
  merchant: string | null
}

interface SearchParams {
  periodo?: string
  tema?: string
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
  const isDarkTheme = sp.tema === "escuro"

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
    untyped(supabase)
      .from("transactions")
      .select(
        "id, account_id, type, amount_cents, occurred_on, paid_at, merchant, is_transfer, category_id",
      )
      .eq("user_id", user.id)
      .not("paid_at", "is", null)
      .order("occurred_on", { ascending: true }),
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
  const allTx = ((allTxRaw ?? []) as Tx[]).filter((t) =>
    // A conta pode ter sido arquivada; não queremos transações órfãs no relatório.
    accs.some((a) => a.id === t.account_id),
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
    <article
      className={`report-root space-y-8 ${isDarkTheme ? "report-dark" : ""}`}
    >
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector
          current={periodo}
          options={availableMonths}
          fullHistoryLabel="Histórico completo"
        />
        <div className="flex items-center gap-2">
          <ThemeToggle current={isDarkTheme ? "escuro" : "claro"} />
          <PrintActions
            rows={xlsxRows}
            filename={`conciliacao-${isFullHistory ? "historico" : periodo}.xlsx`}
            sheetName={isFullHistory ? "Histórico" : periodLabel}
          />
        </div>
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
                <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-strong">
                  {formatBRL(projectedEndBalance)}
                </td>
              </tr>
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

      <section className="space-y-3 rounded-2xl border-2 border-border bg-subtle p-5">
        <h2 className="text-sm font-medium uppercase tracking-wider text-strong">
          Prova matemática
        </h2>
        <p className="font-serif text-sm text-body">
          Saldo inicial{" "}
          <span className="font-mono text-strong">
            {formatBRL(accountsTotal.startBalance)}
          </span>{" "}
          + entradas{" "}
          <span className="font-mono text-income">
            {formatBRL(totalIncomeCents)}
          </span>{" "}
          − saídas{" "}
          <span className="font-mono text-expense">
            {formatBRL(totalExpenseCents)}
          </span>{" "}
          + transf. recebidas{" "}
          <span className="font-mono text-muted">
            {formatBRL(accountsTotal.transferInCents)}
          </span>{" "}
          − transf. enviadas{" "}
          <span className="font-mono text-muted">
            {formatBRL(accountsTotal.transferOutCents)}
          </span>{" "}
          ={" "}
          <span className="font-mono font-semibold text-strong">
            {formatBRL(projectedEndBalance)}
          </span>{" "}
          {proofOK ? "✓" : "✗"}
        </p>
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
