"use client"

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { MonthlyTotals } from "@/lib/analytics/periods"
import { formatBRL, toReais } from "@/lib/money"

export function TrendStrip({ data }: { data: MonthlyTotals[] }) {
  const chartData = data.map((d) => ({
    label: d.label,
    entradas: toReais(d.incomeCents),
    saidas: toReais(d.expenseCents),
    saldo: toReais(d.incomeCents - d.expenseCents),
  }))

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="label"
            stroke="var(--color-muted)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="var(--color-muted)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${Math.round(v / 100) / 10}k` : v.toFixed(0)
            }
          />
          <Tooltip content={<MonthTooltip />} cursor={{ stroke: "var(--color-border)" }} />
          <Line
            type="monotone"
            dataKey="entradas"
            stroke="var(--color-income)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="saidas"
            stroke="var(--color-expense)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

interface TooltipPayloadItem {
  payload?: { entradas?: number; saidas?: number; saldo?: number }
}

function MonthTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string | number
}) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0]?.payload
  if (!row) return null
  const entradas = row.entradas ?? 0
  const saidas = row.saidas ?? 0
  const saldo = row.saldo ?? entradas - saidas
  const saldoNeg = saldo < 0
  return (
    <div className="rounded-lg border border-border bg-canvas px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-strong">{String(label)}</p>
      <p className="font-mono tabular-nums text-income">
        Entradas : {formatBRL(Math.round(entradas * 100))}
      </p>
      <p className="font-mono tabular-nums text-expense">
        Saídas : {formatBRL(Math.round(saidas * 100))}
      </p>
      <p
        className={`mt-1 border-t border-border pt-1 font-mono tabular-nums ${
          saldoNeg ? "text-expense" : "text-income"
        }`}
      >
        Saldo : {saldo > 0 ? "+" : ""}
        {formatBRL(Math.round(saldo * 100))}
      </p>
    </div>
  )
}
