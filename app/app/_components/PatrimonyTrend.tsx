"use client"

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { formatBRL, toReais } from "@/lib/money"

// Renderiza evolução patrimonial baseada em balance_snapshots.
// Conselho v3 (Planner + Finanças + Supabase): "balance_snapshots
// vazio é débito de provisão. Infra sem produto."
//
// Diferente do TrendStrip (entrada vs saída mensal), este componente
// mostra patrimônio total em pontos diários — captura efeitos cumulativos
// (incluindo deletes/edits em rows passadas, que recalcular sobre estado
// atual perderia).

interface SnapshotPoint {
  // ISO date "YYYY-MM-DD"
  date: string
  totalCents: number
}

export function PatrimonyTrend({ data }: { data: SnapshotPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted">
        Sem snapshots ainda — o cron diário começa a popular após o
        próximo deploy.
      </div>
    )
  }

  if (data.length === 1) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 text-center">
        <p className="font-mono text-2xl font-semibold tabular-nums text-strong">
          {formatBRL(data[0]!.totalCents)}
        </p>
        <p className="text-xs text-muted">
          1 snapshot registrado · gráfico aparece a partir do 2º dia
        </p>
      </div>
    )
  }

  const chartData = data.map((d) => ({
    label: d.date.slice(5), // "MM-DD"
    full: d.date,
    valor: toReais(d.totalCents),
  }))

  // Domínio: do menor patrimônio observado (ou 0 se positivo) ao maior.
  const min = Math.min(...chartData.map((d) => d.valor))
  const yMin = min < 0 ? min : 0

  return (
    <div
      className="h-56 w-full"
      role="img"
      aria-label="Evolução do patrimônio total ao longo dos últimos snapshots diários"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="patrimonyGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-ink)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--color-ink)" stopOpacity={0} />
            </linearGradient>
          </defs>
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
            width={56}
            domain={[yMin, "auto"]}
            tickFormatter={(v: number) =>
              Math.abs(v) >= 1000
                ? `${Math.round(v / 100) / 10}k`
                : v.toFixed(0)
            }
          />
          <Tooltip content={<PatrimonyTooltip />} cursor={{ stroke: "var(--color-border)" }} />
          <Area
            type="monotone"
            dataKey="valor"
            stroke="var(--color-ink)"
            strokeWidth={2}
            fill="url(#patrimonyGradient)"
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

interface TooltipPayloadItem {
  payload?: { full?: string; valor?: number }
}

function PatrimonyTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
}) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0]?.payload
  if (!row) return null
  const valor = row.valor ?? 0
  const isNeg = valor < 0
  return (
    <div className="rounded-lg border border-border bg-canvas px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-strong">{row.full}</p>
      <p
        className={`font-mono tabular-nums ${
          isNeg ? "text-expense" : "text-strong"
        }`}
      >
        {formatBRL(Math.round(valor * 100))}
      </p>
    </div>
  )
}
