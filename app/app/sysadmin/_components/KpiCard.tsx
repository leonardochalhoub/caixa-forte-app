"use client"

import { Card, CardContent } from "@/components/ui/card"

export function KpiCard({
  icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ReactNode
  label: string
  value: string
  subtitle?: string
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-muted">
          {icon}
          {label}
        </div>
        <p className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-strong">
          {value}
        </p>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </CardContent>
    </Card>
  )
}
