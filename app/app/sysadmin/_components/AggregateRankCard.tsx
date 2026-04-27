"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function AggregateRankCard({
  title,
  description,
  rows,
  emptyLabel,
}: {
  title: string
  description: string
  rows: Array<{ label: string; value: string; weight: number }>
  emptyLabel: string
}) {
  const max = Math.max(1, ...rows.map((r) => r.weight))
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{emptyLabel}</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((r) => {
              const pct = Math.max(4, Math.round((r.weight / max) * 100))
              return (
                <li key={r.label} className="flex items-center gap-3 text-xs">
                  <span className="w-28 shrink-0 truncate text-body" title={r.label}>
                    {r.label}
                  </span>
                  <div className="relative h-4 flex-1 overflow-hidden rounded bg-subtle">
                    <div
                      className="absolute inset-y-0 left-0 bg-strong/70"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right font-mono tabular-nums text-strong">
                    {r.value}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
