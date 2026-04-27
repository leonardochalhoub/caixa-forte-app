// Subcomponente server do Relatório de Conciliação. Renderiza a seção
// "Pendentes no período" — antes vivia inline no page.tsx (god-file).
// JSX preservado 1:1.

import { formatBRL } from "@/lib/money"
import { formatPtBrDateShort } from "@/lib/time"
import type { PendingParsed } from "@/lib/reports/conciliacao-types"

export function PendingSection({
  pendingInPeriod,
  pendingNetCents,
}: {
  pendingInPeriod: PendingParsed[]
  pendingNetCents: number
}) {
  if (pendingInPeriod.length === 0) return null
  return (
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
  )
}
