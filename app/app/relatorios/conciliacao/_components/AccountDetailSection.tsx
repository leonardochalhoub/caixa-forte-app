// Subcomponente server do Relatório de Conciliação. Renderiza a seção
// "Detalhamento por conta" — antes vivia inline no page.tsx (god-file).
// JSX preservado 1:1; só foi movido daqui pra cá.

import { ArrowDown, ArrowLeftRight, ArrowUp, TrendingDown, TrendingUp } from "lucide-react"
import { formatBRL } from "@/lib/money"
import { formatInSaoPaulo, formatPtBrDateShort } from "@/lib/time"
import type { AccountRowSummary } from "@/lib/reports/conciliacao-types"

export function AccountDetailSection({ rows }: { rows: AccountRowSummary[] }) {
  return (
    <section className="space-y-6">
      <h2 className="text-sm font-medium uppercase tracking-wider text-strong">
        Detalhamento por conta
      </h2>
      {rows.map((r) => {
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
                    return withRunning.map(({ t, delta, runningAt }) => {
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
  )
}
