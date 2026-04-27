export const dynamic = "force-dynamic"
export const revalidate = 0

import { ArrowDown, ArrowUp, ArrowLeftRight, TrendingDown, TrendingUp } from "lucide-react"
import { requireOnboardedUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { formatBRL } from "@/lib/money"
import { formatInSaoPaulo, formatPtBrDateShort, monthBounds } from "@/lib/time"
import {
  fetchConciliacaoData,
  parsePendingCaptures,
} from "@/lib/reports/conciliacao-queries"
import {
  buildAccountRows,
  buildAvailableMonths,
  buildXlsxRows,
  computeExpenseSplit,
  computePendingTotals,
  filterEffectiveTxs,
  filterTxsByKnownAccounts,
  getCreditAccountIds,
  makePeriodPredicates,
  resolveDisplayName,
  splitFgtsAndSort,
  sumAccountsTotal,
} from "@/lib/reports/conciliacao-helpers"
import type { Tx, SearchParams } from "@/lib/reports/conciliacao-types"
import { PrintActions } from "./_components/PrintActions"
import { PeriodSelector } from "./_components/PeriodSelector"
import { AccountDetailSection } from "./_components/AccountDetailSection"
import { PendingSection } from "./_components/PendingSection"

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

  const { accounts, allTxRaw, pendingRaw, profileRaw } =
    await fetchConciliacaoData(supabase, user.id)

  const accs = accounts
  const creditAccountIds = getCreditAccountIds(accs)
  const rawTxs = filterTxsByKnownAccounts(allTxRaw, accs)
  const allTx = filterEffectiveTxs(rawTxs, creditAccountIds)
  const pendingCaptures = parsePendingCaptures(pendingRaw)

  const displayName = resolveDisplayName(
    profileRaw,
    user.user_metadata as
      | { display_name?: string; full_name?: string }
      | null,
    user.email,
  )

  let periodStart: string | null = null
  let periodEnd: string | null = null
  let periodLabel = "Histórico completo"
  if (!isFullHistory) {
    const b = monthBounds(periodo)
    periodStart = b.start
    periodEnd = b.end
    periodLabel = b.label
  }

  const { inPeriod, beforePeriod } = makePeriodPredicates(
    isFullHistory,
    periodStart,
    periodEnd,
  )

  const rows = buildAccountRows({
    accs,
    allTx,
    rawTxs,
    isFullHistory,
    inPeriod,
    beforePeriod,
  })

  const { cardFatureCents, nonCardExpenseCents } = computeExpenseSplit(rows)
  const { nonFgts, fgts, nonFgtsNonCredit } = splitFgtsAndSort(rows)

  const {
    pendingInPeriod,
    pendingIncomeCents,
    pendingExpenseCents,
    pendingNetCents,
  } = computePendingTotals(pendingCaptures, isFullHistory, periodStart, periodEnd)

  const accountsTotal = sumAccountsTotal(nonFgtsNonCredit)

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

  const xlsxRows = buildXlsxRows({
    nonFgts,
    fgts,
    pendingInPeriod,
    pendingIncomeCents,
    pendingExpenseCents,
    pendingNetCents,
    accountsTotal,
    totalIncomeCents,
    totalExpenseCents,
    projectedEndBalance,
  })

  const availableMonths = buildAvailableMonths(allTx, pendingCaptures, defaultYm)

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
                      {r.account.name} <span className="text-[10px] uppercase tracking-wider">(não entra no saldo)</span>
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
              {formatBRL(nonCardExpenseCents + pendingExpenseCents)}
            </span>
          </span>
          {cardFatureCents > 0 && (
            <span className="inline-flex items-center gap-1 text-muted">
              <span className="text-[10px]">cartão em aberto</span>
              <span className="font-mono">
                {formatBRL(cardFatureCents)}
              </span>
              <span className="text-[10px] italic">
                (sai do saldo quando pagar)
              </span>
            </span>
          )}
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

      <AccountDetailSection rows={[...nonFgts, ...fgts]} />

      <PendingSection
        pendingInPeriod={pendingInPeriod}
        pendingNetCents={pendingNetCents}
      />

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
