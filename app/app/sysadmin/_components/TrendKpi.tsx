"use client"

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import type { TrendDirection } from "@/lib/sysadmin/types"

function TrendIcon({ dir }: { dir: TrendDirection }) {
  if (dir === "rising") return <ArrowUpRight className="h-4 w-4 text-income" />
  if (dir === "falling") return <ArrowDownRight className="h-4 w-4 text-expense" />
  return <Minus className="h-4 w-4" />
}

export function TrendKpi({
  label,
  direction,
  why,
}: {
  label: string
  net: number
  direction: TrendDirection
  why?: string
}) {
  const status =
    direction === "rising"
      ? "Enriquecendo"
      : direction === "falling"
        ? "Empobrecendo"
        : "Estável"
  const color =
    direction === "rising"
      ? "text-income"
      : direction === "falling"
        ? "text-expense"
        : "text-muted"
  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-muted">
          <TrendIcon dir={direction} />
          {label}
        </div>
        <p
          className={`font-mono text-2xl font-semibold tabular-nums tracking-tight ${color}`}
        >
          {status}
        </p>
        {why && <p className="text-xs leading-snug text-body">{why}</p>}
      </CardContent>
    </Card>
  )
}
